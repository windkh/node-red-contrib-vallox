# ADR log

One file per decision: `NNNN-title.md` (Context / Decision / Consequences).

| ADR                                                           | Decision                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| [0001](0001-single-entry-file-with-per-node-modules.md)       | Single registered entry file delegating to per-node modules |
| [0002](0002-reject-readonly-writes-before-emitting.md)        | Read-only writes are rejected before a telegram is built    |
| [0003](0003-command-mapping-is-the-single-source-of-truth.md) | One mapping table answers name, byte and writability        |
| [0004](0004-node-floor-follows-the-supported-ecosystem.md)    | The Node.js floor tracks the ecosystem, not the code        |

These record decisions that are not obvious from reading the code, and in two cases the bug that
prompted them. Supersede rather than edit: if a decision changes, add a new ADR and note it here.
