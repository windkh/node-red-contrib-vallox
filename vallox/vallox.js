// Functions for decoding and encoding RS485 vallox protocol.
// Ported from https://github.com/windkh/valloxserial

'use strict';

let VALLOX_LENGTH = 6; // always 6
let VALLOX_DOMAIN = 1; // always 1


// decodes a 6 bytes telegram from a binary buffer.
async function decode(buffer, messageHandler, errorHandler) {
    if (buffer !== undefined) {
        if (buffer.length === VALLOX_LENGTH) {

            let message = {
                domain : buffer[0],
                sender : buffer[1],
                receiver : buffer[2],
                command : buffer[3],
                arg : buffer[4],
                checksum : buffer[5]    
            }

            let computedChecksum = (domain + sender + receiver + command + arg) & 0x00ff;
            if (checksum === computedChecksum) {
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

exports.decode = decode;

