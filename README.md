# Vallox nodes for node-red
[![Platform](https://img.shields.io/badge/platform-Node--RED-red)](https://nodered.org)
![License](https://img.shields.io/github/license/windkh/node-red-contrib-vallox.svg)
[![NPM](https://img.shields.io/npm/v/node-red-contrib-vallox?logo=npm)](https://www.npmjs.org/package/node-red-contrib-vallox)
[![Known Vulnerabilities](https://snyk.io/test/npm/node-red-contrib-vallox/badge.svg)](https://snyk.io/test/npm/node-red-contrib-vallox)
[![Downloads](https://img.shields.io/npm/dm/node-red-contrib-vallox.svg)](https://www.npmjs.com/package/node-red-contrib-vallox)
[![Total Downloads](https://img.shields.io/npm/dt/node-red-contrib-vallox.svg)](https://www.npmjs.com/package/node-red-contrib-vallox)
[![Package Quality](http://npm.packagequality.com/shield/node-red-contrib-vallox.png)](http://packagequality.com/#?package=node-red-contrib-vallox)
[![Open Issues](https://img.shields.io/github/issues-raw/windkh/node-red-contrib-vallox.svg)](https://github.com/windkh/node-red-contrib-vallox/issues)
[![Closed Issues](https://img.shields.io/github/issues-closed-raw/windkh/node-red-contrib-vallox.svg)](https://github.com/windkh/node-red-contrib-vallox/issues?q=is%3Aissue+is%3Aclosed)
...

This package contains nodes for controlling vallox devices via the serial RS485 API.
You must connect the RS485 bus and read the data using e.g. an RS485 to serial converter.
Then use a serial node to read the data and feed it to the node. 

# Dependencies
This package depends on the following libraries


# Disclaimer
This package is not developed nor officially supported by the company Vallox.
It is for demonstrating how to communicate to the devices using node-red.


# Thanks for your donation
If you want to support this free project. Any help is welcome. You can donate by clicking one of the following links:

<a target="blank" href="https://blockchain.com/btc/payment_request?address=1PBi7BoZ1mBLQx4ePbwh1MVoK2RaoiDsp5"><img src="https://img.shields.io/badge/Donate-Bitcoin-green.svg"/></a>
<a target="blank" href="https://www.paypal.me/windkh"><img src="https://img.shields.io/badge/Donate-PayPal-blue.svg"/></a>

<a href="https://www.buymeacoffee.com/windka" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174"></a>


# Credits


# Changelog
Changes can be followed [here](/CHANGELOG.md)


# Getting started

Wire an RS485 transceiver (e.g. an RS485-to-USB adapter) to your Vallox bus and read it with a `serial in` node, or bridge the stream over MQTT. The serial port settings are **9600 baud, 8 data bits, no parity, 1 stop bit** (8N1).

A typical receive-and-send pipeline:

```
serial in / mqtt in  -->  valloxrx  -->  vallox  -->  valloxtx  -->  serial out / mqtt out
                                            ^             ^
                                            |             |
                                       request msg   (only when sending)
```

- **valloxrx** decodes the raw byte stream into structured frames.
- **vallox** keeps the latest value of each variable seen for a configured device address (panel or master) and turns request objects into outgoing frames.
- **valloxtx** serialises an outgoing frame to the 6-byte buffer that goes on the wire.


# Vallox RX Node

Decodes Vallox RS485 telegrams (6-byte frames) from a raw byte stream. Incoming bytes are buffered until a complete frame is available; misaligned leading bytes are dropped at the next start byte (`0x01`).

- **Input** `msg.payload` — raw bytes (`Buffer` or `number[]`) from the serial port or MQTT.
- **Output 1** — decoded frame object with `domain`, `sender`, `receiver`, `command`, `arg`, `checksum`, `variable` (human name, e.g. `FanSpeed`), `request` (`"GET"` or `"SET"`) and — for `SET` frames — `value` (already converted, e.g. fan speed 1-8 or temperature in °C).
- **Output 2** — error string (bad checksum, wrong frame length, …).

See [`examples/valloxrx.json`](examples/valloxrx.json) for a minimal RX-only flow.


# Vallox TX Node

Encodes a telegram object into a 6-byte frame, ready for the bus. Normally fed by the **vallox** node's second output.

- **Input** `msg.payload` — `{ domain, sender, receiver, command, arg }`. The checksum byte is computed and appended automatically.
- **Output 1** — 6-byte array `[domain, sender, receiver, command, arg, checksum]`.
- **Output 2** — error string.

See [`examples/valloxtx.json`](examples/valloxtx.json) for a minimal TX-only flow.


# Vallox Node

Holds the in-memory state of one Vallox device (panel or master) and generates outgoing requests.

**Configuration**

- **Receiver** — RS485 address of the device this node represents:
  - Panel 1-7: `33`-`39` (0x21-0x27)
  - LON: `40` (0x28)
  - Master 1: `17` (0x11)
- **Send msg on new data** — when checked, output 1 fires every time a matching `SET` frame updates the state.

**Inputs** (one of three shapes on `msg.payload`):

1. A decoded frame from `valloxrx` (object with a `receiver` field) — matching frames update the internal state.
2. A request object `{ request: "GET" | "SET", variable: "<name>", value: <value> }` — produces an outgoing telegram on output 2. A `SET` on a readonly variable goes to output 3 as an error.
3. Anything else (or empty payload) — emits the current state snapshot on output 1.

**Outputs**

1. Current state object — every variable seen so far, keyed by its human-readable name.
2. Outgoing telegram object — feed into `valloxtx`.
3. Error string — e.g. an attempt to `SET` a readonly variable.

See [`examples/vallox.json`](examples/vallox.json) for a complete RX + state + TX + MQTT flow.


# Example: setting the fan speed

To change the fan speed, send a request object to the **vallox** node and wire its output 2 into a **valloxtx** node. The function node that builds the request:

```js
msg.payload = {
    request: 'SET',
    variable: 'FanSpeed',
    value: msg.payload, // 1 .. 8
};
return msg;
```

The same shape is used for every writable variable — look at [`vallox/vallox.js`](vallox/vallox.js) (entries in `VALLOX_COMMAND_VARIABLE_MAPPING` with `readonly: false`) for the full list. Temperature setpoints (`HeatingSetPoint`, `PreHeatingSetPoint`, `InputFanStop`, `HRCBypass`) take a value in °C; the package converts to the NTC sensor byte automatically.

Reading the current state is even simpler: send any non-empty message (or an empty inject) to the **vallox** node and it emits the latest cached state on output 1.

The full flow with fan-speed injection buttons, an HTTP state endpoint and an MQTT bridge is in [`examples/vallox.json`](examples/vallox.json).


# License

Author: Karl-Heinz Wind

The MIT License (MIT)
Copyright (c) 2023 by Karl-Heinz Wind

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
