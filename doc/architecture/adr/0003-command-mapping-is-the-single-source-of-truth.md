# 0003 - One mapping table is the single source of truth

## Context

Three questions have to be answered constantly: what is this command byte called, which byte does
this name correspond to, and may it be written? Answering each from its own lookup guarantees they
drift apart, and a drifted `readonly` answer is a safety problem (see
[ADR 0002](0002-reject-readonly-writes-before-emitting.md)).

## Decision

`VALLOX_COMMAND_VARIABLE_MAPPING` holds one entry per variable — `{ name, readonly, command }` —
and `getVariableName`, `getCommand` and `isReadonly` all read from it. Nothing else stores a name
or a writability flag.

The object is keyed by numeric command byte, which in JavaScript means array-like integer keys.
Lookups by name iterate `Object.keys(...)` with `for...of`.

## Consequences

- Adding a variable is one entry, and the three questions stay consistent by construction.
- The keys are sparse integers up to `0xC9`. Iterating with `for...in` yields **key strings**, and
  an earlier version compared those against entry names, so every variable whose byte sorted past
  the enumeration order failed to resolve — lookups broke for bytes above roughly `0x2E`, which is
  most of the writable setpoints. Use `for...of` over `Object.keys`; the tests cover a variable at
  each end of the range.
- Because the table is the only source, documentation can be generated from it rather than
  transcribed. `test/readme-tables.test.js` regenerates the README reference tables from this
  mapping and fails if they disagree, so the docs cannot silently rot.
- Lookups by name are a linear scan. With ~45 entries and no hot path, that is not worth an index.
