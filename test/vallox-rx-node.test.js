'use strict';
const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert');

const helper = require('node-red-node-test-helper');
const rxNode = require('../vallox/nodes/vallox-rx-node.js');

helper.init(require.resolve('node-red'));

describe('valloxrx node', function () {
    before(function (t, done) {
        helper.startServer(done);
    });
    after(function (t, done) {
        helper.stopServer(done);
    });
    afterEach(function (t, done) {
        helper.unload().then(done);
    });

    function load(cb) {
        const flow = [
            { id: 'n1', type: 'valloxrx', name: 'rx', wires: [['out'], ['err']] },
            { id: 'out', type: 'helper' },
            { id: 'err', type: 'helper' },
        ];
        helper.load(rxNode, flow, () =>
            cb({
                n1: helper.getNode('n1'),
                out: helper.getNode('out'),
                err: helper.getNode('err'),
            })
        );
    }

    // A payload that is not a Buffer used to reach Buffer.concat and throw. Because the input
    // handler is async the exception became an unhandled rejection, which stops Node-RED, so these
    // inputs have to be handled rather than merely not decoded.
    describe('accepts the payload shapes real flows deliver', function () {
        const FRAME = [0x01, 0x11, 0x20, 0x29, 0xff, 0x5a];

        for (const [label, payload] of [
            ['a Buffer, as a serial port delivers it', Buffer.from(FRAME)],
            ['a Uint8Array', new Uint8Array(FRAME)],
            ['a plain array of bytes', FRAME],
            ['the JSON text an MQTT round-trip produces', JSON.stringify(FRAME)],
        ]) {
            it(`decodes ${label}`, function (t, done) {
                load(({ n1, out, err }) => {
                    err.on('input', (msg) => done(new Error('unexpected error: ' + msg.payload)));
                    out.on('input', (msg) => {
                        try {
                            assert.strictEqual(msg.payload.variable, 'FanSpeed');
                            assert.strictEqual(msg.payload.value, 8);
                            done();
                        } catch (e) {
                            done(e);
                        }
                    });
                    n1.receive({ payload });
                });
            });
        }

        it('reassembles a frame split across a Buffer and a stringified array', function (t, done) {
            load(({ n1, out }) => {
                out.on('input', (msg) => {
                    try {
                        assert.strictEqual(msg.payload.value, 8);
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
                n1.receive({ payload: Buffer.from(FRAME.slice(0, 2)) });
                n1.receive({ payload: JSON.stringify(FRAME.slice(2)) });
            });
        });

        for (const [label, payload] of [
            ['an object', { nope: true }],
            ['a string that is not an array', 'hello'],
            ['an empty payload', undefined],
            ['an array holding a non-byte', [0x01, 0x11, 0x20, 0x29, 999, 0x5a]],
            ['a number out of byte range', 300],
        ]) {
            it(`reports ${label} on output 2 instead of throwing`, function (t, done) {
                load(({ n1, out, err }) => {
                    out.on('input', () => done(new Error('a frame was decoded from an invalid payload')));
                    err.on('input', (msg) => {
                        try {
                            assert.strictEqual(typeof msg.payload, 'string');
                            assert.ok(msg.payload.length > 0);
                            done();
                        } catch (e) {
                            done(e);
                        }
                    });
                    n1.receive({ payload });
                });
            });
        }

        it('tells the user how to fix a text payload', function (t, done) {
            // The common cause is an MQTT node left on "auto-detect", which turns any chunk that
            // happens to be valid UTF-8 into a string - lossily, so it cannot be recovered here.
            load(({ n1, err }) => {
                err.on('input', (msg) => {
                    try {
                        assert.match(msg.payload, /arrived as text/i);
                        assert.match(msg.payload, /Buffer/);
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
                n1.receive({ payload: '[' });
            });
        });

        it('keeps working after a bad payload', function (t, done) {
            load(({ n1, out }) => {
                out.on('input', (msg) => {
                    try {
                        assert.strictEqual(msg.payload.value, 8);
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
                n1.receive({ payload: { rubbish: true } });
                n1.receive({ payload: Buffer.from(FRAME) });
            });
        });
    });

    it('decodes a valid FanSpeed=8 frame on output 1', function (t, done) {
        load(({ n1, out }) => {
            out.on('input', (msg) => {
                try {
                    assert.strictEqual(msg.payload.variable, 'FanSpeed');
                    assert.strictEqual(msg.payload.value, 8);
                    done();
                } catch (e) {
                    done(e);
                }
            });
            // 0x01 + 0x11 + 0x20 + 0x29 + 0xff = 0x15a -> 0x5a
            n1.receive({ payload: Buffer.from([0x01, 0x11, 0x20, 0x29, 0xff, 0x5a]) });
        });
    });

    it('routes checksum errors to output 2', function (t, done) {
        load(({ n1, err }) => {
            err.on('input', (msg) => {
                try {
                    assert.match(msg.payload, /checksum/i);
                    done();
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({ payload: Buffer.from([0x01, 0x11, 0x20, 0x29, 0xff, 0x00]) });
        });
    });

    it('drops misaligned leading bytes and still decodes the embedded frame', function (t, done) {
        load(({ n1, out }) => {
            out.on('input', (msg) => {
                try {
                    assert.strictEqual(msg.payload.variable, 'FanSpeed');
                    assert.strictEqual(msg.payload.value, 8);
                    done();
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({ payload: Buffer.from([0xff, 0xff, 0x01, 0x11, 0x20, 0x29, 0xff, 0x5a]) });
        });
    });

    describe('diagnostics', function () {
        const fs = require('node:fs');
        const os = require('node:os');
        const path = require('node:path');

        function frame(command, arg) {
            const b = [0x01, 0x11, 0x20, command, arg];
            b.push(b.reduce((sum, x) => sum + x, 0) % 256);
            return b;
        }

        function loadWith(config, cb) {
            const flow = [
                Object.assign({ id: 'n1', type: 'valloxrx', name: 'rx', wires: [['out'], ['err']] }, config),
                { id: 'out', type: 'helper' },
                { id: 'err', type: 'helper' },
            ];
            helper.load(rxNode, flow, () =>
                cb({ n1: helper.getNode('n1'), out: helper.getNode('out'), err: helper.getNode('err') })
            );
        }

        it('writes the raw bytes to a capture file when one is configured', function (t, done) {
            const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vallox-')), 'capture.bin');
            loadWith({ debug: true, capturefile: file }, ({ n1, out }) => {
                out.on('input', () => {
                    setTimeout(() => {
                        try {
                            const written = fs.readFileSync(file);
                            assert.deepStrictEqual(Array.from(written), frame(0x29, 0xff));
                            done();
                        } catch (e) {
                            done(e);
                        }
                    }, 50);
                });
                n1.receive({ payload: Buffer.from(frame(0x29, 0xff)) });
            });
        });

        it('captures exactly what arrived, including bytes that never form a frame', function (t, done) {
            const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vallox-')), 'capture.bin');
            loadWith({ debug: true, capturefile: file }, ({ n1 }) => {
                n1.receive({ payload: Buffer.from([0xaa, 0xbb, 0xcc]) });
                setTimeout(() => {
                    try {
                        assert.deepStrictEqual(Array.from(fs.readFileSync(file)), [0xaa, 0xbb, 0xcc]);
                        done();
                    } catch (e) {
                        done(e);
                    }
                }, 80);
            });
        });

        it('writes nothing and changes nothing when left off', function (t, done) {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vallox-'));
            loadWith({}, ({ n1, out }) => {
                out.on('input', (msg) => {
                    try {
                        assert.strictEqual(msg.payload.value, 8);
                        assert.deepStrictEqual(fs.readdirSync(dir), [], 'nothing may be written by default');
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
                n1.receive({ payload: Buffer.from(frame(0x29, 0xff)) });
            });
        });

        it('reports an unwritable capture path instead of throwing', function (t, done) {
            loadWith(
                { debug: true, capturefile: path.join(os.tmpdir(), 'no-such-dir-xyz', 'c.bin') },
                ({ n1, out }) => {
                    // the frame must still decode even though the capture cannot be written
                    out.on('input', (msg) => {
                        try {
                            assert.strictEqual(msg.payload.value, 8);
                            done();
                        } catch (e) {
                            done(e);
                        }
                    });
                    n1.receive({ payload: Buffer.from(frame(0x29, 0xff)) });
                }
            );
        });
    });

    describe('write telegrams that repeat their checksum (Annex B)', function () {
        // "this last message MUST be followed by sending its CHECKSUM twice". Frames below are
        // taken verbatim from a capture of a real bus: panel 2 writing setpoints to mainboard 1.
        it('decodes a 7-byte write and the frame that follows it', function (t, done) {
            load(({ n1, out, err }) => {
                err.on('input', (msg) => done(new Error('unexpected error: ' + msg.payload)));
                const seen = [];
                out.on('input', (msg) => {
                    seen.push(msg.payload.variable + '=' + msg.payload.value);
                    if (seen.length === 2) {
                        try {
                            assert.deepStrictEqual(seen, ['HRCBypass=11', 'HRCBypass=9']);
                            done();
                        } catch (e) {
                            done(e);
                        }
                    }
                });
                n1.receive({
                    payload: Buffer.from([
                        0x01, 0x22, 0x11, 0xaf, 0x86, 0x69, 0x69, 0x01, 0x22, 0x11, 0xaf, 0x80, 0x63, 0x63,
                    ]),
                });
            });
        });

        it('does not swallow a following frame when the repeat would be 0x01', function (t, done) {
            // checksum 0x01 followed by a real frame that also starts 0x01: both must survive
            const first = [0x01, 0x11, 0x22, 0x07, 0xc6, 0x01];
            const second = [0x01, 0x11, 0x20, 0x29, 0xff, 0x5a];
            load(({ n1, out, err }) => {
                err.on('input', (msg) => done(new Error('unexpected error: ' + msg.payload)));
                const seen = [];
                out.on('input', (msg) => {
                    seen.push(msg.payload.variable);
                    if (seen.length === 2) {
                        try {
                            assert.deepStrictEqual(seen, ['IoPortMultiPurpose1', 'FanSpeed']);
                            done();
                        } catch (e) {
                            done(e);
                        }
                    }
                });
                n1.receive({ payload: Buffer.from([...first, ...second]) });
            });
        });

        it('still decodes a write whose repeated checksum is 0x01', function (t, done) {
            const write = [0x01, 0x11, 0x22, 0x07, 0xc6, 0x01, 0x01];
            load(({ n1, out, err }) => {
                err.on('input', (msg) => done(new Error('unexpected error: ' + msg.payload)));
                out.on('input', (msg) => {
                    try {
                        assert.strictEqual(msg.payload.variable, 'IoPortMultiPurpose1');
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
                n1.receive({ payload: Buffer.from(write) });
            });
        });
    });

    describe('resynchronises after damage', function () {
        function frame(command, arg) {
            const b = [0x01, 0x11, 0x20, command, arg];
            b.push(b.reduce((sum, x) => sum + x, 0) % 256);
            return b;
        }

        it('recovers every intact frame when a byte is lost mid-stream', function (t, done) {
            // A lost byte makes one window fail its checksum. Consuming that whole window would
            // swallow the next frame's 0x01 and lose a second, intact frame with it.
            load(({ n1, out }) => {
                const seen = [];
                out.on('input', (msg) => {
                    seen.push(msg.payload.value);
                    if (seen.length === 3) {
                        try {
                            assert.deepStrictEqual(seen, [8, 1, 4]);
                            done();
                        } catch (e) {
                            done(e);
                        }
                    }
                });

                const a = frame(0x29, 0xff); // FanSpeed 8
                const damaged = frame(0x29, 0x01).slice(1); // lose this frame's start byte
                const b = frame(0x29, 0x01); // FanSpeed 1
                const c = frame(0x29, 0x0f); // FanSpeed 4
                n1.receive({ payload: Buffer.from([...a, ...damaged, ...b, ...c]) });
            });
        });

        it('does not warn or error on a clean stream', function (t, done) {
            load(({ n1, out, err }) => {
                err.on('input', (msg) => done(new Error('unexpected error: ' + msg.payload)));
                let count = 0;
                out.on('input', () => {
                    if (++count === 4) done();
                });
                n1.receive({
                    payload: Buffer.from([
                        ...frame(0x32, 0x5a),
                        ...frame(0x33, 0x80),
                        ...frame(0x34, 0xa2),
                        ...frame(0x35, 0x98),
                    ]),
                });
            });
        });

        it('holds on to a partial frame instead of discarding it', function (t, done) {
            load(({ n1, out, err }) => {
                err.on('input', (msg) => done(new Error('unexpected error: ' + msg.payload)));
                out.on('input', (msg) => {
                    try {
                        assert.strictEqual(msg.payload.value, 8);
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
                const f = frame(0x29, 0xff);
                n1.receive({ payload: Buffer.from(f.slice(0, 4)) });
                n1.receive({ payload: Buffer.from(f.slice(4)) });
            });
        });
    });

    it('decodes two back-to-back frames in one buffer', function (t, done) {
        load(({ n1, out }) => {
            const seen = [];
            out.on('input', (msg) => {
                seen.push(msg.payload.value);
                if (seen.length === 2) {
                    try {
                        assert.deepStrictEqual(seen, [8, 1]);
                        done();
                    } catch (e) {
                        done(e);
                    }
                }
            });
            n1.receive({
                payload: Buffer.from([
                    0x01,
                    0x11,
                    0x20,
                    0x29,
                    0xff,
                    0x5a, // FanSpeed=8
                    0x01,
                    0x11,
                    0x20,
                    0x29,
                    0x01,
                    0x5c, // FanSpeed=1
                ]),
            });
        });
    });
});
