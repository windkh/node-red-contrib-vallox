'use strict';

const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
    js.configs.recommended,
    {
        files: ['vallox/**/*.js', 'test/**/*.js', 'tools/**/*.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            // Loose on style; tight on correctness.
            'no-unused-vars': ['warn', { args: 'none' }],
            'no-empty': ['error', { allowEmptyCatch: true }],
            'no-constant-condition': ['error', { checkLoops: false }],
            // From node-red-standards. The rest of that section - preconditions first, most likely
            // case next, one exit from the body, trailing work in finally, no defensive checks - has
            // no core rule and is enforced by review.
            'no-var': 'error',
            'prefer-const': 'warn',
            'max-statements-per-line': ['warn', { max: 1 }],
        },
    },
    {
        ignores: ['node_modules/**', 'examples/**'],
    },
    // Must stay last: turns off every rule Prettier owns.
    prettier,
];
