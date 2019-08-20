/**
 * this compiler generates an additional dist main-file which is different than the source main-file
 */
const path = require('path');

function compile(files, distPath) {
  const dists = files
    .map((file) => {
      const distFile = file.clone();
      distFile.base = distPath;
      distFile.path = path.join(distPath, file.relative);
      return distFile;
    });
    const mainDist = dists[0].clone();
    const mainDistPath = `${mainDist.relative.replace(/.js/,'')}-main.js`;
    mainDist.path = path.join(distPath, mainDistPath);
    mainDist.contents = Buffer.from(files[0].contents.toString().replace(/from source/g, 'from dist'));
    dists.push(mainDist);
    return { dists, mainFile: mainDist.relative };
}

const newCompilerApi = {
  init: ({ rawConfig, dynamicConfig, api }) => {
    logger = api.getLogger();
    return { write: true };
  },
  action: ({
    files,
    rawConfig,
    dynamicConfig,
    configFiles,
    api,
    context
  }) => {
    // don't remove the next line, it is important for the tests to make sure the new api is used
    console.log('using the new compiler API');
    const distPath = path.join(context.rootDistDir, 'dist');
    return compile(files, distPath, context);
  }
}

const currentCompilerApi = { compile };

const isNewAPI = false;

module.exports = isNewAPI ? newCompilerApi : currentCompilerApi;
