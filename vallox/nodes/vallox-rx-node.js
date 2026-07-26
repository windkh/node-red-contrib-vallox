/**
 * Created by Karl-Heinz Wind
 **/

const vallox = require('../vallox.js');

// Whatever is in front of this node decides what a payload looks like: a serial port delivers a
// Buffer, but an MQTT round-trip turns the same telegram into the JSON text "[1,33,17,...]", and
// some flows build a plain array by hand. Accept all of those and reject anything else with a
// message, rather than letting Buffer.concat throw out of an async handler and take the runtime
// down with it.
function toBuffer(payload) {
    if (Buffer.isBuffer(payload)) {
        return payload;
    }

    if (payload instanceof Uint8Array) {
        return Buffer.from(payload);
    }

    if (typeof payload === 'number') {
        if (!Number.isInteger(payload) || payload < 0 || payload > 255) {
            throw new Error('Payload is not a byte: ' + payload);
        }
        return Buffer.from([payload]);
    }

    if (typeof payload === 'string') {
        let parsed;
        try {
            parsed = JSON.parse(payload);
        } catch {
            // Almost always a source that decoded the bytes as text. An MQTT node set to
            // "auto-detect" does exactly this whenever a chunk happens to be valid UTF-8, and the
            // conversion is lossy, so the bytes cannot be recovered from here.
            const preview = Buffer.from(payload, 'binary').toString('hex').slice(0, 24);
            throw new Error(
                'Payload arrived as text (' +
                    payload.length +
                    ' chars, 0x' +
                    preview +
                    '), not bytes. Set the source node to deliver a Buffer' +
                    ' - on an MQTT node that is Output: "a Buffer", not "auto-detect".'
            );
        }
        return toBuffer(parsed);
    }

    if (Array.isArray(payload)) {
        for (const value of payload) {
            if (!Number.isInteger(value) || value < 0 || value > 255) {
                throw new Error('Payload contains a value that is not a byte: ' + JSON.stringify(value));
            }
        }
        return Buffer.from(payload);
    }

    if (payload === undefined || payload === null) {
        throw new Error('Payload is empty.');
    }

    throw new Error('Payload must be a Buffer, an array of bytes or a string holding one, got ' + typeof payload + '.');
}

// The vallox receiver node.
module.exports = function (RED) {
    'use strict';

    function ValloxRxNode(config) {
        RED.nodes.createNode(this, config);
        let node = this;

        // Diagnostics. Off by default; nothing below runs unless the node is configured for it.
        const debugEnabled = config.debug === true || config.debug === 'true';
        const capturePath = (config.capturefile || '').trim();
        let captureStream;
        const stats = {
            chunks: 0,
            bytes: 0,
            frames: 0,
            checksumErrors: 0,
            droppedBytes: 0,
            badPayloads: 0,
            repeatedChecksums: 0,
        };

        const hex = function (bytes) {
            return Buffer.from(bytes).toString('hex').replace(/(..)/g, '$1 ').trim();
        };

        const trace = function (message) {
            if (debugEnabled) {
                node.log(message);
            }
        };

        const showStats = function () {
            if (!debugEnabled) {
                return;
            }
            // A healthy stream is one frame per six bytes and no errors.
            const expected = Math.floor(stats.bytes / vallox.constants.VALLOX_LENGTH);
            node.status({
                fill: stats.checksumErrors > 0 || stats.droppedBytes > 0 ? 'yellow' : 'green',
                shape: 'dot',
                text:
                    stats.bytes +
                    ' B, ' +
                    stats.frames +
                    '/' +
                    expected +
                    ' frames, ' +
                    stats.droppedBytes +
                    ' dropped, ' +
                    stats.checksumErrors +
                    ' bad',
            });
        };

        const capture = function (bytes) {
            if (!capturePath) {
                return;
            }
            try {
                if (captureStream === undefined) {
                    // require lazily: the node has no runtime dependencies and this path is opt-in
                    captureStream = require('node:fs').createWriteStream(capturePath, { flags: 'a' });
                    captureStream.on('error', function (error) {
                        node.warn('Cannot write the capture file: ' + error.message);
                        captureStream = null;
                    });
                }
                if (captureStream) {
                    captureStream.write(Buffer.from(bytes));
                }
            } catch (error) {
                node.warn('Cannot open the capture file: ' + error.message);
                captureStream = null;
            }
        };

        let buffer;
        this.enqueue = function (rawBytes) {
            if (buffer !== undefined) {
                buffer = Buffer.concat([buffer, rawBytes]);
            } else {
                buffer = rawBytes;
            }
        };

        // Find the next candidate frame without consuming it. 0x01 is only a *probable* frame
        // start - it is also a legal sender, command, argument or checksum value - so the caller
        // decides what to consume once the checksum has had its say.
        this.peek = function () {
            if (buffer === undefined || buffer.length < vallox.constants.VALLOX_LENGTH) {
                return undefined;
            }

            for (let i = 0; i < buffer.length; i++) {
                if (buffer[i] !== vallox.constants.VALLOX_DOMAIN) {
                    continue;
                }

                let offsetEnd = i + vallox.constants.VALLOX_LENGTH;
                if (offsetEnd > buffer.length) {
                    // start of a frame that has not arrived in full yet
                    return undefined;
                }

                return { candidate: buffer.slice(i, offsetEnd), skipped: i };
            }

            // nothing that could start a frame: keep the last few bytes, they may precede one
            buffer = buffer.slice(Math.max(0, buffer.length - vallox.constants.VALLOX_LENGTH + 1));
            return undefined;
        };

        this.consume = function (count) {
            buffer = buffer.slice(count);
        };

        // True when the byte after the frame at `start` repeats that frame's checksum, as a write
        // telegram does. A byte that could itself start a valid frame is left alone.
        this.hasRepeatedChecksum = function (start) {
            const end = start + vallox.constants.VALLOX_LENGTH;
            if (buffer === undefined || end >= buffer.length) {
                return false;
            }
            if (buffer[end] !== buffer[end - 1]) {
                return false;
            }
            if (buffer[end] !== vallox.constants.VALLOX_DOMAIN) {
                return true;
            }

            // the repeat is 0x01: only treat it as one if it does not begin a valid frame
            let sum = 0;
            for (let i = 0; i < vallox.constants.VALLOX_LENGTH - 1; i++) {
                sum += buffer[end + i];
            }
            const wouldBeFrame =
                end + vallox.constants.VALLOX_LENGTH <= buffer.length &&
                buffer[end + vallox.constants.VALLOX_LENGTH - 1] === sum % 256;
            return !wouldBeFrame;
        };

        this.reportSkipped = function (skipped) {
            if (skipped > 0) {
                // bytes before a frame start: the tail of a frame we joined late, or damage
                stats.droppedBytes += skipped;
                node.warn('Dropped ' + skipped + ' bytes.');
            }
        };

        this.on('input', async function (msg) {
            // Nothing below may throw: this handler is async, so an exception escaping it becomes
            // an unhandled rejection and stops the whole Node-RED process.
            let bytes;
            try {
                bytes = toBuffer(msg.payload);
            } catch (error) {
                stats.badPayloads++;
                node.status({
                    fill: 'red',
                    shape: 'ring',
                    text: error.message,
                });

                node.warn(error.message);
                node.send([null, Object.assign({}, msg, { payload: error.message })]);
                return;
            }

            stats.chunks++;
            stats.bytes += bytes.length;
            capture(bytes);
            trace('rx ' + bytes.length + ' bytes: ' + hex(bytes));
            node.enqueue(bytes);

            for (;;) {
                let next = node.peek();
                if (next === undefined) {
                    break;
                }

                let decoded = false;
                vallox.decode(
                    next.candidate,
                    function (message) {
                        decoded = true;
                        // Annex B: a write telegram is followed by its checksum a second time
                        // ("this last message MUST be followed by sending its CHECKSUM twice").
                        // Real panels do this, so tolerate the repeat instead of resynchronising
                        // through it. Only when the byte cannot itself begin a frame, otherwise a
                        // following frame whose checksum happens to match would be eaten.
                        let repeated = node.hasRepeatedChecksum(next.skipped);
                        node.consume(next.skipped + vallox.constants.VALLOX_LENGTH + (repeated ? 1 : 0));
                        node.reportSkipped(next.skipped);
                        stats.frames++;
                        if (repeated) {
                            stats.repeatedChecksums++;
                        }
                        trace(
                            'frame ok: ' +
                                hex(next.candidate) +
                                (repeated ? ' +checksum repeated' : '') +
                                ' -> ' +
                                message.variable
                        );

                        node.status({
                            fill: 'green',
                            shape: 'ring',
                            text: 'ok',
                        });

                        // emit a fresh msg per frame: multiple back-to-back frames in
                        // one input buffer would otherwise alias the same payload slot.
                        node.send([Object.assign({}, msg, { payload: message }), null]);
                    },
                    function (errorMessage) {
                        // The checksum says this is not a frame, so 0x01 was a byte inside one.
                        // Give up only that byte: a real frame may start further into the window,
                        // and consuming all six would swallow its start byte and lose it too.
                        node.consume(next.skipped + 1);
                        stats.checksumErrors++;
                        stats.droppedBytes += next.skipped + 1;
                        trace('checksum fail: ' + hex(next.candidate) + ' (giving up 1 byte, rescanning)');

                        node.status({
                            fill: 'red',
                            shape: 'ring',
                            text: errorMessage,
                        });

                        node.warn(errorMessage);
                        node.send([null, Object.assign({}, msg, { payload: errorMessage })]);
                    }
                );

                // decode is synchronous; guard against a future change that makes it not so
                if (!decoded && buffer !== undefined && buffer.length >= vallox.constants.VALLOX_LENGTH) {
                    continue;
                }
            }

            // in debug mode the status carries the counters rather than the last event
            showStats();
        });

        this.on('close', function (done) {
            node.status({});
            if (captureStream) {
                captureStream.end();
                captureStream = undefined;
            }
            done();
        });
    }
    RED.nodes.registerType('valloxrx', ValloxRxNode);
};
