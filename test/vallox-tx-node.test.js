'use strict';
const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert');

const helper = require('node-red-node-test-helper');
const txNode = require('../vallox/nodes/vallox-tx-node.js');

helper.init(require.resolve('node-red'));

describe('valloxtx node', function () {
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
            { id: 'n1', type: 'valloxtx', name: 'tx', wires: [['out'], ['err']] },
            { id: 'out', type: 'helper' },
            { id: 'err', type: 'helper' },
        ];
        helper.load(txNode, flow, () =>
            cb({
                n1: helper.getNode('n1'),
                out: helper.getNode('out'),
                err: helper.getNode('err'),
            })
        );
    }

    describe('output format', function () {
        function loadWith(config, cb) {
            const flow = [
                Object.assign({ id: 'n1', type: 'valloxtx', name: 'tx', wires: [['out'], ['err']] }, config),
                { id: 'out', type: 'helper' },
                { id: 'err', type: 'helper' },
            ];
            helper.load(txNode, flow, () =>
                cb({ n1: helper.getNode('n1'), out: helper.getNode('out'), err: helper.getNode('err') })
            );
        }

        const TELEGRAM = { domain: 0x01, sender: 0x21, receiver: 0x11, command: 0x29, arg: 0x1f };
        const BYTES = [0x01, 0x21, 0x11, 0x29, 0x1f, 0x7b];

        it('emits an array of bytes by default, as it always has', function (t, done) {
            loadWith({}, ({ n1, out }) => {
                out.on('input', (msg) => {
                    try {
                        assert.ok(Array.isArray(msg.payload), 'default output should stay an array');
                        assert.ok(!Buffer.isBuffer(msg.payload));
                        assert.deepStrictEqual(msg.payload, BYTES);
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
                n1.receive({ payload: TELEGRAM });
            });
        });

        it('emits a Buffer when asked, so an MQTT hop does not turn it into text', function (t, done) {
            loadWith({ outputformat: 'buffer' }, ({ n1, out }) => {
                out.on('input', (msg) => {
                    try {
                        assert.ok(Buffer.isBuffer(msg.payload), 'expected a Buffer');
                        assert.deepStrictEqual(Array.from(msg.payload), BYTES);
                        // this is the point of the option: JSON round-tripping keeps the bytes
                        assert.strictEqual(msg.payload.toString('hex'), '012111291f7b');
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
                n1.receive({ payload: TELEGRAM });
            });
        });

        it('keeps the repeated checksum of a write telegram in Buffer form', function (t, done) {
            loadWith({ outputformat: 'buffer' }, ({ n1, out }) => {
                out.on('input', (msg) => {
                    try {
                        assert.strictEqual(msg.payload.length, 7);
                        assert.deepStrictEqual(Array.from(msg.payload), [...BYTES, 0x7b]);
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
                n1.receive({ payload: Object.assign({}, TELEGRAM, { repeatChecksum: true }) });
            });
        });
    });

    it('encodes a FanSpeed=5 telegram with the correct checksum', function (t, done) {
        load(({ n1, out }) => {
            out.on('input', (msg) => {
                try {
                    assert.deepStrictEqual(Array.from(msg.payload), [0x01, 0x21, 0x11, 0x29, 0x1f, 0x7b]);
                    done();
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({
                payload: {
                    domain: 0x01,
                    sender: 0x21,
                    receiver: 0x11,
                    command: 0x29,
                    arg: 0x1f,
                },
            });
        });
    });

    it('routes empty input to the error output', function (t, done) {
        load(({ n1, err }) => {
            err.on('input', (msg) => {
                try {
                    assert.strictEqual(typeof msg.payload, 'string');
                    done();
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({ payload: undefined });
        });
    });
});
