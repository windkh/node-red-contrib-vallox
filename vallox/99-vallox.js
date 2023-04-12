/**
* Created by Karl-Heinz Wind
**/

module.exports = function (RED) {
    "use strict";
    let vallox = require('./vallox.js');
    	
    // --------------------------------------------------------------------------------------------
    // The vallox node.
    function ValloxNode(config) {
        RED.nodes.createNode(this, config);
        let node = this;
        
        this.on('input', async function (msg) {

            vallox.decode(msg.payload, function (success) {
                node.status({
                    fill: 'green',
                    shape: 'ring',
                    text: 'ok',
                });

                msg.payload = data;
                node.send([msg]);
            }, function (errorMessage) {
                node.status({
                    fill: 'red',
                    shape: 'ring',
                    text: errorMessage,
                });

                node.warn(errorMessage);
            });
        });

        this.on('close', function(done) {
            node.status({});
            done();
        });
    }
    RED.nodes.registerType("vallox", ValloxNode);
}