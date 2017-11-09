/** @flow */

function toFiles(versionModel: Object): Object {
  if (versionModel.impl) {
    versionModel.files = versionModel.files || [];
    const file = {
      file: versionModel.impl.file,
      name: versionModel.impl.name,
      relativePath: versionModel.impl.name,
      test: false
    };
    versionModel.files.push(file);
    delete versionModel.impl;
  }
  if (versionModel.specs) {
    versionModel.files = versionModel.files || [];
    const file = {
      file: versionModel.specs.file,
      name: versionModel.specs.name,
      relativePath: versionModel.specs.name,
      test: true
    };
    versionModel.files.push(file);
    delete versionModel.specs;
  }
  return versionModel;
}

export default {
  name: 'convert impl / specs to files array',
  migrate: toFiles
};
