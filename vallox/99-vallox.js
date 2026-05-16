/**
* Created by Karl-Heinz Wind
**/

module.exports = function (RED) {
    "use strict";
    require('./nodes/vallox-rx-node.js')(RED);
    require('./nodes/vallox-tx-node.js')(RED);
    require('./nodes/vallox-node.js')(RED);
}
