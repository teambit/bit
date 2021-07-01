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

// const destParent = path.join(bitDir, 'node_modules', '@teambit', 'legacy');
// const srcDist = path.join(bitDir, 'dist');
// const destDist = path.join(destParent, 'dist');
// const srcPackageJson = path.join(bitDir, 'package.json');
// const destPackageJson = path.join(destParent, 'package.json');

// try {
//   fs.rmdirSync(destParent, { recursive: true });
// } catch (err) {} // maybe doesn't exist

// try {
//   fs.unlinkSync(destParent);
// } catch (err) {} // maybe doesn't exist or not a symlink

// fs.mkdirSync(destParent, { recursive: true });
// fs.symlinkSync(srcDist, destDist, 'junction');
// fs.symlinkSync(srcPackageJson, destPackageJson);

// console.log(`symlink has been created from "${srcDist}" to "${destDist}"`);
// console.log(`symlink has been created from "${srcPackageJson}" to "${destPackageJson}"`);
