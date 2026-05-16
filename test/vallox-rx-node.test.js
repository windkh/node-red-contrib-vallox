'use strict';

const { expect } = require('chai');
const helper = require('node-red-node-test-helper');
const rxNode = require('../vallox/nodes/vallox-rx-node.js');

helper.init(require.resolve('node-red'));

describe('valloxrx node', function () {

    before(function (done) { helper.startServer(done); });
    after(function (done) { helper.stopServer(done); });
    afterEach(function (done) { helper.unload().then(done); });

    function load(cb) {
        const flow = [
            { id: 'n1', type: 'valloxrx', name: 'rx', wires: [['out'], ['err']] },
            { id: 'out', type: 'helper' },
            { id: 'err', type: 'helper' }
        ];
        helper.load(rxNode, flow, () => cb({
            n1: helper.getNode('n1'),
            out: helper.getNode('out'),
            err: helper.getNode('err')
        }));
    }

    it('decodes a valid FanSpeed=8 frame on output 1', function (done) {
        load(({ n1, out }) => {
            out.on('input', (msg) => {
                try {
                    expect(msg.payload.variable).to.equal('FanSpeed');
                    expect(msg.payload.value).to.equal(8);
                    done();
                } catch (e) { done(e); }
            });
            // 0x01 + 0x11 + 0x20 + 0x29 + 0xff = 0x15a -> 0x5a
            n1.receive({ payload: Buffer.from([0x01, 0x11, 0x20, 0x29, 0xff, 0x5a]) });
        });
    });

    it('routes checksum errors to output 2', function (done) {
        load(({ n1, err }) => {
            err.on('input', (msg) => {
                try {
                    expect(msg.payload).to.match(/checksum/i);
                    done();
                } catch (e) { done(e); }
            });
            n1.receive({ payload: Buffer.from([0x01, 0x11, 0x20, 0x29, 0xff, 0x00]) });
        });
    });

    it('drops misaligned leading bytes and still decodes the embedded frame', function (done) {
        load(({ n1, out }) => {
            out.on('input', (msg) => {
                try {
                    expect(msg.payload.variable).to.equal('FanSpeed');
                    expect(msg.payload.value).to.equal(8);
                    done();
                } catch (e) { done(e); }
            });
            n1.receive({ payload: Buffer.from([0xff, 0xff, 0x01, 0x11, 0x20, 0x29, 0xff, 0x5a]) });
        });
    });

    it('decodes two back-to-back frames in one buffer', function (done) {
        load(({ n1, out }) => {
            const seen = [];
            out.on('input', (msg) => {
                seen.push(msg.payload.value);
                if (seen.length === 2) {
                    try {
                        expect(seen).to.deep.equal([8, 1]);
                        done();
                    } catch (e) { done(e); }
                }
            });
            n1.receive({ payload: Buffer.from([
                0x01, 0x11, 0x20, 0x29, 0xff, 0x5a,   // FanSpeed=8
                0x01, 0x11, 0x20, 0x29, 0x01, 0x5c    // FanSpeed=1
            ]) });
        });
    });
});
