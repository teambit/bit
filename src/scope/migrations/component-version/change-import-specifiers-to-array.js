/** @flow */

/**
 * When a component has ImportSpecifier data, change it from an object to an array
 */
function updateImportSpecifiers(versionModel: Object): Object {
  if (!versionModel.dependencies || !versionModel.dependencies.length) return versionModel;
  versionModel.dependencies.forEach((dependency) => {
    dependency.relativePaths.forEach((relativePath) => {
      if (relativePath.importSpecifier) {
        relativePath.importSpecifiers = [relativePath.importSpecifier];
        delete relativePath.importSpecifier;
      }
    });
  });
  return versionModel;
}

const changeImportSpecifiersToArray = {
  name: 'change ImportSpecifier from Object to Array',
  migrate: updateImportSpecifiers
};

export default changeImportSpecifiersToArray;
