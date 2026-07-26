/**
 * Created by Karl-Heinz Wind
 **/

const vallox = require('../vallox.js');

// The vallox sender node.
module.exports = function (RED) {
    'use strict';

    function ValloxTxNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // An array of byte values is what this node has always emitted, and a `serial out` node
        // writes it as bytes. An MQTT hop does not: it JSON-encodes the array, so the far end
        // receives the text "[1,33,17,...]" and writes those characters to the port. Choose Buffer
        // when the telegram travels over MQTT or anything else that serialises the payload.
        const asBuffer = config.outputformat === 'buffer';

        this.on('input', async function (msg) {
            vallox.encode(
                msg.payload,
                function (message) {
                    node.status({
                        fill: 'green',
                        shape: 'ring',
                        text: 'ok',
                    });

                    msg.payload = asBuffer ? Buffer.from(message) : message;
                    node.send([msg, null]);
                },
                function (errorMessage) {
                    node.status({
                        fill: 'red',
                        shape: 'ring',
                        text: errorMessage,
                    });

                    node.warn(errorMessage);
                    msg.payload = errorMessage;
                    node.send([null, msg]);
                }
            );
        });

        this.on('close', function (done) {
            node.status({});
            done();
        });
    }
    RED.nodes.registerType('valloxtx', ValloxTxNode);
};
