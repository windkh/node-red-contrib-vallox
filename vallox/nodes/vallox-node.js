/**
 * Created by Karl-Heinz Wind
 **/

const vallox = require('../vallox.js');

function isByte(value) {
    return Number.isInteger(value) && value >= 0 && value <= 255;
}

// The vallox node.
module.exports = function (RED) {
    'use strict';

    function ValloxNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const sendOnNewData = config.sendonnewdata;
        const receiver = config.receiver & 0xff;
        const receiverGroup = receiver & 0xf0;
        const state = {
            Receiver: receiver,
        };

        // Which frames update the cache. A mainboard reporting a register is reporting the same
        // value whoever asked for it, so those are taken whatever the recipient is - that is how a
        // node picks up everything the physical panels poll for, without polling itself. Beyond
        // that, anything addressed to this node or to its group counts.
        const MAINBOARD_GROUP = 0x10;
        const describes = function (message) {
            const fromMainboard = (message.sender & 0xf0) === MAINBOARD_GROUP;
            const addressedHere = message.receiver === receiver || message.receiver === receiverGroup;
            return fromMainboard || addressedHere;
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
            const result = vallox.convert(variable, value);
            const reading = request === vallox.constants.VALLOX_GET;

            if (result.command === undefined) {
                errorHandler('Unknown variable ' + variable + '.');
                return;
            }
            if (!reading && result.readonly) {
                errorHandler('Variable ' + variable + ' is readonly.');
                return;
            }
            if (!reading && !isByte(result.arg)) {
                errorHandler('Value for ' + variable + ' does not encode to a byte: ' + result.arg + '.');
                return;
            }

            const message = {
                domain: vallox.constants.VALLOX_DOMAIN,
                sender: receiver,
                receiver: vallox.constants.VALLOX_MASTER,
                command: result.command,
                arg: result.arg,
            };

            let telegrams;
            if (reading) {
                // A read request carries 0x00 in the command byte and the register being asked for
                // in the argument. See "request / response principle" in the protocol doc.
                telegrams = [Object.assign({}, message, { command: vallox.variables.GET, arg: result.command })];
            } else if (writeAsPanel) {
                telegrams = WRITE_SEQUENCE.map((step) => Object.assign({}, message, step));
            } else {
                telegrams = [Object.assign({}, message, { repeatChecksum: true })];
            }

            for (const telegram of telegrams) {
                messageHandler(telegram);
            }
        };

        this.on('input', async function (msg) {
            const message = msg.payload;
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

                    // a GET carries no value, so only SET-shaped frames update anything
                    if (message.request === vallox.constants.VALLOX_SET && describes(message)) {
                        const variable = message.variable;
                        const value = message.value;
                        state[variable] = value;
                        newData = true;
                    }

                    if (newData && sendOnNewData) {
                        msg.payload = state;
                        node.send([msg]);
                    }
                } else if (Object.prototype.hasOwnProperty.call(message, 'request')) {
                    const request = message.request;
                    const variable = message.variable;
                    const value = message.value;

                    if (isSuspended()) {
                        const errorMessage = 'Bus transmission is suspended (91H): ' + variable + ' not sent.';
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
