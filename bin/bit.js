#!/usr/bin/env node
'use strict';

try {
  require('../node_modules/@teambit/bit/dist/app');
  // require('../node_modules/@teambit/cli/dist/app');
} catch (err) {
  if (err.code && err.code === 'MODULE_NOT_FOUND' && err.message && err.message.includes('cli/dist')) {
    console.error(`** bit was moved. please run "npm run install-harmony && npm run build-harmony", then try again **`);
    process.exit(1);
  }
  throw err;
}
