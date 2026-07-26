'use strict';
// Cross-check the implementation against the protocol document itself, rather than against
// hand-copied expectations. doc/protocol.txt is a plaintext extract of the Vallox RS485 PDF and is
// the authority for command bytes and the NTC conversion table.
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const vallox = require('../vallox/vallox.js');

const DOC = fs.readFileSync(path.join(__dirname, '..', 'doc', 'protocol.txt'), 'latin1');
// Second translation. It keeps the per-register and per-bit read/write markers that the pdftotext
// extract lost, so it is the authority for writability.
const DOC2 = fs.readFileSync(path.join(__dirname, '..', 'doc', 'vallox-rs485-protocol.md'), 'utf8');

function decodeFrame(command, arg) {
    const bytes = [0x01, 0x11, 0x21, command, arg];
    bytes.push(bytes.reduce((sum, b) => sum + b, 0) % 256);
    let message;
    vallox.decode(
        Buffer.from(bytes),
        (m) => (message = m),
        (e) => assert.fail(e)
    );
    return message;
}

describe('implementation versus doc/protocol.txt', function () {
    describe('Annex A NTC conversion table', function () {
        // Annex A lays out four "HEX DEC °C" column groups per row.
        function parseAnnexA() {
            const start = DOC.indexOf('ANNEX A');
            assert.notStrictEqual(start, -1, 'Annex A not found in the doc extract');
            const endB = DOC.indexOf('ANNEX B');
            const block = DOC.slice(start, endB > start ? endB : DOC.length);

            const table = new Map();
            const triple = /\b([0-9A-F]{2})\s+(\d{1,3})\s+(-?\d{1,3})\b/g;
            let m;
            while ((m = triple.exec(block)) !== null) {
                const hex = parseInt(m[1], 16);
                const dec = parseInt(m[2], 10);
                // the hex and decimal columns describe the same byte; anything else is a stray match
                if (hex !== dec) continue;
                table.set(dec, parseInt(m[3], 10));
            }
            return table;
        }

        const annexA = parseAnnexA();

        it('parses all 256 byte values out of the doc', function () {
            assert.strictEqual(annexA.size, 256);
        });

        it('decodes every temperature byte exactly as Annex A specifies', function () {
            const mismatches = [];
            for (const [byte, celsius] of annexA) {
                const decoded = decodeFrame(0x32, byte).value; // 0x32 = outdoor temperature
                if (decoded !== celsius) {
                    mismatches.push(`0x${byte.toString(16)}: doc ${celsius} !== code ${decoded}`);
                }
            }
            assert.deepStrictEqual(mismatches, []);
        });
    });

    describe('command byte coverage', function () {
        // Headings look like "- 29H CURRENT FAN SPEED" or "-06H   I / O port".
        const documented = new Set(
            (DOC.match(/^- ?([0-9A-F]{2})H/gm) || []).map((h) => parseInt(h.replace(/[^0-9A-F]/g, ''), 16))
        );

        const implemented = new Set();
        for (let command = 0; command <= 0xff; command++) {
            const name = decodeFrame(command, 0x01).variable;
            if (/^0x[0-9a-f]+$/.test(name) || name === 'GET') continue;
            implemented.add(command);
        }

        it('finds the documented variables in the doc extract', function () {
            assert.ok(documented.size > 40, `only found ${documented.size} variable headings`);
        });

        it('implements every variable the protocol documents', function () {
            const missing = [...documented].filter((c) => !implemented.has(c));
            assert.deepStrictEqual(
                missing.map((c) => '0x' + c.toString(16)),
                []
            );
        });

        it('maps only two bytes the protocol does not document', function () {
            // Flags1 (0x6c) and Flags3 (0x6e) are decoded as bare bits; the doc never defines them.
            const extra = [...implemented].filter((c) => !documented.has(c)).sort((a, b) => a - b);
            assert.deepStrictEqual(
                extra.map((c) => '0x' + c.toString(16)),
                ['0x6c', '0x6e']
            );
        });
    });

    describe('fan speed encoding', function () {
        it('uses the bit-ramp values the protocol lists for 29H', function () {
            // 01H, 03H, 07H, 0FH, 1FH, 3FH, 7FH, FFH
            const expected = [0x01, 0x03, 0x07, 0x0f, 0x1f, 0x3f, 0x7f, 0xff];
            for (let speed = 1; speed <= 8; speed++) {
                assert.strictEqual(vallox.convert('FanSpeed', speed).arg, expected[speed - 1]);
                assert.strictEqual(decodeFrame(0x29, expected[speed - 1]).value, speed);
            }
        });
    });

    describe('read/write classification', function () {
        // Registers the second translation marks "read only" on the heading itself. Anything
        // marked so must not be writable through this package.
        function readOnlyRegisters() {
            const result = [];
            const heading = /^### ([0-9A-F]{2})H ([^\n]*)$/gm;
            let m;
            while ((m = heading.exec(DOC2)) !== null) {
                if (/read only/i.test(m[2])) result.push(parseInt(m[1], 16));
            }
            return result;
        }

        const readOnly = readOnlyRegisters();

        it('finds the read-only markers in the doc', function () {
            // 06H 07H(bit only) 2AH-30H 32H-36H 57H 6DH 6FH 79H ...
            assert.ok(readOnly.length >= 14, `only found ${readOnly.length} read-only registers`);
            // the two that the pdftotext extract had lost
            assert.ok(readOnly.includes(0x57), '57H should be marked read only');
            assert.ok(readOnly.includes(0x79), '79H should be marked read only');
        });

        it('never allows writing a register the doc marks read only', function () {
            const violations = [];
            for (const command of readOnly) {
                const name = decodeFrame(command, 0x01).variable;
                if (/^0x[0-9a-f]+$/.test(name)) continue;
                if (!vallox.convert(name, 1).readonly) {
                    violations.push(`0x${command.toString(16)} ${name}`);
                }
            }
            assert.deepStrictEqual(violations, []);
        });

        it('keeps 8FH and 91H writable, since the doc marks them write only', function () {
            assert.match(DOC2, /### 8FH[^\n]*write only/i);
            assert.match(DOC2, /### 91H[^\n]*write only/i);
            assert.strictEqual(vallox.convert('Resume', 0).readonly, false);
            assert.strictEqual(vallox.convert('Suspend', 0).readonly, false);
        });

        it('keeps the registers with writable bits writable', function () {
            // A3H bits 0-3 are the panel keys, 71H bit 5 activates the fireplace switch.
            assert.match(DOC2, /bit 5 = Activation of the fireplace switch/);
            assert.strictEqual(vallox.convert('Select', 0).readonly, false);
            assert.strictEqual(vallox.convert('Flags6', 0).readonly, false);
        });
    });

    describe('the two translations agree', function () {
        it('on the NTC table, entry for entry', function () {
            const table = /## CONVERSION: NTC SENSOR SCALE[\s\S]*?```text\n([\s\S]*?)```/.exec(DOC2);
            assert.ok(table, 'NTC table not found in the second translation');

            let compared = 0;
            for (const line of table[1].split('\n')) {
                const cols = line.trim().split(/\s+/);
                if (cols.length < 12) continue;
                for (let group = 0; group < 4; group++) {
                    const hex = parseInt(cols[group * 3], 16);
                    const dec = parseInt(cols[group * 3 + 1], 10);
                    const celsius = parseInt(cols[group * 3 + 2], 10);
                    if (hex !== dec) continue;
                    assert.strictEqual(decodeFrame(0x32, dec).value, celsius, `byte ${dec}`);
                    compared++;
                }
            }
            assert.strictEqual(compared, 256);
        });

        it('on the humidity formula', function () {
            assert.match(DOC2, /\(x-51\)\s*\/\s*2[.,]04/);
            assert.match(DOC, /\(x-51\)\s*\/\s*2\.04/);
        });

        it('on the cell anti-freeze hysteresis being 03H per degree', function () {
            assert.match(DOC2, /03H` ≅ 1 °C/);
            assert.strictEqual(vallox.convert('CellDefrostingHysteresis', 1).arg, 3);
        });
    });

    describe('fault codes', function () {
        it('decodes each documented error number to a description', function () {
            for (const code of [5, 6, 7, 8, 9, 10]) {
                const value = decodeFrame(0x36, code).value;
                assert.strictEqual(typeof value, 'string');
                assert.doesNotMatch(value, /^0x/, `code ${code} should be described, not passed through`);
            }
            assert.strictEqual(decodeFrame(0x36, 0).value, 'No error');
        });
    });
});
