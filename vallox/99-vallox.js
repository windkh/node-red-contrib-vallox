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


    // --------------------------------------------------------------------------------------------
    // The vallox node.
    function ValloxNode(config) {
        RED.nodes.createNode(this, config);
        let node = this;
        let sendOnNewData = config.sendonnewdata;
        let receiver = config.receiver & 0xFF;
        let receiverGroup = receiver & 0xF0;
        let state = {
            Receiver : receiver
        };

        this.createMessage = function(request, variable, value, messageHandler, errorHandler){
            
            let sender = receiver;
            let result = vallox.convert(variable, value);            
            let command = result.command;
            let arg = result.arg;

            if (request !== vallox.constants.VALLOX_GET) {
                if (result.readonly){
                    errorHandler("Variable " + variable + " is readonly.")
                }
            }

            let message = {
                domain : vallox.constants.VALLOX_DOMAIN,
                sender : sender,
                receiver : vallox.constants.VALLOX_MASTER,
                command : command,
                arg : arg,
            }
            messageHandler(message);
        };

        this.on('input', async function (msg) {

            let message = msg.payload; 
            if (message !== undefined)
            {
                // Input from RX node
                if (message.hasOwnProperty('receiver')) {
                    let newData = false;
                    if (message.receiver === receiver || message.receiver === receiverGroup) {
                        if (message.request === vallox.constants.VALLOX_SET) {
                            let variable = message.variable;
                            let value = message.value;
                            state[variable] = value;
                            newData = true;
                        }
                    }
                
                    if (newData && sendOnNewData) {
                        msg.payload = state;
                        node.send([msg]);
                    }
                }
                else if (message.hasOwnProperty('request')) {
                    let request = message.request;
                    let variable = message.variable;
                    let value = message.value;

                    node.createMessage(request, variable, value, function (message) {
                        msg.payload = message;
                        node.send([null, msg]);
                    }, function (errorMessage) {
                        node.warn(errorMessage);
                        msg.payload = errorMessage;
                        node.send([null, null, msg]);
                    });
                }
                else {
                    msg.payload = state;
                    node.send([msg]);
                }
            }
            else
            {
                msg.payload = state;
                node.send([msg]);
            }
        });

        this.on('close', function(done) {
            node.status({});
            done();
        });
    }
    RED.nodes.registerType("vallox", ValloxNode);
}