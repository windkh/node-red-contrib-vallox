/**
 * Created by Karl-Heinz Wind
 **/

const vallox = require('../vallox.js');

// The vallox node.
module.exports = function (RED) {
    'use strict';

    function ValloxNode(config) {
        RED.nodes.createNode(this, config);
        let node = this;
        let sendOnNewData = config.sendonnewdata;
        let receiver = config.receiver & 0xff;
        let receiverGroup = receiver & 0xf0;
        let state = {
            Receiver: receiver,
        };

        // 91H prohibits modules from sending on the bus, 8FH allows it again. The unit issues
        // these around CO2 sensor interaction. Transmitting while suspended is a protocol
        // violation, so requests are rejected until traffic resumes. A missed 8FH would
        // otherwise wedge the node, so the block also lapses on its own.
        const SUSPEND_LAPSE_MS = 10000;
        let suspendedUntil = 0;
        const isSuspended = function () {
            return Date.now() < suspendedUntil;
        };

        // How a real panel writes a register, observed on a live bus and matching Annex B: the
        // mainboard is addressed first with the checksum sent twice, then all panels, then all
        // mainboards. The master propagates the change itself as well, so a single telegram to the
        // mainboard often suffices - set writesequence to false for that.
        const WRITE_SEQUENCE = [
            { receiver: vallox.constants.VALLOX_MASTER, repeatChecksum: true },
            { receiver: 0x20 },
            { receiver: 0x10 },
        ];
        const writeAsPanel = config.writesequence === undefined || config.writesequence === true;

        this.createMessage = function (request, variable, value, messageHandler, errorHandler) {
            let sender = receiver;
            let result = vallox.convert(variable, value);
            let command = result.command;
            let arg = result.arg;

            if (command === undefined) {
                errorHandler('Unknown variable ' + variable + '.');
                return;
            }

            let message = {
                domain: vallox.constants.VALLOX_DOMAIN,
                sender: sender,
                receiver: vallox.constants.VALLOX_MASTER,
                command: command,
                arg: arg,
            };

            if (request === vallox.constants.VALLOX_GET) {
                // A read request carries 0x00 in the command byte and the register being asked
                // for in the argument. See "request / response principle" in the protocol doc.
                message.command = vallox.variables.GET;
                message.arg = command;
                messageHandler(message);
                return;
            }

            if (result.readonly) {
                errorHandler('Variable ' + variable + ' is readonly.');
                return;
            }

            if (!Number.isInteger(arg) || arg < 0 || arg > 255) {
                errorHandler('Value for ' + variable + ' does not encode to a byte: ' + arg + '.');
                return;
            }

            if (!writeAsPanel) {
                message.repeatChecksum = true;
                messageHandler(message);
                return;
            }

            for (const step of WRITE_SEQUENCE) {
                messageHandler(Object.assign({}, message, step));
            }
        };

        this.on('input', async function (msg) {
            let message = msg.payload;
            if (message !== undefined) {
                // Input from RX node
                if (Object.prototype.hasOwnProperty.call(message, 'receiver')) {
                    let newData = false;

                    // Bus control is broadcast to every module, so it is honoured whoever it
                    // is addressed to.
                    if (message.command === vallox.variables.SUSPEND) {
                        suspendedUntil = Date.now() + SUSPEND_LAPSE_MS;
                    } else if (message.command === vallox.variables.RESUME) {
                        suspendedUntil = 0;
                    }

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
                } else if (Object.prototype.hasOwnProperty.call(message, 'request')) {
                    let request = message.request;
                    let variable = message.variable;
                    let value = message.value;

                    if (isSuspended()) {
                        let errorMessage = 'Bus transmission is suspended (91H): ' + variable + ' not sent.';
                        node.warn(errorMessage);
                        msg.payload = errorMessage;
                        node.send([null, null, msg]);
                        return;
                    }

                    node.createMessage(
                        request,
                        variable,
                        value,
                        function (message) {
                            // a write is several telegrams: each needs its own msg, or they all
                            // alias one payload slot and only the last survives
                            node.send([null, Object.assign({}, msg, { payload: message })]);
                        },
                        function (errorMessage) {
                            node.warn(errorMessage);
                            node.send([null, null, Object.assign({}, msg, { payload: errorMessage })]);
                        }
                    );
                } else {
                    msg.payload = state;
                    node.send([msg]);
                }
            } else {
                msg.payload = state;
                node.send([msg]);
            }
        });

        this.on('close', function (done) {
            node.status({});
            done();
        });
    }
    RED.nodes.registerType('vallox', ValloxNode);
};
