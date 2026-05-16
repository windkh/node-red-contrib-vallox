'use strict';

const { expect } = require('chai');
const helper = require('node-red-node-test-helper');
const txNode = require('../vallox/nodes/vallox-tx-node.js');

helper.init(require.resolve('node-red'));

describe('valloxtx node', function () {

    before(function (done) { helper.startServer(done); });
    after(function (done) { helper.stopServer(done); });
    afterEach(function (done) { helper.unload().then(done); });

    function load(cb) {
        const flow = [
            { id: 'n1', type: 'valloxtx', name: 'tx', wires: [['out'], ['err']] },
            { id: 'out', type: 'helper' },
            { id: 'err', type: 'helper' }
        ];
        helper.load(txNode, flow, () => cb({
            n1: helper.getNode('n1'),
            out: helper.getNode('out'),
            err: helper.getNode('err')
        }));
    }

    it('encodes a FanSpeed=5 telegram with the correct checksum', function (done) {
        load(({ n1, out }) => {
            out.on('input', (msg) => {
                try {
                    expect(Array.from(msg.payload)).to.deep.equal(
                        [0x01, 0x21, 0x11, 0x29, 0x1f, 0x7b]);
                    done();
                } catch (e) { done(e); }
            });
            n1.receive({ payload: {
                domain: 0x01, sender: 0x21, receiver: 0x11, command: 0x29, arg: 0x1f
            }});
        });
    });

    it('routes empty input to the error output', function (done) {
        load(({ n1, err }) => {
            err.on('input', (msg) => {
                try {
                    expect(msg.payload).to.be.a('string');
                    done();
                } catch (e) { done(e); }
            });
            n1.receive({ payload: undefined });
        });
    });
});
