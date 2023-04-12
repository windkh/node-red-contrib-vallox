// Functions for decoding and encoding RS485 vallox protocol.
// Ported from https://github.com/windkh/valloxserial

'use strict';

let VALLOX_LENGTH = 6; // always 6
let VALLOX_DOMAIN = 1; // always 1


// decodes a 6 bytes telegram from a binary buffer.
async function decode(buffer, messageHandler, errorHandler) {
    if (buffer !== undefined) {
        if (buffer.length === VALLOX_LENGTH) {

            let domain = buffer[0];
            let sender = buffer[1];
            let receiver = buffer[2];
            let command = buffer[3];
            let arg = buffer[4];
            let checksum = buffer[5];    

            let computedChecksum = (domain + sender + receiver + command + arg) & 0x00ff;
            if (checksum === computedChecksum) {

                let message = {
                    domain : domain,
                    sender : sender,
                    receiver : receiver,
                    command : command,
                    arg : arg,
                    checksum : checksum
                };
                messageHandler(message);
            }
            else {
                errorHandler("Checksum check failed.");
            }
        }
        else {
            errorHandler("Wrong number of bytes received: " + buffer.length);
        }
    }
    else {
        errorHandler("Buffer is empty.");
    }
}

// encodes a 6 bytes telegram for a binary buffer.
async function encode(message, bufferHandler, errorHandler) {
    if (message !== undefined) {
        
        let domain = message.domain;
        let sender = message.sender;
        let receiver = message.receiver;
        let command = message.command;
        let arg = message.arg;    
        let checksum = (domain + sender + receiver + command + arg) & 0x00ff;
        
        let buffer = new (VALLOX_LENGTH);
        buffer[0] = domain;
        buffer[1] = sender;
        buffer[2] = receiver;
        buffer[3] = command;
        buffer[4] =  arg;
        buffer[5] =  checksum;
        
        bufferHandler(buffer);
    }
    else {
        errorHandler("Message is empty.");
    }
}

exports.decode = decode;
exports.encode = encode;
