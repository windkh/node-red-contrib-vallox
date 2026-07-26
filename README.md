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

# Requirements

Node-RED 3.1.0 or newer on Node.js 20 or newer. The nodes themselves use only long-standing
runtime APIs, so the floor is set by Node.js 20: Node-RED 3.1.0 is the first release that
supports it. The test suite runs against that floor.

You also need a byte stream to and from the unit — typically
[node-red-node-serialport](https://flows.nodered.org/node/node-red-node-serialport) on an RS485
adapter, or an MQTT bridge.

# Dependencies

None at runtime — the nodes ship no third-party code and the RS485 protocol is implemented in
this package. See Requirements above for the companion node that provides the byte stream.

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

- **Input** `msg.payload` — raw bytes from the serial port or MQTT: a `Buffer`, a `Uint8Array`, an
  array of bytes, or the JSON text `"[1,17,32,…]"` that an MQTT hop makes of an array payload.
  Anything else is reported on output 2. Chunks need not align with frames, and the shapes may be
  mixed between messages.
- **Output 1** — decoded frame object with `domain`, `sender`, `receiver`, `command`, `arg`, `checksum`, `variable` (human name, e.g. `FanSpeed`), `request` (`"GET"` or `"SET"`) and — for `SET` frames — `value` (already converted, e.g. fan speed 1-8 or temperature in °C).
- **Output 2** — error string (bad checksum, wrong frame length, …).

See [`examples/valloxrx.json`](examples/valloxrx.json) for a minimal RX-only flow.

**Diagnostics** — two optional settings, both off by default:

- **Diagnostics** — logs every received chunk and every framing decision as hex, and puts running
  counters in the node status: bytes received, frames decoded out of the number the byte count
  allows, bytes dropped, checksum failures. A healthy stream is one frame per six bytes with no
  drops.
- **Capture file** — appends every received byte to a file, exactly as it arrived.

Then analyse the capture offline:

```text
node tools/analyse-capture.js C:\temp\vallox.bin
```

It walks the capture, reports every point where the stream stops being a clean run of 6-byte frames,
and says which kind of fault it is: a **lost byte** (the stream realigns one byte early), an **extra
byte** (realigns one byte late), or a **corrupted byte** (alignment intact, one frame unreadable).
Lost and extra bytes point at the transport — gateway chunking, MQTT queueing; corrupted bytes with
the length intact point at the RS485 line itself, such as collisions or missing termination.

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

    This address is **also the sender address of every telegram the node emits**, so it must not be
    one your hardware already uses. See [Bus addressing](#bus-addressing) below.

- **Send msg on new data** — when checked, output 1 fires every time a matching `SET` frame updates the state.
- **Write like a panel** — a `SET` produces the three telegrams a real control unit sends (mainboard with the checksum repeated, then all panels, then all mainboards). Unticking sends only the first; the master propagates the change itself.

**Inputs** (one of three shapes on `msg.payload`):

1. A decoded frame from `valloxrx` (object with a `receiver` field) — matching frames update the internal state.
2. A request object `{ request: "GET" | "SET", variable: "<name>", value: <value> }` — produces an outgoing telegram on output 2. A `SET` on a readonly variable goes to output 3 as an error.
3. Anything else (or empty payload) — emits the current state snapshot on output 1.

**Outputs**

1. Current state object — every variable seen so far, keyed by its human-readable name.
2. Outgoing telegram object — feed into `valloxtx`.
3. Error string — e.g. an attempt to `SET` a readonly variable.

See [`examples/vallox.json`](examples/vallox.json) for a complete RX + state + TX + MQTT flow.

# Bus addressing

The protocol assigns each module an address: mainboards `11H`-`1FH` (1-15), panels and remote
controls `21H`-`2FH` (1-15). `10H` addresses all mainboards at once and `20H` all panels. The
**vallox** node's _Receiver_ setting is both the address whose traffic it adopts and the address it
sends from — it impersonates a panel.

## Do not use an address your own panels occupy

The original Vallox control unit ships as **Panel 1 (`21H` / `33`)**, and each additional panel takes
the next address: `22H`, `23H`, and so on. Those are exactly the values at the top of the _Receiver_
dropdown, so the default choice is usually the wrong one.

Two modules answering to one address is not a configuration error the bus detects. Both consume the
master's replies to that address, both may transmit as it, and because a write is broadcast to all
panels and all mainboards, a duplicate address propagates confusion rather than containing it.

**Pick an address no physical device uses** — the far end of the range (`27H` / `39`, Panel 7) is a
reasonable default for a single Node-RED instance. To see which addresses are taken, tick
_Diagnostics_ on the **valloxrx** node, capture a minute of traffic and look at the senders:

```text
node tools/analyse-capture.js C:\temp\vallox.bin
```

The capture also tells you what to expect: a two-panel system typically shows `panel 1`, `panel 2`
and `mainboard 1` talking, and nothing else.

## Too many transmitters cause collisions

The bus is a single pair shared by up to 32 modules, and nothing arbitrates access — a module
transmits when it has something to say. Two modules starting at once corrupt each other's bytes, and
the protocol's only recovery is the requester's own retry: it waits 10 ms for a reply, repeats the
request up to ten times, and then **puts itself into a fault state**. Corrupted frames therefore cost
more than the frame; they cost bus time that makes further collisions likelier.

Every panel already polls the master continuously, so the bus is busy before you add anything. In a
measured capture the damage rate roughly doubled — one bad frame per 317 bytes against one per 760 —
while a panel was writing setpoints, purely because more modules were transmitting.

Practical consequences:

- **Add as few transmitters as you can.** One Node-RED node per system, not one per dashboard.
- **Poll sparingly.** One `GET` every few seconds covers a rotation of registers; the panels' own
  polling fills in the rest. A tight loop of `GET`s is the easiest way to make a quiet bus noisy.
- **Prefer the broadcasts where they exist.** `Humidity`, both CO2 bytes and the four temperatures
  arrive every 12 seconds unasked — polling them adds traffic for nothing.
- **Expect occasional checksum errors and let the retry work.** A frame lost to a collision reappears
  on the next poll; treat a persistent rate as a wiring problem (termination, biasing, stub length),
  not something to fix by polling harder.

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

The same shape is used for every writable variable — see the [Command reference](#command-reference) below for the full list. Temperature setpoints (`HeatingSetPoint`, `PreHeatingSetPoint`, `InputFanStop`, `HRCBypass`) take a value in °C; the package converts to the NTC sensor byte automatically.

Reading the current state is even simpler: send any non-empty message (or an empty inject) to the **vallox** node and it emits the latest cached state on output 1.

The full flow with fan-speed injection buttons, an HTTP state endpoint and an MQTT bridge is in [`examples/vallox.json`](examples/vallox.json).

# Example flows

Import these from the Node-RED editor menu (**Import → Examples → node-red-contrib-vallox**).

| Flow                                                    | What it shows                                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [`vallox-commands.json`](examples/vallox-commands.json) | One inject per writable variable — every command this package can send, with realistic values |
| [`vallox-monitor.json`](examples/vallox-monitor.json)   | Decoding the bus and caching every variable, with replayable sample frames and a corrupt one  |
| [`vallox.json`](examples/vallox.json)                   | Complete RX + state + TX flow with an MQTT bridge                                             |
| [`valloxrx.json`](examples/valloxrx.json)               | Minimal receive-only flow                                                                     |
| [`valloxtx.json`](examples/valloxtx.json)               | Minimal send-only flow                                                                        |
| [`serialmqtt.json`](examples/serialmqtt.json)           | Bridging the serial port to MQTT, for running the decoder on another host                     |

The two generated flows need no hardware: their inject nodes replay real frames and real requests,
and [`test/examples.test.js`](test/examples.test.js) checks that every value in them is one the
package can actually encode.

# Command reference

Two request shapes go to the **vallox** node. `GET` asks the unit for a register, `SET` writes one:

```js
msg.payload = { request: 'GET', variable: 'TemperatureInside' };
msg.payload = { request: 'SET', variable: 'FanSpeed', value: 4 };
```

Either way the node emits the resulting telegram on output 2; wire that into **valloxtx**. The
answer to a `GET` arrives like any other bus traffic — through `valloxrx`, into the node's cache.
A `SET` aimed at a read-only variable goes to output 3 instead, and no telegram is produced.

Command bytes and the writable/read-only split are the protocol's own, cross-checked against
[`doc/vallox-rs485-protocol.md`](doc/vallox-rs485-protocol.md) and
[`doc/protocol.txt`](doc/protocol.txt) by the test suite.

## Writable variables

| Variable                   | Command | Value          | Meaning                                                                                                                 |
| -------------------------- | ------- | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `BasicHumidityLevel`       | `0xae`  | %RH            | Basic humidity level (`AEH`), the threshold for humidity-driven boosting.                                               |
| `CellDefrostingHysteresis` | `0xb2`  | °C             | Anti-freeze hysteresis (`B2H`), byte = °C × 3.                                                                          |
| `CO2SetPointLower`         | `0xb4`  | ppm, low byte  | Lower byte of the 16-bit CO2 setpoint (`B4H`).                                                                          |
| `CO2SetPointUpper`         | `0xb3`  | ppm, high byte | Upper byte of the 16-bit CO2 setpoint (`B3H`).                                                                          |
| `DCFanInputAdjustment`     | `0xb0`  | %              | DC supply air fan control setpoint (`B0H`).                                                                             |
| `DCFanOutputAdjustment`    | `0xb1`  | %              | DC exhaust fan control setpoint (`B1H`).                                                                                |
| `FanSpeed`                 | `0x29`  | 1 - 8          | Current fan speed (`29H`). Encoded on the wire as `01H,03H,07H,0FH,1FH,3FH,7FH,FFH`.                                    |
| `FanSpeedMax`              | `0xa5`  | 1 - 8          | Highest speed the unit may select while adjusting (`A5H`).                                                              |
| `FanSpeedMin`              | `0xa9`  | 1 - 8          | Basic fan speed (`A9H`). The doc calls this "basic", not "minimum".                                                     |
| `Flags6`                   | `0x71`  | object or byte | `71H`. Set `FirePlaceSwitchActivator` (bit 5) to start the fireplace/booster; bits 4 and 6 are read-only.               |
| `HeatingSetPoint`          | `0xa4`  | °C             | Post-heating setpoint (`A4H`), NTC scale.                                                                               |
| `HRCBypass`                | `0xaf`  | °C             | Heat-recovery cell bypass temperature (`AFH`), NTC scale.                                                               |
| `InputFanStop`             | `0xa8`  | °C             | Supply air fan stops below this temperature (`A8H`), NTC scale.                                                         |
| `MaintenanceMonthCounter`  | `0xab`  | months         | Months remaining until the next service alarm (`ABH`), counts down.                                                     |
| `PostHeatingOffTime`       | `0x56`  | %              | Post-heating off-time counter (`56H`), byte = % × 2.5.                                                                  |
| `PostHeatingOnCounter`     | `0x55`  | %              | Post-heating on-time counter (`55H`), byte = % × 2.5.                                                                   |
| `PreHeatingSetPoint`       | `0xa7`  | °C             | Pre-heating switching temperature (`A7H`), NTC scale.                                                                   |
| `Program`                  | `0xaa`  | object or byte | Adjustment interval and mode bits (`AAH`). Write back a decoded object or a raw byte.                                   |
| `Program2`                 | `0xb5`  | object or byte | Max speed limit mode (`B5H`). Write back a decoded object or a raw byte.                                                |
| `Resume`                   | `0x8f`  | 0              | Allow modules to transmit (`8FH`). Write-only; DATA is always 0.                                                        |
| `Select`                   | `0xa3`  | object or byte | Panel keys and indicator lamps (`A3H`). Bits 0-3 (power, CO2, %RH, post-heating) are writable; 4-7 are read-only lamps. |
| `ServiceReminder`          | `0xa6`  | months         | Service reminder interval (`A6H`).                                                                                      |
| `Suspend`                  | `0x91`  | 0              | Prohibit modules from transmitting (`91H`). Write-only; DATA is always 0.                                               |

## Read-only variables

| Variable                  | Command | Value          | Meaning                                                                                                          |
| ------------------------- | ------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `CO2High`                 | `0x2b`  | ppm, high byte | Upper byte of the measured 16-bit CO2 concentration (`2BH`).                                                     |
| `CO2Low`                  | `0x2c`  | ppm, low byte  | Lower byte of the measured 16-bit CO2 concentration (`2CH`).                                                     |
| `CurrentIncoming`         | `0x2e`  | raw 0 - 255    | Current/voltage message to the machine (`2EH`).                                                                  |
| `FirePlaceBoosterCounter` | `0x79`  | minutes        | Remaining minutes of the fireplace/booster function (`79H`), counts down. Start the function via `Flags6` bit 5. |
| `Flags1`                  | `0x6c`  | object         | `6CH`. Not described in the protocol doc; decoded as `Bit0` - `Bit7`.                                            |
| `Flags2`                  | `0x6d`  | object         | Speed requests and alarms (`6DH`), incl. `CO2Alarm`, `FrostAlarm`.                                               |
| `Flags3`                  | `0x6e`  | object         | `6EH`. Not described in the protocol doc; decoded as `Bit0` - `Bit7`.                                            |
| `Flags4`                  | `0x6f`  | object         | `6FH`: `FrostAlarmWaterRadiator`, `SlaveMasterSelection`.                                                        |
| `Flags5`                  | `0x70`  | object         | `70H`: `PreHeatingStatus`.                                                                                       |
| `Humidity`                | `0x2a`  | %RH            | Highest measured relative humidity of the two sensors (`2AH`).                                                   |
| `HumiditySensor1`         | `0x2f`  | %RH            | Relative humidity measured by sensor 1 (`2FH`).                                                                  |
| `HumiditySensor2`         | `0x30`  | %RH            | Relative humidity measured by sensor 2 (`30H`).                                                                  |
| `InstalledCO2Sensors`     | `0x2d`  | object         | Which CO2 sensors are fitted (`2DH`), `Sensor1Installed` - `5`.                                                  |
| `IoPortFanSpeedRelays`    | `0x06`  | object         | Fan speed relay states (`06H`), `FanSpeedRelay1` - `8`.                                                          |
| `IoPortMultiPurpose1`     | `0x07`  | object         | I/O port 1 (`07H`); only `PostHeatingOn` (bit 5) is defined.                                                     |
| `IoPortMultiPurpose2`     | `0x08`  | object         | I/O port 2 (`08H`): damper, fault relay, fans, pre-heating, fireplace booster.                                   |
| `LastErrorNumber`         | `0x36`  | text           | Last fault, decoded to a sentence (`36H`); unknown codes come through as `0x..`.                                 |
| `PostHeatingTargetValue`  | `0x57`  | °C             | Target temperature of the air blown into the zone (`57H`), NTC scale.                                            |
| `TemperatureExhaust`      | `0x33`  | °C             | Exhaust air temperature (`33H`), NTC scale.                                                                      |
| `TemperatureIncoming`     | `0x35`  | °C             | Supply air temperature (`35H`), NTC scale.                                                                       |
| `TemperatureInside`       | `0x34`  | °C             | Extract air temperature (`34H`), NTC scale.                                                                      |
| `TemperatureOutside`      | `0x32`  | °C             | Outdoor temperature (`32H`), NTC scale.                                                                          |

## Decoded bit fields

Variables whose value is an object decode to the fields below. Entries named `BitN` are positions
the protocol document leaves undefined; they are still reported, which is what lets a decoded
object be written straight back without losing the bits the unit had set.

| Variable               | Fields (bit 0 → 7)                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IoPortFanSpeedRelays` | `FanSpeedRelay1`, `FanSpeedRelay2`, `FanSpeedRelay3`, `FanSpeedRelay4`, `FanSpeedRelay5`, `FanSpeedRelay6`, `FanSpeedRelay7`, `FanSpeedRelay8`                  |
| `IoPortMultiPurpose1`  | `Bit0`, `Bit1`, `Bit2`, `Bit3`, `Bit4`, `PostHeatingOn`, `Bit6`, `Bit7`                                                                                         |
| `IoPortMultiPurpose2`  | `Bit0`, `DamperMotorPosition`, `FaultSignalRelayClosed`, `SupplyFanOff`, `PreHeatingOn`, `ExhaustFanOff`, `FireplaceBoosterClosed`, `Bit7`                      |
| `InstalledCO2Sensors`  | `Bit0`, `Sensor1Installed`, `Sensor2Installed`, `Sensor3Installed`, `Sensor4Installed`, `Sensor5Installed`, `Bit6`, `Bit7`                                      |
| `Flags1`               | `Bit0`, `Bit1`, `Bit2`, `Bit3`, `Bit4`, `Bit5`, `Bit6`, `Bit7`                                                                                                  |
| `Flags2`               | `CO2HigherSpeedRequest`, `CO2LowerSpeedRequest`, `HumiditySpeedRequest`, `SwitchSpeedRequest`, `Bit4`, `Bit5`, `CO2Alarm`, `FrostAlarm`                         |
| `Flags3`               | `Bit0`, `Bit1`, `Bit2`, `Bit3`, `Bit4`, `Bit5`, `Bit6`, `Bit7`                                                                                                  |
| `Flags4`               | `Bit0`, `Bit1`, `Bit2`, `Bit3`, `FrostAlarmWaterRadiator`, `Bit5`, `Bit6`, `SlaveMasterSelection`                                                               |
| `Flags5`               | `Bit0`, `Bit1`, `Bit2`, `Bit3`, `Bit4`, `Bit5`, `Bit6`, `PreHeatingStatus`                                                                                      |
| `Flags6`               | `Bit0`, `Bit1`, `Bit2`, `Bit3`, `RemoteMonitoringControl`, `FirePlaceSwitchActivator`, `FirePlaceBoosterStatus`, `Bit7`                                         |
| `Select`               | `PowerState`, `Co2AdjustState`, `HumidityAdjustState`, `HeatingState`, `FilterGuardIndicator`, `HeatingIndicator`, `FaultIndicator`, `ServiceReminderIndicator` |
| `Program`              | `AdjustmentIntervalMinutes`, `AutomaticHumidityLevelSeekerState`, `BoostSwitchMode`, `RadiatorType`, `CascadeAdjust`                                            |
| `Program2`             | `MaxSpeedLimitMode`, `Bit1`, `Bit2`, `Bit3`, `Bit4`, `Bit5`, `Bit6`, `Bit7`                                                                                     |

## Monitoring all variables

The master broadcasts **seven** registers to all panels every 12 seconds — `Humidity`, `CO2High`,
`CO2Low` and the four temperatures. Everything else has to be asked for. Wire the bus through
`valloxrx` into a `vallox` node and both paths land in the same cache:

```text
serial in  →  valloxrx  →  vallox  →  debug
                             ↑ ↓
                        GET requests  →  valloxtx  →  serial out
```

A practical setup polls the registers you care about on a rotation — one every few seconds is
plenty, and the panels do the same thing:

```js
// in a function node driven by an inject on a repeat
const registers = ['FanSpeed', 'Select', 'FanSpeedMax', 'HeatingSetPoint', 'LastErrorNumber'];
const i = (context.get('i') || 0) % registers.length;
context.set('i', i + 1);
msg.payload = { request: 'GET', variable: registers[i] };
return msg;
```

Two ways to read the cache:

- **Push** — tick _Send msg on new data_ and output 1 fires on every state change.
- **Pull** — send the node any message with an empty payload; the current snapshot arrives on output 1.

The snapshot is a flat object keyed by the variable names in the tables, plus `Receiver`. Variables
that have not been seen yet are simply absent, so guard with a check rather than assuming a key
exists. A `vallox` node only accepts frames addressed to its configured receiver or to that
address's group (high nibble), so a panel node at `0x21` also sees frames sent to `0x20`.

See [`examples/vallox-monitor.json`](examples/vallox-monitor.json) for a ready-made flow.

## Changing a bit field

`Select`, `Flags6`, `Program` and `Program2` are single bytes holding several settings, and only
some bits may be written. Read the current value, change what you want and write the whole object
back — the decode/encode pair round-trips exactly, so the bits you did not touch are returned
unchanged:

```js
// switch the unit on: Select bit 0
const select = { ...flow.get('valloxState').Select, PowerState: true };
msg.payload = { request: 'SET', variable: 'Select', value: select };
return msg;
```

```js
// start the fireplace/booster function: Flags6 bit 5
const flags = { ...flow.get('valloxState').Flags6, FirePlaceSwitchActivator: true };
msg.payload = { request: 'SET', variable: 'Flags6', value: flags };
return msg;
```

A raw byte works too — `value: 0x0d` is equivalent to the object form.

## Notes and known deviations

- **`Suspend` and `Resume` stop and start bus traffic for every module.** They exist because the
  unit uses them around CO2 sensor interaction; sending them yourself is rarely what you want. The
  `vallox` node watches for them and refuses to emit telegrams while transmission is prohibited,
  reporting the refusal on output 3. Because a missed `8FH` would otherwise wedge the node, that
  block also lapses by itself after 10 seconds.
- **`FanSpeedMin` is the protocol's "basic fan speed"** (`A9H`), not a floor. The name is kept for
  compatibility with existing flows.
- **`Flags1` (`0x6C`) and `Flags3` (`0x6E`) are not in the protocol document.** They decode to bare
  `Bit0`-`Bit7`.
- **`IoPortMultiPurpose2` (`0x08`) is treated as read-only** although the document leaves bits 3 and
  5 unmarked. Those bits stop the supply and exhaust fans, and `0x06` carries an explicit warning
  that driving the I/O ports can damage the transformer. Use `FanSpeed` instead.
- **`Program2` bits 1-7 are undefined** in the document. They are decoded and written back as-is.
- **The misspelled names `PostHeastingOnCounter` and `InstalledC02Sensors` are still accepted** as
  input for backwards compatibility. Decoded messages always use the corrected spelling.
- **A write is three telegrams**, matching what a real control unit sends: to the mainboard with the
  checksum repeated (7 bytes), then to all panels (`0x20`), then to all mainboards (`0x10`). This was
  taken from a capture of an original panel changing the fan speed, and the encoded bytes are
  identical to it. Untick _Write like a panel_ to send only the telegram to the mainboard; the master
  propagates the change itself, so that is usually enough.
- **The configured receiver is also the sender address of outgoing telegrams.** Choose an address no
  physical panel occupies, or two devices will answer to the same address.
- **`CellDefrostingHysteresis` follows the document** (`03H` ≈ 1 °C, so byte = °C × 3). Note that
  the `valloxserial` Arduino library treats `B2H` as an NTC temperature instead; the two disagree.

# License

Author: Karl-Heinz Wind

The MIT License (MIT)
Copyright (c) 2023 by Karl-Heinz Wind

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
