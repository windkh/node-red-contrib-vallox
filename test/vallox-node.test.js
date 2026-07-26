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

    it('builds an outgoing telegram for a SET request on output 2', function (t, done) {
        load({}, ({ n1, tx }) => {
            tx.on('input', (msg) => {
                try {
                    assertSubset(msg.payload, {
                        domain: 0x01,
                        sender: 33,
                        receiver: 0x11,
                        command: 0x29,
                        arg: 0x07, // FanSpeed level 3
                    });
                    done();
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({
                payload: {
                    request: 'SET',
                    variable: 'FanSpeed',
                    value: 3,
                },
            });
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
