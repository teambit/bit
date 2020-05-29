/* eslint-disable no-console */

const ts = require('typescript');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const childProcess = require('child_process');
const tsconfig = require('./tsconfig.default.json');

module.exports = {
  name: 'typescript',
  dependencies: [],
  provider
};

async function provider() {
  const defineCompiler = () => ({ taskFile: 'transpile' });
  return { defineCompiler, watchMultiple, compileFile };
}

/**
 *
 * @param {string} fileContent
 * @param {
 *   {
 *      componentDir: string,
 *      filePath: string
 *   }
 * } options
 */
function compileFile(fileContent, options) {
  const supportedExtensions = ['.ts', '.tsx'];
  const fileExtension = path.extname(options.filePath);
  if (!supportedExtensions.includes(fileExtension)) {
    return null; // file is not supported
  }
  const compilerOptionsFromTsconfig = ts.convertCompilerOptionsFromJson(tsconfig.compilerOptions, '.');
  if (compilerOptionsFromTsconfig.errors.length) {
    throw new Error(`failed parsing the tsconfig.json.\n${compilerOptionsFromTsconfig.errors.join('\n')}`);
  }
  const compilerOptions = compilerOptionsFromTsconfig.options;
  compilerOptions.sourceRoot = options.componentDir;
  const result = ts.transpileModule(fileContent, {
    compilerOptions,
    fileName: options.filePath,
    reportDiagnostics: true
  });

  if (result.diagnostics && result.diagnostics.length) {
    const formatHost = {
      getCanonicalFileName: p => p,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine
    };
    const error = ts.formatDiagnosticsWithColorAndContext(result.diagnostics, formatHost);

    throw new Error(error);
  }

  const replaceExtToJs = filePath => filePath.replace(new RegExp(`${fileExtension}$`), '.js'); // makes sure it's the last occurrence
  const outputPath = replaceExtToJs(options.filePath);
  const outputFiles = [{ outputText: result.outputText, outputPath }];
  if (result.sourceMapText) {
    outputFiles.push({
      outputText: result.sourceMapText,
      outputPath: `${outputPath}.map`
    });
  }
  return outputFiles;
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
