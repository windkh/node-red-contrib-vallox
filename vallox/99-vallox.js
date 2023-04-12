/**
* Created by Karl-Heinz Wind
**/

module.exports = function (RED) {
    "use strict";
    let vallox = require('./vallox.js');
    	
    // --------------------------------------------------------------------------------------------
    // The vallox receiver node.
    function ValloxRxNode(config) {
        RED.nodes.createNode(this, config);
        let node = this;
        
        this.on('input', async function (msg) {

            vallox.decode(msg.payload, function (message) {
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
    RED.nodes.registerType("valloxrx", ValloxRxNode);

        
    // --------------------------------------------------------------------------------------------
    // The vallox sender node.
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