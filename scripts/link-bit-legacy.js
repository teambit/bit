const fs = require('fs');
const path = require('path');

const bitDir = path.resolve(__dirname, '..');
const destParent = path.join(bitDir, 'node_modules', '@teambit');
const dest = path.join(destParent, 'legacy');

try {
  fs.rmdirSync(dest, { recursive: true });
} catch (err) {} // maybe doesn't exist

try {
  fs.unlinkSync(dest);
} catch (err) {} // maybe doesn't exist or not a symlink

fs.mkdirSync(destParent, { recursive: true });
fs.symlinkSync(bitDir, dest, 'junction');

console.log(`symlink has been created from "${bitDir}" to "${dest}"`);
