const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const childProcess = require('child_process');

module.exports = {
  name: 'typescript',
  dependencies: [],
  provider
};

async function provider() {
  const defineCompiler = () => ({ taskFile: 'transpile' });
  return { defineCompiler, watchMultiple };
}

function watchMultiple(capsulePaths) {
  const md5 = crypto.createHash('md5');
  const hash = md5.update(capsulePaths.join(','));
  const capsulePathsHash = hash.digest('hex');

  const tmpDir = os.tmpdir();
  const tsconfigFilename = `${capsulePathsHash}-tsconfig.json`;
  const mainTsconfigPath = path.join(tmpDir, tsconfigFilename);
  console.log('watchMultiple -> mainTsconfigPath', mainTsconfigPath);
  const references = capsulePaths.map(capsulePath => ({ path: capsulePath }));
  const mainTsconfig = {
    files: [],
    include: [],
    references
  };
  fs.writeFileSync(mainTsconfigPath, JSON.stringify(mainTsconfig, null, 2));
  console.log('__dirname', __dirname);
  const tscPath = path.join(__dirname, 'node_modules/.bin/tsc');
  const results = childProcess.exec(`${tscPath} --build ${tsconfigFilename} -w`, { cwd: tmpDir });
  return results;
}
