/**
 * # Babel-based transpiling environment.
 * Bit build environment for transpiling using Bit.
 *
 * ## How to use?
 *
 * Import the environment
 * ```bash
 *  bit import bit.envs/compilers/babel -cs
 * ```
 *
 * ## What's inside
 * - Babel with [babel-preset-latest](https://babeljs.io/docs/plugins/preset-latest/).
 * @bit
 */
require('babel-preset-latest');
require('babel-plugin-transform-object-rest-spread');
const babel = require('babel-core');
const Vinyl = require('vinyl');
// const vinylFile = require('vinyl-file');
const path = require('path');

function runBabel(file, options, distPath) {
  const { code, map } = babel.transform(file.contents.toString(), options);
  const mappings = new Vinyl({
    contents: Buffer.from(map.mappings),
    base: distPath,
    path: path.join(distPath, file.relative),
    basename: `${file.basename}.map`
  });
  const distFile = file.clone();
  distFile.base = distPath;
  distFile.path = path.join(distPath, file.relative);
  distFile.contents = code ? Buffer.from(`${code}\n\n//# sourceMappingURL=${mappings.basename}`) : Buffer.from(code);
  return [mappings, distFile];
}
function compile(files, distPath) {
  const options = {
    presets: [require.resolve('babel-preset-latest')],
    sourceMaps: true,
    ast: false,
    minified: false,
    plugins: [require.resolve('babel-plugin-transform-object-rest-spread')]
  };

  return files.map(file => runBabel(file, options, distPath)).reduce((a, b) => a.concat(b));

}

module.exports = {
  compile
};

// For testing purpose - just uncomment this and also the vinylFile require in the top
/*
 const file = vinylFile.readSync('test.js');
 const y = compile([file],"/Users/Amit/Desktop/playground/consumer/dist");
 console.log(file.contents.toString());
 console.log(y[1].contents.toString());

 */
