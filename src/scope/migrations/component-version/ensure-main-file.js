/** @flow */

function ensureMainFile(versionModel: Object): Object {
  if (!versionModel.mainFile) {
    // Find the first file which is not test file
    const mainFile = versionModel.files.find(file => !file.test);
    versionModel.mainFile = mainFile.relativePath;
  }
  return versionModel;
}

export default {
  name: 'ensure main file exists',
  migrate: ensureMainFile
};
