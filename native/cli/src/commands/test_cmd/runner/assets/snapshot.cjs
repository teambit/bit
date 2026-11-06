const path = require('node:path');
const fs = require('node:fs');
const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.mjs', '.cjs'];
const replaceExtension = (filename, extension) => {
  const parsed = path.parse(filename);
  return path.join(parsed.dir, parsed.base.replace(parsed.ext, extension));
};
module.exports = {
  resolveSnapshotPath: (testPath, extension) => `${path.dirname(testPath)}/__snapshots__/${replaceExtension(path.basename(testPath), '.js')}${extension}`,
  resolveTestPath: (snapshotPath, extension) => {
    const candidate = snapshotPath.replace(/(\\|\/)__snapshots__/gi, '').replace(extension, '');
    for (const suffix of extensions) {
      const filename = replaceExtension(candidate, suffix);
      if (fs.existsSync(filename)) return filename;
    }
    return candidate;
  },
  testPathForConsistencyCheck: 'src/__test__/Post.spec.js',
};
