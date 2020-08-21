#!/usr/bin/env node
'use strict';

try {
  require('../node_modules/@teambit/cli/dist/app');
} catch (err) {
  console.error(`** bit was moved. please run "npm run install-harmony && npm run build-harmony", then try again **`);
  process.exit(1);
}
