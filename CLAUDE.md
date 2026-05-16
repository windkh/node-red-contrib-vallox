# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Node-RED contributed package (`node-red-contrib-vallox`) that exposes three nodes for talking to Vallox ventilation units over their 6-byte RS485 serial protocol. Plain CommonJS, loaded by the Node-RED runtime. There is a Mocha test suite, an ESLint config, and a GitHub Actions workflow that runs both.

## Commands

- `npm ci` — install dev dependencies (Mocha, Chai, node-red-node-test-helper, Node-RED itself for the helper, ESLint v9).
- `npm test` — run the Mocha suite (`test/*.test.js`). The protocol-module tests are pure unit tests; the node tests spin up an in-process Node-RED via `node-red-node-test-helper`.
- `npm run lint` — ESLint v9 flat config (`eslint.config.js`). Narrow scope: `js.configs.recommended` plus a couple of correctness rules; no style rules.
- Local dev against a real Node-RED: symlink or copy this repo into `~/.node-red/node_modules/node-red-contrib-vallox` (or `npm install <path>` from `~/.node-red`) and restart Node-RED. The example flows in [examples/](examples/) can be imported via the Node-RED editor menu.
- CI: `.github/workflows/node.js.yml` runs `npm ci → npm run lint → npm test` on Node 18 / 20 / 22 for every push and PR to `main`.

## Per-task version-bump rule

Every committed task in this repo bumps the patch version in `package.json` and gets a matching `## [x.y.z]` entry in `CHANGELOG.md`, **in the same commit** as the task's substantive change. One task = one bump even when split across multiple commits at the user's request. Match the existing terse format (one `### <summary>` line plus optional bullets). See [`CHANGELOG.md`](CHANGELOG.md) for the established style.

## Architecture

### Entry point and node registration

`package.json` registers a **single entry file** — [vallox/99-vallox.js](vallox/99-vallox.js) — which is a thin delegator that requires each per-node module and invokes it with `RED`:

```
vallox/99-vallox.js       <-- the registered entry; requires the three modules below
vallox/nodes/vallox-rx-node.js
vallox/nodes/vallox-tx-node.js
vallox/nodes/vallox-node.js
```

The companion [vallox/99-vallox.html](vallox/99-vallox.html) supplies the editor UI / palette entries / help text for all three node types — Node-RED pairs it with `99-vallox.js` by basename.

The protocol logic is isolated in [vallox/vallox.js](vallox/vallox.js) and is a port of [windkh/valloxserial](https://github.com/windkh/valloxserial). Per-node files require `../vallox.js` for `decode` / `encode` / `convert` / `constants`.

### The three nodes and how they compose

The nodes are designed to be wired into a pipeline together with a `node-red-node-serialport` (or MQTT) node providing the raw byte stream:

```
serial in  →  valloxrx  →  vallox  →  (your logic / dashboard)
                              ↓
                          valloxtx  →  serial out
```

- **`valloxrx`** ([vallox/nodes/vallox-rx-node.js](vallox/nodes/vallox-rx-node.js)) — Stateful **byte-stream decoder**. Concatenates incoming `msg.payload` Buffers into an internal `buffer`, then repeatedly searches for the `VALLOX_DOMAIN` (0x01) start byte and slices out 6-byte frames. Each frame is sent as a **fresh** msg (not the input `msg` mutated in place) so multiple back-to-back frames in one buffer don't alias each other. Decoded message → output 1; decode/checksum errors → output 2. Drops leading garbage and warns when it does.
- **`valloxtx`** ([vallox/nodes/vallox-tx-node.js](vallox/nodes/vallox-tx-node.js)) — Stateless **encoder**. Takes a `{domain, sender, receiver, command, arg}` object and emits a 6-byte array with the checksum appended.
- **`vallox`** ([vallox/nodes/vallox-node.js](vallox/nodes/vallox-node.js)) — Stateful **device shadow** for one panel/master address. Three input shapes on `msg.payload`, three outputs:
  1. *Decoded message from `valloxrx`* (object with a `receiver` property) — updates internal `state[variable] = value` when `message.receiver` matches the configured `receiver` byte or its high-nibble group; emits state on output 1 when `sendonnewdata` is true.
  2. *Request* (`{ request: 'GET' | 'SET', variable, value }`) — builds an outgoing message via `vallox.convert(...)` and emits it on output 2. Readonly-variable violations go to output 3 and **short-circuit** — output 2 is not emitted (regression bug, see CHANGELOG 0.1.12).
  3. *Anything else (or empty payload)* — emits current state on output 1.

Receiver addresses are configured in the editor (Panel 1 = 0x21 / 33 … Panel 7 = 0x27, LON = 0x28, Master 1 = 0x11) — see [99-vallox.html:127-137](vallox/99-vallox.html#L127-L137).

### Protocol module ([vallox/vallox.js](vallox/vallox.js))

All Vallox-specific knowledge lives here. The shape is intentionally flat:

- **`Constants`** — frame length (6), domain byte (0x01), master address (0x11), `'GET'` / `'SET'` request strings. Frozen and re-exported as `vallox.constants`.
- **`Variables`** — every documented command/variable byte (e.g. `FAN_SPEED = 0x29`, `TEMP_OUTSIDE = 0x32`). The big comment blocks above each entry document the bit layout for flag bytes — keep them in sync when adding decoders.
- **`VALLOX_COMMAND_VARIABLE_MAPPING`** — single source of truth that maps command byte ↔ human variable name ↔ `readonly` flag. `getVariableName`, `getCommand`, and `isReadonly` all read from it. `getVariableMappingEntry` iterates with `for...of` (NOT `for...in` — that's a regression magnet for variables with command bytes above the mapping size; see CHANGELOG 0.1.12).
- **`VALLOX_TEMPERATURE_MAPPING`** — 256-entry NTC lookup table from doc Annex A. `convertTemperature` is just an index lookup; `convertTemperatureBack` does a closest-match inverse scan for SET-ing temperature setpoints.
- **`convertValue` / `convertValueBack`** — central switch statements dispatching to the per-variable converters (`convertFanSpeed`, `convertHumidity`, `convertFlagsN`, `convertSelect`, `convertProgram`, …) and their `*Back` inverses. To add a new writable variable: add to `Variables`, add a mapping entry with `readonly: false`, add a case in `convertValue`, and (if it needs real math, not pass-through) add a case in `convertValueBack`.
- **`decode` / `encode` / `convert`** — the only exports beyond `constants` / `variables`. `decode` verifies the modulo-256 checksum and produces the message object the `vallox` node consumes; `encode` is the inverse without value conversion; `convert(variable, value)` resolves a human name + value to `{command, arg, readonly}`.

## Tests

[test/](test/) holds four Mocha files:

- [test/vallox.test.js](test/vallox.test.js) — pure protocol tests (no Node-RED runtime): decode of Annex B sample frames, checksum/length/empty error paths, `convert → encode → decode` round-trips, readonly enforcement for every writable setpoint, NTC table regression spot-checks (0xD8 in particular), Flags2/Flags6 bit positions.
- [test/vallox-rx-node.test.js](test/vallox-rx-node.test.js), [test/vallox-tx-node.test.js](test/vallox-tx-node.test.js), [test/vallox-node.test.js](test/vallox-node.test.js) — integration via `node-red-node-test-helper`.

Adding a test: the helper boots Node-RED in-process; pattern is `helper.startServer/stopServer` plus a `load(node, flow, cb)` that wires `helper` collector nodes to each output.

## Reference docs

The plaintext extract of the protocol PDF lives at [doc/protocol.txt](doc/protocol.txt) (Annex A is the NTC table, Annex B has worked sample frames and the Helios 3-message write quirk). Consult it — not the code — when adding or fixing variable definitions or bit-layout decoders.
