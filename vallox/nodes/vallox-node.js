/**
* Created by Karl-Heinz Wind
**/

const vallox = require('../vallox.js');

// The vallox node.
module.exports = function (RED) {
    "use strict";

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
