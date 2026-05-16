/**
* Created by Karl-Heinz Wind
**/

const vallox = require('../vallox.js');

// The vallox sender node.
module.exports = function (RED) {
    "use strict";

    function ValloxTxNode(config) {
        RED.nodes.createNode(this, config);
        let node = this;

        this.on('input', async function (msg) {

            vallox.encode(msg.payload, function (message) {
                node.status({
                    fill: 'green',
                    shape: 'ring',
                    text: 'ok',
                });

                msg.payload = message;
                node.send([msg, null]);
            }, function (errorMessage) {
                node.status({
                    fill: 'red',
                    shape: 'ring',
                    text: errorMessage,
                });

                node.warn(errorMessage);
                msg.payload = errorMessage;
                node.send([null, msg]);
            });
        });

        this.on('close', function(done) {
            node.status({});
            done();
        });
    }
    RED.nodes.registerType("valloxtx", ValloxTxNode);
}
