function ensureMainFile(versionModel: Object): Object {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (!versionModel.mainFile) {
    // Find the first file which is not test file
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const mainFile = versionModel.files.find(file => !file.test);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    versionModel.mainFile = mainFile.relativePath;
  }
  return versionModel;
}

export default {
  name: 'ensure main file exists',
  migrate: ensureMainFile
};
