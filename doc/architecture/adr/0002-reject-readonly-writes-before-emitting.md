# 0002 - Reject read-only writes before emitting a telegram

## Context

Most Vallox variables are sensor readings the unit publishes: temperatures, humidity, CO2, alarm
flags. Writing to them is meaningless, and the protocol document marks several of them read-only
explicitly. The `06H` I/O port carries a blunt warning that setting more than one bit at once
"burns the transformer".

The mapping in `vallox.js` records a `readonly` flag per variable, and the `vallox` node checks it
when a `SET` request arrives. The original implementation called the error handler and then carried
on, so a rejected write still produced a telegram on output 2 — a flow wired straight into
`valloxtx` put it on the bus regardless.

## Decision

The read-only branch reports on the error output and **returns immediately**. No telegram is built
and output 2 stays silent.

`GET` requests skip the check entirely, since reading a read-only variable is exactly what it is
for.

## Consequences

- A rejected write cannot reach the bus, whatever the flow is wired to.
- Callers cannot distinguish "rejected" from "nothing happened" by watching output 2 alone; they
  have to wire output 3. Each rejection also calls `node.warn`, so it is visible in the debug
  sidebar by default.
- The `readonly` flags become safety-relevant, not merely informational. A wrong flag either blocks
  a legitimate write or permits a dangerous one, so they are taken from the protocol document rather
  than from observed behaviour. Two known disagreements with the document are recorded in the
  README under "Notes and known deviations".
- `test/vallox.test.js` asserts the flag for every writable setpoint and every sensor variable, and
  `test/vallox-node.test.js` asserts that output 2 stays silent on rejection.
