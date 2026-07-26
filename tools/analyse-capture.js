#!/usr/bin/env node
'use strict';
// Analyse a raw capture written by the valloxrx node's "Capture file" option.
//
//   node tools/analyse-capture.js <file>
//
// A healthy capture is a clean concatenation of 6-byte frames. Where it is not, this reports
// whether a byte went missing, an extra byte appeared, or a byte was corrupted in place - which is
// what distinguishes a lossy transport from a noisy bus.

const fs = require('node:fs');
const vallox = require('../vallox/vallox.js');

const LEN = vallox.constants.VALLOX_LENGTH;
const DOMAIN = vallox.constants.VALLOX_DOMAIN;

const file = process.argv[2];
if (!file) {
    console.error('usage: node tools/analyse-capture.js <capture file>');
    process.exit(2);
}

const data = fs.readFileSync(file);

function isFrame(buf, offset) {
    if (offset + LEN > buf.length) return false;
    let sum = 0;
    for (let i = 0; i < LEN - 1; i++) sum += buf[offset + i];
    return buf[offset] === DOMAIN && buf[offset + LEN - 1] === sum % 256;
}

function decode(buf, offset) {
    let message;
    vallox.decode(
        buf.slice(offset, offset + LEN),
        (m) => (message = m),
        () => {}
    );
    return message;
}

function hex(buf, from, to) {
    return Buffer.from(buf.slice(Math.max(0, from), Math.min(buf.length, to)))
        .toString('hex')
        .replace(/(..)/g, '$1 ')
        .trim();
}

// Walk the capture. At each position either a frame starts, or we have a break: report it and
// resynchronise on the next offset that starts a run of at least two valid frames.
function nextSync(buf, from) {
    for (let i = from; i + LEN * 2 <= buf.length; i++) {
        if (isFrame(buf, i) && isFrame(buf, i + LEN)) return i;
    }
    for (let i = from; i + LEN <= buf.length; i++) {
        if (isFrame(buf, i)) return i;
    }
    return -1;
}

// Annex B: a write telegram is followed by its checksum a second time. That extra byte is part of
// the protocol, not damage, so count it rather than reporting it as a break.
function repeatsChecksum(buf, offset) {
    const end = offset + LEN;
    if (end >= buf.length || buf[end] !== buf[end - 1]) return false;
    if (buf[end] !== DOMAIN) return true;
    return !isFrame(buf, end);
}

const variables = new Map();
const breaks = [];
let frames = 0;
let writes = 0;
let offset = nextSync(data, 0);
const leadIn = offset < 0 ? data.length : offset;

while (offset >= 0 && offset + LEN <= data.length) {
    if (isFrame(data, offset)) {
        frames++;
        const message = decode(data, offset);
        if (message) variables.set(message.variable, (variables.get(message.variable) || 0) + 1);
        offset += LEN;
        if (repeatsChecksum(data, offset - LEN)) {
            writes++;
            offset++;
        }
        continue;
    }

    // A break. Work out the smallest edit that would have made this position a frame.
    const resync = nextSync(data, offset);
    const gap = resync < 0 ? data.length - offset : resync - offset;
    let verdict;
    let kind;
    if (gap % LEN === 0) {
        kind = 'corrupted';
        verdict = 'CORRUPTED - alignment kept, ' + gap / LEN + ' frame(s) unreadable';
    } else if (gap % LEN === LEN - 1) {
        kind = 'lost';
        verdict = 'BYTE LOST - the stream realigns one byte early';
    } else if (gap % LEN === 1) {
        kind = 'extra';
        verdict = 'EXTRA BYTE - the stream realigns one byte late';
    } else {
        kind = 'foreign';
        verdict = 'FOREIGN DATA - ' + gap + ' bytes that are not Vallox frames';
    }

    breaks.push({ offset, gap, kind, verdict, context: hex(data, offset - 6, offset + 12) });
    if (resync < 0) break;
    offset = resync;
}

const expected = Math.floor((data.length - leadIn) / LEN);
console.log('capture         :', file);
console.log('bytes           :', data.length);
if (leadIn > 0) console.log('lead-in ignored :', leadIn, 'bytes before the first frame');
console.log('frames decoded  :', frames, 'of', expected, 'that the byte count allows');
if (writes > 0) {
    console.log('7-byte writes   :', writes, '(checksum sent twice, per Annex B - normal traffic)');
}
console.log('breaks          :', breaks.length);
if (expected > 0) {
    console.log('frame yield     :', ((frames / expected) * 100).toFixed(1) + '%');
}

if (breaks.length) {
    console.log('\nfirst breaks (offset, verdict, surrounding bytes):');
    for (const b of breaks.slice(0, 20)) {
        console.log('  @' + String(b.offset).padStart(7), '|', b.verdict);
        console.log('           ', b.context);
    }
    if (breaks.length > 20) console.log('  ... and', breaks.length - 20, 'more');

    const count = (kind) => breaks.filter((b) => b.kind === kind).length;
    const lost = count('lost');
    const extra = count('extra');
    const corrupt = count('corrupted');
    const foreign = count('foreign');
    console.log(
        '\nverdict summary : lost-byte',
        lost,
        '| extra-byte',
        extra,
        '| corrupted',
        corrupt,
        '| foreign data',
        foreign
    );

    const ranked = [
        [
            foreign,
            'Runs that are not whole Vallox frames. Either another device is transmitting\n' +
                '(check for a Modbus poll or a UART keepalive on the gateway - a constant run\n' +
                'length means a periodic poll), or these are damaged frames spliced together,\n' +
                'which the byte values will tell you: look for sender/receiver values outside\n' +
                '10H-2FH and for fragments of the frames printed either side.',
        ],
        [
            lost + extra,
            'Bytes are going missing or arriving twice: that is a transport problem\n' +
                '(gateway chunking, MQTT QoS, broker or client queueing), not line noise.',
        ],
        [
            corrupt,
            'Byte values are wrong but the length is right: that points at the RS485 line\n' +
                'itself - collisions, termination or biasing.',
        ],
    ].sort((a, b) => b[0] - a[0]);
    console.log(ranked[0][1]);
    if (foreign > 0) {
        const sizes = [...new Set(breaks.filter((b) => b.kind === 'foreign').map((b) => b.gap))];
        console.log('\nforeign run length(s):', sizes.join(', '), 'bytes - a repeated size is a periodic poll.');
    }
} else {
    console.log('\nThe capture is a clean run of frames. Nothing is being lost or corrupted.');
}

if (variables.size) {
    console.log('\nvariables seen:');
    for (const [name, count] of [...variables].sort((a, b) => b[1] - a[1])) {
        console.log('  ' + String(count).padStart(6), name);
    }
}
