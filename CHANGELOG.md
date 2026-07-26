# Changelog

All notable changes to this project will be documented in this file.

## [0.1.33]

### Adopt the redrafted code-style rules from node-red-standards 0.3.0

The standard's "single exit — exactly one `return`, as the final statement" rule was replaced by four
narrower ones: preconditions first, most likely case next, one exit from the body, and trailing work
in `finally`. Plus: no defensive programming. This release brings the code into line.

- **Fixed a real defect the new wording targets.** The input handler's epilogue — the diagnostics
  status — sat after the framing loop, and the early return on a rejected payload skipped it, so the
  counters went stale until the next good chunk. It now lives in `finally`. Covered by a test, and
  verified by reverting the fix and watching that test fail.
- Removed a defensive guard in `valloxrx` that checked whether `vallox.decode` had called back
  synchronously "in case a future change makes it not so". It was the last statement in a loop body,
  so the `continue` could never do anything — dead code guarding against a hypothetical.
- `toBuffer` reads in order of likelihood now: `Buffer` (what a serial port delivers) first, then the
  rarer shapes, with the per-shape checks extracted into `fromByteArray` / `fromByte` / `fromText`.
  One exit, no nesting.
- `createMessage` puts its three preconditions at the top, then builds the telegram list once and
  emits it in a single loop, rather than returning from four places in the body.
- Enabled the enforceable rules — `no-var` (error), `prefer-const` (warn), `max-statements-per-line`
  — and cleared all 64 findings, all of which were `let` that never gets reassigned.
- `npm run lint` and `lint:fix` now cover `tools/` and `eslint.config.js`; the analyser had never been
  linted, which is how the dead assignment in it survived.

## [0.1.32]

### Sync node-red-standards 0.2.1 and run npm audit fix

- `nrstd sync` refreshed the managed block in `AGENTS.md` and set the runner scripts:
  `test` gains `--test-force-exit --test-timeout=30000 --test-concurrency=1`, and `coverage` /
  `coverage:check` now wrap `npm test` instead of repeating the flags. The flags matter for this
  repo: the node tests boot Node-RED in-process, so serialising them avoids helper-server
  contention and force-exit stops a lingering handle from hanging the run. The c8 thresholds are
  unaffected. Standards audit reports 10/10.
- The sync kept this repo's own `eslint.config.js`, workflows, `dependabot.yml`, `CLAUDE.md` and
  `.claude/settings.json`, which all differ from the templates on purpose.
- `npm audit fix` applied what it could without a breaking change. **The published package remains
  free of advisories** — `npm audit --omit=dev` reports zero, because it has no runtime
  dependencies. The 26 remaining advisories are all inside the `node-red` 3.1.x dev tree
  (`@node-red/*`, express, body-parser, ajv, jsonata, tar), and clearing them needs Node-RED 4.x,
  which the devDependency deliberately avoids so the suite keeps testing the declared floor.

## [0.1.31]

### Document bus addressing and collisions

- New "Bus addressing" section in `README.md`. It spells out that the original Vallox control unit is
  **Panel 1 (`21H` / `33`)** and further panels take `22H`, `23H` … in order — which are the first
  entries in the _Receiver_ dropdown, so the default choice is usually a clash. A duplicate address is
  not detected by the bus: both modules consume the master's replies and both may transmit, and since
  a write is broadcast to all panels and all mainboards it spreads rather than contains the problem.
- The same section explains why the number of transmitters matters: up to 32 modules share one pair
  with no arbitration, and a collision costs more than the frame, because the requester retries for
  10 ms up to ten times before entering a fault state. Includes the measured figures — one bad frame
  per 317 bytes while a panel was writing, against one per 760 on an idle bus — and practical advice
  on polling sparingly, using the seven broadcast registers, and treating a persistent error rate as
  a wiring fault.
- The `vallox` node's help text carries the short version, and the _Receiver_ entry now documents that
  it is the sender address too.

## [0.1.30]

### Write a register the way a real control unit does

Taken from a capture of an original Vallox panel stepping the fan speed 1 → 8 → 1. All 14 changes
used the same three-telegram sequence, and the package was sending one telegram.

- A `SET` now produces three telegrams: to the mainboard with the checksum repeated (7 bytes), then
  to all panels (`0x20`), then to all mainboards (`0x10`). The encoded bytes are identical to the
  panel's — verified against `01 21 11 29 07 63 63`, `01 21 20 29 07 72`, `01 21 10 29 07 62`.
- `encode` honours `repeatChecksum` on a telegram and appends the checksum a second time.
- New **Write like a panel** option on the `vallox` node (on by default). Unticking it sends only the
  mainboard telegram, still with the repeated checksum; the master propagates the change itself, which
  the capture also shows.
- Fixed message aliasing in the `vallox` node: the three telegrams shared one `msg` object, so only
  the last survived. Same defect the RX node had for back-to-back frames.
- A `GET` remains a single telegram and never repeats its checksum.
- Documented that the configured **Receiver** doubles as the sender address of outgoing telegrams, so
  it must not clash with a physical panel.

## [0.1.29]

### Accept the 7-byte write telegram (Annex B)

Found by analysing a capture of a real bus: 17 of the 19 framing complaints in it were not damage at
all, but a documented protocol feature the decoder did not know about.

- Annex B of the protocol document says a write telegram "MUST be followed by sending its CHECKSUM
  twice", making it 7 bytes rather than 6. Real panels do exactly that: `01 22 11 af 86 69 69` is
  panel 2 setting `HRCBypass` on mainboard 1. `valloxrx` now recognises the repeat and consumes it,
  instead of resynchronising through it and reporting `Dropped 1 bytes` each time. On the sample
  capture that took the dropped-byte count from 32 to 15 and the framing complaints from 19 to 2.
- The repeat is only taken when the byte cannot itself begin a valid frame, so a following telegram
  whose checksum happens to be `0x01` is not swallowed. Both cases are covered by tests using frames
  from the capture.
- `tools/analyse-capture.js` counts 7-byte writes separately rather than reporting them as extra
  bytes, and no longer asserts a transport fault on the strength of them. Its "foreign data" advice
  now also covers spliced damaged frames, which is what the residual breaks in the sample turned out
  to be.

## [0.1.28]

### Diagnostics for a lossy byte stream

- `valloxrx` gained two optional settings, both off by default and inert unless configured:
  **Diagnostics** logs every received chunk and every framing decision as hex and puts running
  counters in the node status (bytes, frames decoded out of the number the byte count allows, bytes
  dropped, checksum failures); **Capture file** appends every received byte to a file exactly as it
  arrived.
- Added `tools/analyse-capture.js`, which walks a capture and classifies every point where the
  stream stops being a clean run of 6-byte frames: a **lost byte** (realigns one byte early), an
  **extra byte** (realigns one byte late), a **corrupted byte** (alignment intact, one frame
  unreadable), or **foreign data** (a run that is not Vallox traffic at all — another device on the
  bus, or a gateway injecting its own polling). It reports the repeated run length for foreign data,
  since a constant size means a periodic poll. That separates a transport fault from line noise from
  a bus intruder. Verified against synthetic captures of each kind, including an injected Modbus
  `01 03 00 00 00 0A` poll. Not shipped in the npm package.

## [0.1.27]

### Resynchronise on a single byte, not a whole frame

- `valloxrx` used to consume all six bytes of a window that failed its checksum. `0x01` is only a
  probable frame start — it is also a legal sender, command, argument and checksum value — so that
  window often contained the _next_ frame's real start byte, and discarding it turned one lost byte
  into two lost frames. A failed checksum now gives up only the candidate start byte and rescans.
  Measured over a 200-frame stream with one byte removed at every possible position: the old
  behaviour recovered 198.2 frames on average, the new one recovers all 199.
- A buffer holding no `0x01` at all no longer grows without bound; only the last five bytes are
  kept, since a frame start cannot be further back than that.
- A clean stream still produces no warnings and no errors, which is what makes recurring
  `Dropped n bytes` / `Checksum check failed` messages a signal that something upstream is losing
  bytes rather than noise from the decoder.

## [0.1.26]

### Say what to do when a payload arrives as text

- The rejection message for a string payload now reports its length and a hex preview and names the
  cause: an MQTT node set to `auto-detect` turns any chunk that happens to be valid UTF-8 into a
  string, so a binary telegram stream arrives as a mixture of Buffers and strings. That conversion
  is lossy, so the bytes cannot be recovered in the node — the source has to be set to deliver a
  Buffer. The message says so.

## [0.1.25]

### Fix a crash in `valloxrx` on any payload that is not a Buffer

- A payload that was not a `Buffer` reached `Buffer.concat` and threw. The `input` handler is
  `async`, so the exception became an unhandled rejection and **stopped the whole Node-RED
  process** — reported as `TypeError: The "list[1]" argument must be an instance of Buffer or
Uint8Array. Received type string ('[')`.
- `valloxrx` now accepts every payload shape real flows deliver: a `Buffer` (serial port), a
  `Uint8Array`, a plain array of bytes, and the JSON text `"[1,17,32,...]"` that an MQTT hop
  produces from an array payload. Mixed shapes reassemble across messages.
- Anything else — an object, a string that is not an array, an empty payload, an array holding a
  non-byte — goes to the error output with a message naming the problem. The node keeps working
  afterwards; nothing thrown from this handler can reach the runtime.
- Tests 139 → 150, including the exact input from the crash report.

## [0.1.24]

### Add the second protocol translation and correct the pdftotext extract

- Added `doc/vallox-rs485-protocol.md`: a second translation of the Vallox DIGIT bus protocol that
  keeps the per-register and per-bit `read only` / `write only` markers the pdftotext extract lost.
  It is now the authority for writability; `doc/protocol.txt` is kept because it alone carries
  Annex B (the 12-second broadcast list, the Helios three-recipient write sequence, the
  user-terminal traces).
- Corrected four errors in `doc/protocol.txt`, with a note at the top so they are not reverted:
  `57H` was missing its read-only marker, `A3H` bits 6 and 7 had lost theirs, `34H` was titled
  "EXHAUST TEMPERATURE" (duplicating `33H`; it is extract air), and fault code `08H` read "Exhaust
  air sensor fault" (duplicating `0AH`; it is extract air).
- `test/protocol-doc.test.js` now parses the read/write markers as well as the NTC table: 17
  registers marked read-only in the document are asserted to be non-writable, `8FH`/`91H` are
  asserted writable, and the two translations are checked to agree on the NTC table entry by entry,
  the humidity formula and `03H` ≅ 1 °C. Tests 132 → 139.

## [0.1.23]

### Conform to the Vallox protocol document

Corrections against the official RS485 interface description. Several change values or behaviour on
the wire — see the notes at the end.

- **`request: 'GET'` works.** The read request now carries `0x00` in the command byte and the
  register in the argument, as the request/response principle specifies. It previously built the
  telegram like a `SET`, producing a frame that failed its own checksum, which left every register
  the master does not broadcast unreachable — only `2AH`, `2BH`, `2CH` and `32H`-`35H` are broadcast.
- **`Select` (`A3H`) is writable.** Bits 0-3 are the power, CO2, %RH and post-heating keys; bits 4-7
  are read-only lamps. This is the on/off switch, and it was previously unreachable.
- **`Flags6` (`71H`) is writable.** Bit 5 activates the fireplace/booster function — "read the
  variable and set this number one".
- **`PostHeatingTargetValue` (`57H`) and `FirePlaceBoosterCounter` (`79H`) are read-only**, both
  marked so in the document. `79H` is the countdown of a running function, not a way to start one.
- **`Suspend` (`91H`) and `Resume` (`8FH`) are write-only bus control commands** and can now be
  sent. The `vallox` node also honours received ones: while transmission is prohibited it refuses to
  emit telegrams and reports each refusal on output 3. The block lapses after 10 s so a missed `8FH`
  cannot wedge the node.
- **Bit fields round-trip.** `Select`, `Flags6`, `Program` and `Program2` accept a decoded object as
  well as a raw byte, verified lossless for all 256 values, so read-modify-write works. Writing
  `Program`/`Program2` previously put the object itself into the telegram.
- **Humidity uses the documented formula** `(x - 51) / 2.04`, given for `2AH`, `2FH`, `30H` and
  `AEH`. Values were passed through as raw bytes.
- **Post-heating counter writes round to a whole byte.** `SET PostHeatingOffTime 1` produced an
  argument of `2.5` and a corrupt frame; setpoints are also clamped to `0`-`255`.
- **Corrected variable names:** `InstalledC02Sensors` → `InstalledCO2Sensors` (letter O, not zero)
  and `PostHeastingOnCounter` → `PostHeatingOnCounter`. The old spellings are still accepted as
  request input; decoded messages use the corrected ones.
- A request naming an unknown variable, or a value that cannot encode to a byte, now goes to
  output 3 instead of emitting a malformed telegram.
- Tests 101 → 132, covering the GET frame shape, the suspend gate, the new flags, the humidity
  formula and the bit-field round-trips. README, node help text, example flows and architecture docs
  updated. Coverage 80% → 99%; the c8 thresholds were raised to match.

**Behaviour changes to check in existing flows:** `Humidity`, `HumiditySensor1`, `HumiditySensor2`
and `BasicHumidityLevel` now report %RH rather than the raw byte, so `BasicHumidityLevel` setpoints
are given in %RH too. `PostHeatingTargetValue` and `FirePlaceBoosterCounter` can no longer be
written. `Program2` decodes with `Bit1`-`Bit7` alongside `MaxSpeedLimitMode`.

## [0.1.22]

### Full command/variable reference, architecture docs and generated example flows

- `README.md` gained a command reference: all 21 writable variables and all 24 read-only ones with command byte, unit and meaning, the field names of every object-valued variable, and a section on monitoring. The tables were generated from `VALLOX_COMMAND_VARIABLE_MAPPING`, not transcribed.
- Filled in `doc/architecture/` (overview, structural design, behavioural design) and added ADRs 0001-0003 for the entry-file delegation, the read-only short-circuit and the single mapping table.
- Added two example flows: `examples/vallox-commands.json` (one inject per writable variable) and `examples/vallox-monitor.json` (bus decoding with replayable sample frames, including a corrupt one). Both were generated and every value in them is checked by the suite.
- New tests, 61 → 101: `protocol-doc.test.js` parses `doc/protocol.txt` and verifies all 256 Annex A temperature entries, the fan-speed bit ramp, the fault codes and command-byte coverage; `readme-tables.test.js` fails if the README tables drift from the code; `examples.test.js` validates every shipped flow.
- Documented seven behaviours that disagree with the protocol document or are otherwise surprising — most importantly that `request: 'GET'` builds a malformed frame. Nothing was changed in `vallox/` — see the README's "Notes and known deviations".

## [0.1.21]

### Advisory forward-compat CI job

- Added a second CI job that installs `node-red@latest` over the pinned floor and runs the suite, so a breaking Node-RED release shows up here instead of in an issue. It is `continue-on-error`, because the devDependency deliberately stays on the declared floor and this must not gate a merge. Verified locally: all 61 tests pass against Node-RED 5.0.1.
- Filled the empty "Dependencies" section in `README.md` — the package has no runtime dependencies.

## [0.1.20]

### Declare a real minimum Node-RED version

- `node-red.version` was `>=0.1.0`, which never described anything real. It is now `>=3.1.0`.
- The nodes only use `RED.nodes.createNode` / `registerType`, `node.send` / `status` / `warn` and the `input` / `close` handlers — all present since Node-RED 0.x — so the floor is not set by the code but by `engines.node: >=20`: Node-RED 3.1.0 is the first release that supports Node 20.
- The `node-red` devDependency stays on `^3.1.0` so the suite keeps testing that floor, and dependabot is now told not to raise it on its own.
- Documented the requirement in `README.md`, which previously stated none.

## [0.1.19]

### Dependency sweep: ESLint 10, c8 12, Actions v7

- ESLint 9 → 10 with `@eslint/js` in lockstep. Dependabot could only offer `@eslint/js@10` on its own, which left `npm ci` unresolvable (`@eslint/js@10` declares `peerOptional eslint@^10` against the root's `eslint@9`). The existing flat config needed no changes.
- `eslint-config-prettier` 9 → 10, `c8` 10 → 12, `actions/checkout` and `actions/setup-node` → v7.
- Grouped the eslint packages in `dependabot.yml` so they are always bumped in one PR, and grouped the Actions updates into one PR as well.

## [0.1.18]

### Bump the GitHub Actions to v5

- `actions/checkout` and `actions/setup-node` moved from v4 to v5 in both workflows; v4 targets the Node 20 action runtime that GitHub deprecated, so every job was annotated with a forced-to-Node-24 warning.

## [0.1.17]

### Finish the node-red-standards migration

- Tracked the files `nrstd sync` brought in: `AGENTS.md` (the shared rules, with `CLAUDE.md` now delegating to it), `.prettierrc.json`, `.github/dependabot.yml` and the `doc/architecture/` skeleton.
- Restored the `files` whitelist in `package.json`, which the sync had overwritten.
- Ported the suite off Mocha: `it`/`before`/`after`/`afterEach` callbacks now use node:test's `(t, done)` signature — under Mocha's `(done)` signature `done` was the TestContext, which hung the three helper-based node suites and failed seven protocol tests with "done is not a function".
- Replaced four mechanically-translated `assert.ok(payload.includes({...}))` calls (chai's subset matcher has no `assert` equivalent) with a local `assertSubset` helper, and fixed two `assert.strictEqual(actual, message, expected)` argument swaps.
- Ran `prettier --write` across the repo; added `.prettierignore` for `examples/` (Node-RED editor exports), `doc/protocol.txt` and `package-lock.json`.
- Wired `eslint-config-prettier` into `eslint.config.js` (it was installed but unused) and dropped the stale `globals.mocha` test override.
- CI now runs `lint → format:check → test → coverage:check` and the matrix moved from 18/20/22 to 20/22/24 to match the `engines.node` floor.
- Added c8 thresholds to `package.json` (78% lines/statements, 71% branches, 63% functions — roughly two points under the current 80.4/73.8/65.1, so the gate ratchets without tripping on noise).
- Modernised `npm-publish.yml`: it ran Node 12 on `actions/*@v3` with the test step commented out, which could not have installed the current devDependencies. Now Node 20, `actions/*@v4`, and it runs lint/format/test before publishing.

## [0.1.16]

### Restrict the published tarball with a `files` section

- `package.json` now whitelists `vallox/` (runtime + editor UI + node icons), `examples/` (importable via the Node-RED editor) and `CHANGELOG.md`; `package.json`, `README.md` and `LICENSE` are always included by npm.
- Keeps `test/`, `doc/protocol.txt`, `eslint.config.js`, `.github/`, `.vscode/`, `.claude/` and the unused top-level `icons/` out of the package.

## [0.1.15]

### Track scrubbed `.claude/settings.json`

- Committed the project-shared Claude Code permission allow-list after removing absolute filesystem paths (the file now references repo-relative paths and a couple of narrow Bash one-liners).

## [0.1.14]

### Track the protocol-doc plaintext reference and the CLAUDE orientation doc

- Added `doc/protocol.txt` (pdftotext extraction of the Vallox RS485 protocol PDF) and a project-level `CLAUDE.md` describing the architecture, commands and per-task version-bump rule for future Claude Code sessions. Un-ignored `doc/` in `.gitignore`.

## [0.1.13]

### Adopt per-task changelog and version-bump policy

- Every committed task now bumps the package version and gets a changelog entry; 0.1.8 - 0.1.12 added retroactively for the work done since 0.1.7.

## [0.1.12]

### Unit tests, ESLint and CI integration

- Added Mocha + node-red-node-test-helper suite under `test/` (61 tests covering the protocol module and all three nodes).
- Added ESLint v9 flat config (`js.configs.recommended`, no style rules).
- GitHub Actions runs `npm ci → npm run lint → npm test` on Node 18 / 20 / 22 for every push and PR to main.
- Fixed three bugs the suite surfaced: `getVariableMappingEntry` iterated array indices via `for-in` (broke lookups for any variable byte > ~46); the `vallox` node continued past the readonly errorHandler and also emitted on output 2; `valloxrx` aliased the same `msg` object across back-to-back frames in one buffer.
- Stripped seven stray U+200B zero-width-space characters from FLAGS_2 / FLAGS_6 comment blocks.

## [0.1.11]

### Documentation: node help text and README usage

- Replaced the placeholder help text in all three `99-vallox.html` blocks with the standard Node-RED layout (inputs / outputs / configuration).
- Expanded `README.md` with a Getting Started section, per-node descriptions and a worked example for setting fan speed.

## [0.1.10]

### Refactored: each Node-RED node lives in its own file

- Split `vallox/99-vallox.js` into `vallox/nodes/vallox-rx-node.js`, `vallox/nodes/vallox-tx-node.js` and `vallox/nodes/vallox-node.js`. `99-vallox.js` is now a thin entry that delegates.

## [0.1.9]

### Enable SET on the writable Vallox registers; fix Flags6 bit positions

- Marked all setpoint registers writable per the protocol doc: FanSpeedMax / FanSpeedMin, HeatingSetPoint / PreHeatingSetPoint / InputFanStop / HRCBypass, BasicHumidityLevel, DC fan adjustments, CellDefrostingHysteresis, CO2 setpoints, Program / Program2, ServiceReminder and the post-heating counters.
- Added inverse converters: `convertTemperatureBack` (closest-match inverse NTC lookup), `convertHysteresisBack` (×3), `convertHeatingBack` (×2.5).
- Fixed `convertFlags6` bit positions for RemoteMonitoringControl / FirePlaceSwitchActivator / FirePlaceBoosterStatus (were 3 / 4 / 5; doc says 4 / 5 / 6).

## [0.1.8]

### Fix NTC temperature table entry at 0xD8

- Annex A of the protocol doc lists 0xD8 → 48 °C; the lookup had 49 °C.

## [0.1.7]

### restored lost files

## [0.1.6]

### improved vallox node: variables can be set now: e.g. FanSpeed

## [0.1.5]

### improved vallox node: added example for http usage

## [0.1.4]

### added vallox node

## [0.1.3]

### added conversion of incoming data

## [0.1.2]

### added buffering of incoming data

## [0.1.0]

### Initial version

**Note:** The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
