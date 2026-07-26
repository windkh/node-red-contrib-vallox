'use strict';
// The example flows are shipped in the npm package and imported from the Node-RED editor, so a
// broken one is user-visible. These tests check every flow is structurally sound and that the
// requests and frames the examples contain are ones this package can actually handle.
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const vallox = require('../vallox/vallox.js');

const DIR = path.join(__dirname, '..', 'examples');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));

describe('example flows', function () {
    it('ships at least the documented examples', function () {
        for (const expected of [
            'vallox.json',
            'valloxrx.json',
            'valloxtx.json',
            'vallox-commands.json',
            'vallox-monitor.json',
            'vallox-dashboard.json',
        ]) {
            assert.ok(files.includes(expected), `${expected} is missing`);
        }
    });

    for (const file of files) {
        describe(file, function () {
            const nodes = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));

            it('is an array of nodes that all have an id and a type', function () {
                assert.ok(Array.isArray(nodes), 'flow must be a JSON array');
                assert.ok(nodes.length > 0);
                for (const node of nodes) {
                    assert.ok(node.id, 'node without id');
                    assert.ok(node.type, `node ${node.id} without type`);
                }
            });

            it('has unique node ids', function () {
                const ids = nodes.map((n) => n.id);
                assert.strictEqual(new Set(ids).size, ids.length);
            });

            it('only wires to nodes that exist in the same flow', function () {
                const ids = new Set(nodes.map((n) => n.id));
                for (const node of nodes) {
                    for (const port of node.wires || []) {
                        for (const target of port) {
                            assert.ok(ids.has(target), `${node.id} wires to unknown node ${target}`);
                        }
                    }
                }
            });

            it("wires this package's nodes within their output count", function () {
                const outputs = { valloxrx: 2, valloxtx: 2, vallox: 3 };
                for (const node of nodes) {
                    if (outputs[node.type] === undefined) continue;
                    assert.ok(
                        (node.wires || []).length <= outputs[node.type],
                        `${node.type} ${node.id} has ${node.wires.length} output ports, max ${outputs[node.type]}`
                    );
                }
            });
        });
    }

    describe('vallox-commands.json requests', function () {
        const nodes = JSON.parse(fs.readFileSync(path.join(DIR, 'vallox-commands.json'), 'utf8'));
        const requests = nodes
            .filter((n) => n.type === 'inject' && n.payloadType === 'json')
            .map((n) => JSON.parse(n.payload));

        it('demonstrates every writable variable exactly once', function () {
            const writable = [];
            for (let command = 0; command <= 0xff; command++) {
                const bytes = [0x01, 0x11, 0x21, command, 0x01];
                bytes.push(bytes.reduce((sum, b) => sum + b, 0) % 256);
                let name;
                vallox.decode(
                    Buffer.from(bytes),
                    (m) => (name = m.variable),
                    (e) => assert.fail(e)
                );
                if (/^0x[0-9a-f]+$/.test(name) || name === 'GET') continue;
                // 8FH / 91H halt bus traffic for every module, so a click-to-send example
                // deliberately leaves them out.
                if (name === 'Suspend' || name === 'Resume') continue;
                if (!vallox.convert(name, 1).readonly) writable.push(name);
            }
            const shown = requests.map((r) => r.variable).sort();
            assert.deepStrictEqual(shown, writable.sort());
        });

        it('sends only SET requests that encode to a single byte', function () {
            for (const req of requests) {
                assert.strictEqual(req.request, 'SET', `${req.variable} should be a SET`);
                const { arg, readonly } = vallox.convert(req.variable, req.value);
                assert.strictEqual(readonly, false, `${req.variable} is readonly`);
                assert.ok(
                    Number.isInteger(arg) && arg >= 0 && arg <= 255,
                    `${req.variable} = ${req.value} encodes to ${arg}, which is not a byte`
                );
            }
        });
    });

    describe('vallox-dashboard.json', function () {
        const nodes = JSON.parse(fs.readFileSync(path.join(DIR, 'vallox-dashboard.json'), 'utf8'));

        it('references only variables the package implements', function () {
            // the register names live inside JSONata strings and function bodies, so scan the raw
            // text and tolerate whatever escaping the surrounding JSON applied
            // two forms appear: \"variable\":\"Name\" inside a JSONata string, and
            // variable: "Name" inside a function body, so the quote before the colon is optional
            const raw = fs.readFileSync(path.join(DIR, 'vallox-dashboard.json'), 'utf8');
            const named = new Set([...raw.matchAll(/variable\\*"?\s*:\s*\\*"([A-Za-z0-9]+)/g)].map((m) => m[1]));
            assert.ok(named.size >= 8, `expected many registers, found ${named.size}: ${[...named]}`);
            assert.ok(named.has('Select'), 'the Select read-modify-write should be exercised');
            assert.ok(named.has('FanSpeed'), 'the fan speed control should be exercised');
            for (const name of named) {
                assert.notStrictEqual(vallox.convert(name, 1).command, undefined, `unknown variable ${name}`);
            }
        });

        it('shows all four temperatures', function () {
            // They went missing once: the group holding them was lost on import, and a dashboard
            // without the four air temperatures is not much of a ventilation dashboard.
            const raw = fs.readFileSync(path.join(DIR, 'vallox-dashboard.json'), 'utf8');
            for (const field of [
                'TemperatureOutside',
                'TemperatureIncoming',
                'TemperatureInside',
                'TemperatureExhaust',
            ]) {
                assert.ok(raw.includes(field), `${field} is not on the dashboard`);
            }
        });

        it('ships no ui_base, which would collide with an existing dashboard', function () {
            assert.strictEqual(nodes.filter((n) => n.type === 'ui_base').length, 0);
        });

        it('wires every input widget to something', function () {
            for (const w of nodes.filter((n) => /^ui_(slider|numeric|switch|button)$/.test(n.type))) {
                assert.ok((w.wires[0] || []).length > 0, `${w.name} sends nowhere`);
            }
        });

        it('only writes registers that are writable', function () {
            const writes = nodes.filter((n) => /^SET /.test(n.name || ''));
            assert.ok(writes.length > 5, 'expected several write handlers');
            for (const node of writes) {
                // handlers are named "SET FanSpeed" or "SET Select.PowerState"
                const variable = node.name.replace(/^SET /, '').split('.')[0];
                assert.strictEqual(vallox.convert(variable, 1).readonly, false, `${variable} is readonly`);
            }
        });

        it('wires every widget to a group that belongs to a tab', function () {
            const byId = new Map(nodes.map((n) => [n.id, n]));
            const groups = nodes.filter((n) => n.type === 'ui_group');
            assert.ok(groups.length > 0);
            for (const group of groups) {
                assert.strictEqual(byId.get(group.tab)?.type, 'ui_tab', `${group.name} has no tab`);
            }
            for (const widget of nodes.filter((n) => /^ui_/.test(n.type) && n.group)) {
                assert.strictEqual(byId.get(widget.group)?.type, 'ui_group', `${widget.type} has no group`);
            }
        });

        it('polls only registers the master does not broadcast', function () {
            const poller = nodes.find((n) => n.type === 'function' && /abfragen/.test(n.name || ''));
            assert.ok(poller, 'expected a poll rotation');
            const listed = [...poller.func.matchAll(/"([A-Z][A-Za-z0-9]+)"/g)].map((m) => m[1]);
            assert.ok(listed.length >= 8, 'expected a rotation of registers');
            for (const name of listed) {
                assert.notStrictEqual(vallox.convert(name, 1).command, undefined, `unknown variable ${name}`);
                assert.ok(!/^Temperature/.test(name), `${name} is broadcast, polling it wastes bus time`);
            }
        });
    });

    describe('vallox-monitor.json sample frames', function () {
        const nodes = JSON.parse(fs.readFileSync(path.join(DIR, 'vallox-monitor.json'), 'utf8'));
        const frames = nodes.filter((n) => n.type === 'inject' && n.payloadType === 'bin');

        it('replays frames that decode, and labels them with the value they carry', function () {
            const good = frames.filter((n) => !/bad checksum/i.test(n.name));
            assert.ok(good.length >= 10, 'expected a representative set of frames');
            for (const node of good) {
                const bytes = JSON.parse(node.payload);
                assert.strictEqual(bytes.length, vallox.constants.VALLOX_LENGTH);
                let message;
                vallox.decode(
                    Buffer.from(bytes),
                    (m) => (message = m),
                    (e) => assert.fail(`${node.name}: ${e}`)
                );
                assert.ok(node.name.startsWith(message.variable), `"${node.name}" should name ${message.variable}`);
                if (typeof message.value !== 'object') {
                    assert.ok(
                        node.name.includes(JSON.stringify(message.value)),
                        `"${node.name}" should show the decoded value ${JSON.stringify(message.value)}`
                    );
                }
            }
        });

        it('polls registers the master does not broadcast', function () {
            // Only 2AH 2BH 2CH 32H-35H are broadcast; anything else needs a GET.
            const BROADCAST = ['Humidity', 'CO2High', 'CO2Low'];
            const polls = nodes
                .filter((n) => n.type === 'inject' && n.payloadType === 'json')
                .map((n) => JSON.parse(n.payload));
            assert.ok(polls.length > 0, 'the monitor example should demonstrate polling');
            for (const poll of polls) {
                assert.strictEqual(poll.request, 'GET');
                const { command } = vallox.convert(poll.variable, undefined);
                assert.ok(command !== undefined, `${poll.variable} is not a known variable`);
                assert.ok(
                    !BROADCAST.includes(poll.variable) && !/^Temperature/.test(poll.variable),
                    `${poll.variable} is broadcast anyway, polling it is a poor example`
                );
            }
        });

        it('includes a deliberately corrupt frame to exercise the error output', function () {
            const bad = frames.filter((n) => /bad checksum/i.test(n.name));
            assert.strictEqual(bad.length, 1);
            let failed = false;
            vallox.decode(
                Buffer.from(JSON.parse(bad[0].payload)),
                () => assert.fail('corrupt frame decoded successfully'),
                () => (failed = true)
            );
            assert.ok(failed);
        });
    });
});
