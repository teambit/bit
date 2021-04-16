const fs = require('fs');
const path = require('path');

const bitDir = path.resolve(__dirname, '..');
const dest = path.join(bitDir, 'node_modules', '@teambit/legacy');

try {
  fs.unlinkSync(dest);
} catch (err) {} // maybe doesn't exist

fs.symlinkSync(bitDir, dest, 'junction');

console.log(`symlink has been created from "${bitDir}" to "${dest}"`);
