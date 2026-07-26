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
        },
    },
    {
        ignores: ['node_modules/**', 'examples/**'],
    },
    // Must stay last: turns off every rule Prettier owns.
    prettier,
];
