# AGENTS.md — node-red-contrib-vallox

<!-- BEGIN node-red-standards:managed (do not edit — run `nrstd sync`) -->

> These shared rules are maintained centrally in **node-red-standards** and refreshed here by
> `nrstd sync`. Do not edit between the managed markers — change the standard instead. Everything
> below the managed block (the "Project-specific rules" section) is yours and is never overwritten.

## Shared: Architecture

- Node packages are modular: `lib/` holds framework-independent, unit-testable core logic;
  `nodes/` holds one file per Node-RED node; `icons/` holds node icons.
- The registered entry file (`<pkg>/99-<name>.js`) is a thin delegator that only `require`s and
  registers the modules in `nodes/`. Keep runtime glue thin.
- Record non-trivial design decisions as an ADR in `doc/architecture/adr/`.

## Shared: Code style

- Lint: ESLint flat config (`eslint.config.js`), ESLint >= 10. Run the lint script before committing.
  `eslint` and `@eslint/js` must stay on the same major: `@eslint/js@10` peers on `eslint@^10`, and
  pairing `eslint@10` with `@eslint/js@9` silently keeps the v9 recommended rule set.
- ESLint 10's recommended set adds `no-unassigned-vars` and `no-useless-assignment`. Both are errors:
  don't declare a binding only to pass `undefined` around, and don't assign a value no later
  statement reads.
- Format: Prettier (`.prettierrc.json`) — 4-space indent, single quotes, es5 trailing commas.
- Target Node.js >= 22.13.
- Avoid `var` — use `const`, or `let` only when the binding is reassigned (enforced by `no-var` / `prefer-const`).
- One statement per line — don't pack multiple instructions onto a single line; keep lines simple to read (enforced by `max-statements-per-line`).
- Keep functions short, with a single exit:
    - **One exit per function.** A function leaves in exactly one place: its last statement. This
      includes guard clauses — an early `return` in a precondition check is still a second exit and is
      not allowed. Assign to a single result and return it as the last statement. `throw` is the one
      permitted exception, because it is not a return and a `finally` still runs.
    - **Validate by nesting, not by leaving.** State the precondition as the condition that must hold
      and put the work inside it, with the error path in the `else`. Where the caller is code, `throw`
      instead; where the caller is a Node-RED flow, the `else` calls the error path.
    - **Keep functions short enough that the nesting does not matter.** The objection to nesting is
      really an objection to long functions — at a readable length, one or two levels of indentation
      cost nothing. If the nesting starts to hurt, extract a function; never add a second exit.
    - **Most likely case first within each branch**, so a reader meets what the function normally does
      before the exceptions.
    - **If every path must do trailing work, put that work in `finally`** rather than repeating it
      before each exit — combined with the single exit this makes the epilogue unskippable.
- No defensive programming. Do not check for states that cannot occur, and do not guard against
  hypothetical future changes to code you control. Validate input at the boundary and then trust it.

## Shared: Tests

- Node's built-in test runner (`node --test`) + `node-red-node-test-helper`. Tests live in `test/` as `*.test.js`.
  Import `{ describe, it }` from `node:test` and assert with `node:assert`. Coverage via `c8`.
- Node's default discovery runs **every** `.js` under `test/`, whatever it is named, so shared helpers and
  fixtures belong outside that directory (e.g. `test-helpers/`). The test script deliberately takes no path
  arguments: a bare directory is read as a module specifier on Node 22 ("Cannot find module"), and keeping
  helpers out of `test/` is the simpler rule. A glob (`node --test 'test/**/*.test.js'`) does work on the
  supported range and a repo may scope discovery that way if it prefers.
- The test script deliberately has **no `--test-force-exit`**. It calls `process.exit()` as soon as the last
  test finishes, racing libuv's teardown of undici keep-alive sockets and mock HTTP servers — on Windows that
  aborts the process _after_ the results are in, so the runner marks a whole file failed while every test in
  it passed (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`). A suite that exits on its own has
  also _proved_ it leaks no handles, which the flag hides. If the suite ever stops exiting, find the open
  handle — don't reinstate the flag.
- A node file exports `function (RED) {…}`, so without a RED object its contents cannot run at all —
  which is why node files tend to sit at 0% coverage. **Fix that structurally, not with a fake runtime.**
  Almost nothing in such a closure needs `RED`: move it into a plain module beside the node file and test
  it directly, with `nock` intercepting the requests so the assertion is about what actually went to the
  device rather than what a parser intended. What remains in the node file is glue — `createNode`,
  `getNode`, status calls, handler registration.
- Where a test does need a Node-RED shape, **mock the node object, not the RED runtime**: keep the
  dispatcher as `handleInput(node, msg)` and hand it a plain object capturing `status` / `warn` /
  `error` / `send`. Such a mock is repo-specific — keep it in `test-helpers/`, local to the repo. The
  standard deliberately ships no shared RED harness; a shared one invites tests to reach business logic
  through it, which is what leaves the logic in the closure.
- Still keep one **wiring test** for the node file, with a minimal RED stub inline in that test file:
  otherwise nothing loads the node file and a wrong `require` path passes CI and fails at Node-RED start.
- Discovery is repo-wide: `node --test` runs `**/*.test.?(c|m)js` anywhere outside `node_modules`, so a
  sample spec under `examples/` is executed too. Name those files something else.

## Shared: Documentation

- `README.md` is user-facing. Architecture docs live under `doc/architecture/`
  (`overview.md`, `structural-design.md`, `behavioural-design.md`, `adr/`).
- Update `CHANGELOG.md` (Keep a Changelog style) for every user-visible change; bump the
  patch version in `package.json` in the same commit.

## Shared: Workflow

- CI (`.github/workflows/node.js.yml`) must pass: lint, format:check, test, coverage. The coverage
  report is uploaded as a build artifact, so a threshold failure can be inspected from the run.
- Releases go through `.github/workflows/npm-publish.yml`, triggered by pushing a version tag (`v*` /
  `V*`). **Pushing a tag publishes** — there is no second confirmation and `npm publish` is
  irreversible. The `verify` job is the whole safety margin: it re-runs lint, format:check and test on
  the CI matrix, and `publish-npm` declares `needs: verify`. A release is cut from a tag, and nothing
  guarantees that tag points at a commit CI ever saw.
- The tag must agree with `package.json`; `verify` fails otherwise. npm publishes the manifest version,
  not the tag name, so a mismatch publishes the wrong number under a tag that lies about it — and burns
  the intended number for good.
- A semver pre-release tag (`v1.2.3-beta.1`) publishes to the `beta` dist-tag, so Manage Palette users
  tracking `latest` are not pulled onto it. The workflow creates the GitHub release itself with
  generated notes, so `git push --tags` is the whole release.
- `.github/workflows/standards-check.yml` runs `nrstd audit` and fails the build on drift from the standard.
- Never bump the major version without an ADR explaining the breaking change.

## Shared: package.json scripts

`lint`, `lint:fix`, `format`, `format:check`, `test` (`node --test` with `--test-timeout=30000 --test-concurrency=1`, no path args), `coverage` / `coverage:check` (c8 over `npm test`).

The `c8` block carries `reporter: ["text", "lcov"]` — CI uploads `coverage/lcov.info`, and without the
lcov reporter that step ships nothing. Coverage threshold **values** are the repo's own call; `nrstd
sync` never sets or changes them.

But `c8.lines` must be stated, and `audit` checks that it is: c8 defaults `lines` to **90** (branches,
functions and statements default to 0), so a repo that states nothing runs a 90% gate nobody chose.
Omitting the other three reads as "no gate" and is fine. Pick `lines` from the current measurement,
rounded down.

<!-- END node-red-standards:managed -->

## Project-specific rules

## What this is

A Node-RED contributed package (`node-red-contrib-vallox`) that exposes three nodes for talking to Vallox ventilation units over their 6-byte RS485 serial protocol. Plain CommonJS, loaded by the Node-RED runtime. There is a node:test suite, an ESLint config, and a GitHub Actions workflow that runs both.

## Commands

- `npm ci` — install dev dependencies (node-red-node-test-helper, Node-RED itself for the helper, ESLint v9, c8).
- `npm test` — run the suite via `node --test` (`test/*.test.js`). The protocol-module tests are pure unit tests; the node tests spin up an in-process Node-RED via `node-red-node-test-helper`.
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
    1. _Decoded message from `valloxrx`_ (object with a `receiver` property) — updates internal `state[variable] = value` when `message.receiver` matches the configured `receiver` byte or its high-nibble group; emits state on output 1 when `sendonnewdata` is true.
    2. _Request_ (`{ request: 'GET' | 'SET', variable, value }`) — builds an outgoing message via `vallox.convert(...)` and emits it on output 2. Readonly-variable violations go to output 3 and **short-circuit** — output 2 is not emitted (regression bug, see CHANGELOG 0.1.12).
    3. _Anything else (or empty payload)_ — emits current state on output 1.

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

[test/](test/) holds four `node:test` files:

- [test/vallox.test.js](test/vallox.test.js) — pure protocol tests (no Node-RED runtime): decode of Annex B sample frames, checksum/length/empty error paths, `convert → encode → decode` round-trips, readonly enforcement for every writable setpoint, NTC table regression spot-checks (0xD8 in particular), Flags2/Flags6 bit positions.
- [test/vallox-rx-node.test.js](test/vallox-rx-node.test.js), [test/vallox-tx-node.test.js](test/vallox-tx-node.test.js), [test/vallox-node.test.js](test/vallox-node.test.js) — integration via `node-red-node-test-helper`.

Adding a test: the helper boots Node-RED in-process; pattern is `helper.startServer/stopServer` plus a `load(node, flow, cb)` that wires `helper` collector nodes to each output.

## Reference docs

Two translations of the protocol document are kept, and they are the authority when adding or fixing variable definitions or bit-layout decoders — not the code, and not the `valloxserial` Arduino library this package was ported from.

- [doc/vallox-rs485-protocol.md](doc/vallox-rs485-protocol.md) — **use this for read/write classification.** It has the per-register and per-bit `read only` / `write only` markers.
- [doc/protocol.txt](doc/protocol.txt) — pdftotext extract of the other translation. Four spots were corrected against the file above; the header lists them. It alone has Annex B (the 12-second broadcast list, worked sample frames, the Helios 3-message write quirk).

`test/protocol-doc.test.js` parses both at test time, so a variable whose flags contradict the documents fails the build.
