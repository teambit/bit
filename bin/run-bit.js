#!/usr/bin/env node
const { platform } = require('process');
const { exec } = require('child_process');
const path = require('path');

const fileNames = {
  linux: 'bit-linux',
  win32: 'bit-win.exe',
  darwin: 'bit-macos'
};

const argsForChild = process.argv && process.argv.length > 2 ? process.argv.slice(2).join(' ') : null;

const pathToChild = path.join(__dirname, '..', 'releases', fileNames[platform]);
const child = exec(`${pathToChild} ${argsForChild}`);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
