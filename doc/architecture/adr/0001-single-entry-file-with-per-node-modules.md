# 0001 - Single entry file with per-node modules

## Context

Node-RED loads contributed nodes from the `node-red.nodes` map in `package.json`, pairing each
registered `.js` file with an `.html` file of the same basename. The package grew from a single
`99-vallox.js` holding all three node implementations and the protocol code in one file, which made
the node logic hard to test and hard to read.

Registering three separate entry files was the obvious alternative, but that would mean three HTML
files, and the editor definitions for the three nodes share layout, palette category and much of
their help structure.

## Decision

Register one entry file, `vallox/99-vallox.js`, and make it a thin delegator:

```js
module.exports = function (RED) {
    require('./nodes/vallox-rx-node.js')(RED);
    require('./nodes/vallox-tx-node.js')(RED);
    require('./nodes/vallox-node.js')(RED);
};
```

Each node lives in its own module under `nodes/` and exports a `function (RED)`. All editor
definitions stay in the paired `99-vallox.html`.

## Consequences

- Each node module is small enough to read in one screen and can be loaded in isolation by a test.
- The three nodes are registered together. There is no way to install or disable one of them alone.
- Adding a node means a `require` line here plus a block in the HTML — `package.json` is untouched.
- The delegator must stay free of logic. Anything it does is invisible from the node modules and
  applies to all three at once.
