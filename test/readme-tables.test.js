'use strict';
// The README command reference is generated from the protocol module. These tests fail if the two
// drift apart, so the documentation cannot silently rot as variables are added or reclassified.
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const vallox = require('../vallox/vallox.js');

const README = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

// --- what the code says -------------------------------------------------------------------------

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

function variablesFromCode() {
    const result = [];
    for (let command = 0; command <= 0xff; command++) {
        const message = decodeFrame(command, 0x01);
        // unmapped bytes decode to a "0x.." placeholder name; GET is not a variable
        if (/^0x[0-9a-f]+$/.test(message.variable) || message.variable === 'GET') continue;
        result.push({
            name: message.variable,
            command,
            readonly: vallox.convert(message.variable, 1).readonly,
        });
    }
    return result;
}

// --- what the README says -----------------------------------------------------------------------

function tableAfter(heading) {
    const start = README.indexOf('## ' + heading);
    assert.notStrictEqual(start, -1, `README is missing the "${heading}" heading`);
    const rest = README.slice(start);
    const rows = [];
    for (const line of rest.split('\n').slice(1)) {
        if (line.startsWith('## ')) break;
        const m = /^\|\s*`([A-Za-z0-9]+)`\s*\|\s*`0x([0-9a-f]{2})`\s*\|/.exec(line);
        if (m) rows.push({ name: m[1], command: parseInt(m[2], 16) });
    }
    return rows;
}

// --- tests --------------------------------------------------------------------------------------

describe('README command reference', function () {
    const code = variablesFromCode();
    const writable = tableAfter('Writable variables');
    const readonly = tableAfter('Read-only variables');

    it('documents every variable the code maps, and no others', function () {
        const documented = [...writable, ...readonly].map((r) => r.name).sort();
        const known = code.map((r) => r.name).sort();
        assert.deepStrictEqual(documented, known);
    });

    it('lists the correct command byte for every variable', function () {
        for (const row of [...writable, ...readonly]) {
            const entry = code.find((c) => c.name === row.name);
            assert.strictEqual(row.command, entry.command, `${row.name} command byte`);
        }
    });

    it('puts each variable in the table matching its readonly flag', function () {
        for (const row of writable) {
            const entry = code.find((c) => c.name === row.name);
            assert.strictEqual(entry.readonly, false, `${row.name} is documented as writable`);
        }
        for (const row of readonly) {
            const entry = code.find((c) => c.name === row.name);
            assert.strictEqual(entry.readonly, true, `${row.name} is documented as read-only`);
        }
    });

    it('documents the fields of every object-valued variable', function () {
        const objectVars = code.filter((c) => typeof decodeFrame(c.command, 0x00).value === 'object');
        assert.ok(objectVars.length > 0);
        for (const v of objectVars) {
            const fields = Object.keys(decodeFrame(v.command, 0x00).value);
            const row = new RegExp('^\\|\\s*`' + v.name + '`\\s*\\|(.+)$', 'm').exec(
                README.slice(README.indexOf('## Decoded bit fields'))
            );
            assert.ok(row, `${v.name} missing from the bit-field table`);
            for (const field of fields) {
                assert.ok(row[1].includes('`' + field + '`'), `${v.name}.${field} not documented`);
            }
        }
    });
});
