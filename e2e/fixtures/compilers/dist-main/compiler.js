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

module.exports = {
  compile
};
