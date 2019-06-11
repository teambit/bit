/**
 * compiler that supports the capsule interface.
 * do nothing to the source code, just replace ";" with ";\n".
 */
const path = require('path');
const os = require('os');

function compile(files, distPath, context) {
  const destDir = path.join(os.tmpdir(), generateRandomStr());
  return context.isolate(destDir).then(({ capsule, componentWithDependencies }) => {
    const componentRootDir = path.join(destDir, componentWithDependencies.component.writtenPath);
    return files
      .map((file) => {
        const distFile = file.clone();
        distFile.base = distPath;
        distFile.path = path.join(distPath, file.relative);
        distFile.contents = Buffer.from(file.contents.toString().replace(/;/g, ";\n"));
        return distFile;
      });
  });
}

function generateRandomStr(size = 8) {
  return Math.random()
    .toString(36)
    .slice(size * -1);
}

module.exports = {
  compile
};
