#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

// Opt-in to the bundled entry via `BIT_USE_BUNDLE=1`. Defaults to the
// per-aspect dist for now — flip the default after the bundle has been
// proven on CI + a wider command surface.
const bundlePath = path.resolve(__dirname, '..', 'dist', 'bundle', 'bit.cjs');
if (process.env.BIT_USE_BUNDLE === '1' && fs.existsSync(bundlePath)) {
  require(bundlePath);
} else {
  require('../node_modules/@teambit/bit/dist/app');
}
