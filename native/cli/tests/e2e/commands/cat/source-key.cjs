// Ask the installed SourceFile for the exact path string used as FsCache's key.
const path = require('node:path');
const { createRequire } = require('node:module');
const [bitDir, workspace, filename] = process.argv.slice(1);
require(path.join(bitDir, 'dist', 'hook-require.js'));
const bitRequire = createRequire(path.join(bitDir, 'package.json'));
const { SourceFile } = bitRequire('@teambit/component.sources');
const file = SourceFile.load(filename, path.dirname(filename), workspace);
process.stdout.write(file.path);
