'use strict';
const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert');

const helper = require('node-red-node-test-helper');
const valloxNode = require('../vallox/nodes/vallox-node.js');

helper.init(require.resolve('node-red'));

// Every key in `expected` must be present in `actual` with a strictly equal value.
// `actual` may carry additional keys (the node's state object always does).
function assertSubset(actual, expected) {
    for (const [key, value] of Object.entries(expected)) {
        assert.strictEqual(actual[key], value, `payload.${key}`);
    }
}

describe('vallox node', function () {
    before(function (t, done) {
        helper.startServer(done);
    });
    after(function (t, done) {
        helper.stopServer(done);
    });
    afterEach(function (t, done) {
        helper.unload().then(done);
    });

    function load(config, cb) {
        const flow = [
            Object.assign(
                {
                    id: 'n1',
                    type: 'vallox',
                    name: 'main',
                    description: 'Panel 1',
                    receiver: 33,
                    sendonnewdata: true,
                    wires: [['state'], ['tx'], ['err']],
                },
                config
            ),
            { id: 'state', type: 'helper' },
            { id: 'tx', type: 'helper' },
            { id: 'err', type: 'helper' },
        ];
        helper.load(valloxNode, flow, () =>
            cb({
                n1: helper.getNode('n1'),
                state: helper.getNode('state'),
                tx: helper.getNode('tx'),
                err: helper.getNode('err'),
            })
        );
    }

    it('updates state from a matching SET frame and emits on output 1', function (t, done) {
        load({}, ({ n1, state }) => {
            state.on('input', (msg) => {
                try {
                    assertSubset(msg.payload, { Receiver: 33, FanSpeed: 5 });
                    done();
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({
                payload: {
                    receiver: 33,
                    request: 'SET',
                    variable: 'FanSpeed',
                    value: 5,
                },
            });
        });
    });

    it('ignores frames addressed to a different panel', function (t, done) {
        load({}, ({ n1, state }) => {
            let fired = false;
            state.on('input', () => {
                fired = true;
            });
            n1.receive({
                payload: {
                    receiver: 34,
                    request: 'SET',
                    variable: 'FanSpeed',
                    value: 5,
                },
            });
            // No output should fire; give it a tick.
            setTimeout(() => {
                try {
                    assert.strictEqual(fired, false);
                    done();
                } catch (e) {
                    done(e);
                }
            }, 30);
        });
    });

    it('also accepts frames addressed to the receiver group', function (t, done) {
        // receiver=33 (0x21), group=0x20 (32). A frame addressed to 0x20 must match.
        load({}, ({ n1, state }) => {
            state.on('input', (msg) => {
                try {
                    assertSubset(msg.payload, { FanSpeed: 4 });
                    done();
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({
                payload: {
                    receiver: 0x20,
                    request: 'SET',
                    variable: 'FanSpeed',
                    value: 4,
                },
            });
        });
    });

    it('writes a register the way a real panel does', function (t, done) {
        // Observed on a live bus for every one of 14 fan-speed changes made from the original
        // control unit: mainboard first with the checksum sent twice, then all panels, then all
        // mainboards.
        load({}, ({ n1, tx }) => {
            const seen = [];
            tx.on('input', (msg) => {
                seen.push(msg.payload);
                if (seen.length < 3) {
                    return;
                }
                try {
                    for (const telegram of seen) {
                        assertSubset(telegram, {
                            domain: 0x01,
                            sender: 33,
                            command: 0x29,
                            arg: 0x07, // FanSpeed level 3
                        });
                    }
                    assert.deepStrictEqual(
                        seen.map((s) => s.receiver),
                        [0x11, 0x20, 0x10]
                    );
                    assert.strictEqual(seen[0].repeatChecksum, true, 'the mainboard write repeats its checksum');
                    assert.ok(!seen[1].repeatChecksum, 'the broadcasts do not');
                    assert.ok(!seen[2].repeatChecksum);
                    done();
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({ payload: { request: 'SET', variable: 'FanSpeed', value: 3 } });
        });
    });

    it('sends a single telegram when the panel sequence is switched off', function (t, done) {
        load({ writesequence: false }, ({ n1, tx }) => {
            const seen = [];
            tx.on('input', (msg) => seen.push(msg.payload));
            n1.receive({ payload: { request: 'SET', variable: 'FanSpeed', value: 3 } });
            setTimeout(() => {
                try {
                    assert.strictEqual(seen.length, 1);
                    assertSubset(seen[0], { receiver: 0x11, command: 0x29, arg: 0x07 });
                    assert.strictEqual(seen[0].repeatChecksum, true);
                    done();
                } catch (e) {
                    done(e);
                }
            }, 60);
        });
    });

    it('sends a read request as one telegram, without repeating the checksum', function (t, done) {
        load({}, ({ n1, tx }) => {
            const seen = [];
            tx.on('input', (msg) => seen.push(msg.payload));
            n1.receive({ payload: { request: 'GET', variable: 'FanSpeed' } });
            setTimeout(() => {
                try {
                    assert.strictEqual(seen.length, 1);
                    assertSubset(seen[0], { receiver: 0x11, command: 0x00, arg: 0x29 });
                    assert.ok(!seen[0].repeatChecksum);
                    done();
                } catch (e) {
                    done(e);
                }
            }, 60);
        });
    });

    it('builds a read request with 0x00 in the command byte and the register in arg', function (t, done) {
        load({}, ({ n1, tx }) => {
            tx.on('input', (msg) => {
                try {
                    // "PYYNTÖ: asetettava aina 0:ksi" - the request byte is always 0 and the
                    // register being asked for travels in the argument.
                    assertSubset(msg.payload, {
                        domain: 0x01,
                        sender: 33,
                        receiver: 0x11,
                        command: 0x00,
                        arg: 0x34, // TemperatureInside
                    });
                    done();
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({ payload: { request: 'GET', variable: 'TemperatureInside' } });
        });
    });

    it('allows a GET of a readonly variable', function (t, done) {
        load({}, ({ n1, tx, err }) => {
            err.on('input', (msg) => done(new Error('unexpected error: ' + msg.payload)));
            tx.on('input', (msg) => {
                try {
                    assert.strictEqual(msg.payload.command, 0x00);
                    assert.strictEqual(msg.payload.arg, 0x32);
                    done();
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({ payload: { request: 'GET', variable: 'TemperatureOutside' } });
        });
    });

    it('rejects an unknown variable instead of emitting a malformed telegram', function (t, done) {
        load({}, ({ n1, tx, err }) => {
            tx.on('input', () => done(new Error('a telegram was emitted for an unknown variable')));
            err.on('input', (msg) => {
                try {
                    assert.match(msg.payload, /unknown variable/i);
                    done();
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({ payload: { request: 'SET', variable: 'NoSuchVariable', value: 1 } });
        });
    });

    it('writes a modified Select object back as a single byte', function (t, done) {
        load({}, ({ n1, tx }) => {
            tx.on('input', (msg) => {
                try {
                    assertSubset(msg.payload, { command: 0xa3, arg: 0x0d });
                    done();
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({
                payload: {
                    request: 'SET',
                    variable: 'Select',
                    value: {
                        PowerState: true,
                        Co2AdjustState: false,
                        HumidityAdjustState: true,
                        HeatingState: true,
                    },
                },
            });
        });
    });

    it('refuses to transmit while the bus is suspended, and resumes after 8FH', function (t, done) {
        load({}, ({ n1, tx, err }) => {
            let sent = 0;
            let rejected = 0;
            tx.on('input', () => sent++);
            err.on('input', (msg) => {
                if (/suspended/i.test(msg.payload)) rejected++;
            });

            // 91H prohibits sending; broadcast to all panels
            n1.receive({ payload: { receiver: 0x20, command: 0x91, request: 'SET', variable: 'Suspend', value: 0 } });
            n1.receive({ payload: { request: 'SET', variable: 'FanSpeed', value: 3 } });

            setTimeout(() => {
                try {
                    assert.strictEqual(sent, 0, 'nothing may be transmitted while suspended');
                    assert.strictEqual(rejected, 1, 'the request should surface on the error output');

                    // 8FH allows sending again
                    n1.receive({
                        payload: { receiver: 0x20, command: 0x8f, request: 'SET', variable: 'Resume', value: 0 },
                    });
                    n1.receive({ payload: { request: 'SET', variable: 'FanSpeed', value: 3 } });

                    setTimeout(() => {
                        try {
                            // a write is the three-telegram panel sequence
                            assert.strictEqual(sent, 3, 'transmission should resume');
                            done();
                        } catch (e) {
                            done(e);
                        }
                    }, 40);
                } catch (e) {
                    done(e);
                }
            }, 40);
        });
    });

    it('routes a SET to a readonly variable as an error on output 3', function (t, done) {
        load({}, ({ n1, err, tx }) => {
            let txFired = false;
            tx.on('input', () => {
                txFired = true;
            });
            err.on('input', (msg) => {
                try {
                    assert.match(msg.payload, /readonly/i);
                    // give tx a tick to (incorrectly) fire if the bug returns
                    setTimeout(() => {
                        try {
                            assert.strictEqual(txFired, false, 'readonly SET must not emit on tx output');
                            done();
                        } catch (e) {
                            done(e);
                        }
                    }, 20);
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({
                payload: {
                    request: 'SET',
                    variable: 'TemperatureOutside',
                    value: 20,
                },
            });
        });
    });

    it('emits current state when payload is undefined', function (t, done) {
        load({}, ({ n1, state }) => {
            state.on('input', (msg) => {
                try {
                    assertSubset(msg.payload, { Receiver: 33 });
                    done();
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({ payload: undefined });
        });
    });

    it('does not emit on every update when sendonnewdata is false', function (t, done) {
        load({ sendonnewdata: false }, ({ n1, state }) => {
            let fired = false;
            state.on('input', () => {
                fired = true;
            });
            n1.receive({
                payload: {
                    receiver: 33,
                    request: 'SET',
                    variable: 'FanSpeed',
                    value: 2,
                },
            });
            setTimeout(() => {
                try {
                    assert.strictEqual(fired, false);
                    done();
                } catch (e) {
                    done(e);
                }
            }, 30);
        });
    });
});
