#!/usr/bin/env node
const { platform } = require('process');
const { exec } = require('child_process');
const path = require('path');
const { CURRENT_DEFAULT_BINARY_PATH, CURRENT_BINARY_PATH } = require('../scripts/scripts-constants');
const fs = require('fs-extra');

const argsForChild = process.argv && process.argv.length > 2 ? process.argv.slice(2).join(' ') : '';

let existingBinary = CURRENT_DEFAULT_BINARY_PATH;
if (fs.existsSync(CURRENT_DEFAULT_BINARY_PATH)) {
  existingBinary = CURRENT_DEFAULT_BINARY_PATH;
} else if (fs.existsSync(CURRENT_BINARY_PATH)) {
  existingBinary = CURRENT_BINARY_PATH;
} else {
  console.log('could not find bit executable');
  process.exit();
}
const child = exec(`${existingBinary} ${argsForChild}`, {
  env: Object.assign({}, process.env, { FORCE_COLOR: 1 })
});
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
child.on('exit', function (code, signal) {
  process.exit(code);
});
