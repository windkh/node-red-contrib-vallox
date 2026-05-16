# Changelog
All notable changes to this project will be documented in this file.

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
