/**
 * Convert specsResults from object to array and add the spec file
 * @param {Object} versionModel
 */
function specsResultstoArray(versionModel: Record<string, any>): Record<string, any> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (versionModel.specsResults && !Array.isArray(versionModel.specsResults)) {
    // Get the first found spec file
    // This should be ok since when the specs results was an object there were only one spec file
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const specFile = versionModel.files.filter((file) => {
      return file.test;
    })[0];
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const oldSpecsResults = versionModel.specsResults;
    // Add the spec file path
    oldSpecsResults.specFile = specFile.relativePath;
    const specsResults = [oldSpecsResults];
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    versionModel.specsResults = specsResults;
  }
  return versionModel;
}

export default {
  name: 'convert specs results array',
  migrate: specsResultstoArray,
};
