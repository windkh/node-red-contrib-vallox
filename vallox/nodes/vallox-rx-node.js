/**
* Created by Karl-Heinz Wind
**/

const vallox = require('../vallox.js');

// The vallox receiver node.
module.exports = function (RED) {
    "use strict";

    function ValloxRxNode(config) {
        RED.nodes.createNode(this, config);
        let node = this;

        let buffer;
        this.enqueue = function(rawBytes){
            if(buffer !== undefined) {
                buffer = Buffer.concat([buffer, rawBytes]);
            }
            else {
                buffer = rawBytes;
            }
        };

        this.dequeue = function(){
            let result;
            if (buffer !== undefined && buffer.length >= vallox.constants.VALLOX_LENGTH) {
                let bufferSize = buffer.length;
                let messageLength = vallox.constants.VALLOX_LENGTH;

                // search for start byte and extract a complete message.
                // drop misleading bytes at the beginning and keep remaining bytes in the buffer.
                for(let i=0; i<bufferSize; i++) {
                    let value = buffer[i];
                    if(value === vallox.constants.VALLOX_DOMAIN) {

                        let offsetEnd = i + messageLength;
                        if(offsetEnd <= bufferSize) {
                            result = buffer.slice(i, offsetEnd);
                            buffer = buffer.slice(offsetEnd);

                            if(i > 0) {
                                // here we dropped values that could be from a previous messsage
                                node.warn("Dropped " + i + " bytes.");
                            }
                        }
                        else {
                            // here we found the start of the message but it is not complete.
                            // we have to wait until more bytes arrived.
                        }

                        break;
                    }
                }
            }

            return result;
        };

        this.on('input', async function (msg) {

            node.enqueue(msg.payload);

            do {
                let rawMessage = node.dequeue();
                if (rawMessage !== undefined){
                    vallox.decode(rawMessage, function (message) {
                        node.status({
                            fill: 'green',
                            shape: 'ring',
                            text: 'ok',
                        });

                        // emit a fresh msg per frame: multiple back-to-back frames in
                        // one input buffer would otherwise alias the same payload slot.
                        node.send([Object.assign({}, msg, { payload: message }), null]);
                    }, function (errorMessage) {
                        node.status({
                            fill: 'red',
                            shape: 'ring',
                            text: errorMessage,
                        });

                        node.warn(errorMessage);
                        node.send([null, Object.assign({}, msg, { payload: errorMessage })]);
                    });

                }
                else {
                    break;
                }
            } while(true);
        });

        this.on('close', function(done) {
            node.status({});
            done();
        });
    }
    RED.nodes.registerType("valloxrx", ValloxRxNode);
}
