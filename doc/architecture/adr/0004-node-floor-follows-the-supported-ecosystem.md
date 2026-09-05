# 0004 - The Node.js floor follows the supported ecosystem, not the code

## Context

Nothing in this package needs a recent Node.js. The nodes are plain CommonJS with no runtime
dependencies, and the protocol module uses only long-standing APIs — `Buffer`, arithmetic and a
lookup table. Read from the code alone, the floor could be almost anything.

`engines.node` was `>=20.0.0`, and that number had stopped describing a configuration anyone can
actually run:

- Node.js 20 reached end of life on 2026-04-30. It receives no security fixes.
- Node-RED 5 declares `engines { node: ">=22.9" }`, so a supported Node-RED 5 install cannot be on
  Node 20 at all. The package's own floor claimed to support a combination that does not exist.
- ESLint 10, the mandated linter, declares `^20.19.0 || ^22.13.0 || >=24`. A contributor on Node
  20.0-20.18 got an `EBADENGINE` warning from a floor this package had itself set.

Meanwhile the CI matrix carried a 20.x leg, and every dependency decision had to weigh a version
nothing supported.

## Decision

`engines.node` is `>=22.13.0`, and the CI matrix is `[22.x, 24.x]`.

22.13 specifically, because it is ESLint 10's own floor on the 22 line. That removes the mismatch
above, clears Node-RED 5's `>=22.9`, and leaves room below `undici@8`'s `>=22.19`. The publish job
stays pinned at 22.x: it must satisfy the strictest consumer, which is a separate question from
what the package supports.

This follows node-red-standards 0.9.0, which raised the shared floor for the same reasons. The
standard's `sync` deliberately does **not** rewrite an existing floor — it only fills one in when
missing — because raising a published package's floor is a breaking change and belongs in a
release someone chose to cut, not in a tool run. This ADR is that choice.

## Consequences

- **Breaking, and versioned as such**: 0.2.0, not a patch. Under 0.x a minor bump is the breaking
  bump.
- In practice the break is a declaration, not a functional one. The nodes have no runtime
  dependencies and use no syntax or API newer than Node 20, so they will keep working there. What
  changes is that `npm install` prints `EBADENGINE` for such a user, and fails outright under
  `engine-strict=true`. Anyone on a supported Node-RED is already above the floor.
- Node 24 is covered by CI for the first time; the advisory forward-compat job also runs there
  against the newest Node-RED, so the two now agree on the Node version.
- The floor is not a statement about the protocol code, which is why it can move without touching
  `vallox/`. Expect it to move again when the ecosystem's floor does, and record that here rather
  than inferring a reason from the source.
