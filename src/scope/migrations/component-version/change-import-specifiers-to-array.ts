/**
 * When a component has ImportSpecifier data, change it from an object to an array
 */
function updateImportSpecifiers(versionModel: Record<string, any>): Record<string, any> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (!versionModel.dependencies || !versionModel.dependencies.length) return versionModel;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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

export default {
  name: 'change ImportSpecifier from Object to Array',
  migrate: updateImportSpecifiers,
};
