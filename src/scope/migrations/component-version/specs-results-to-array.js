/** @flow */

/**
 * Convert specsResults from object to array and add the spec file
 * @param {Object} versionModel 
 */
function specsResultstoArray(versionModel: Object): Object {
  if (versionModel.specsResults && !Array.isArray(versionModel.specsResults)) {
    // Get the first found spec file
    // This should be ok since when the specs results was an object there were only one spec file
    const specFile = versionModel.files.filter((file) => {
      return file.test;
    })[0];
    const oldSpecsResults = versionModel.specsResults;
    // Add the spec file path
    oldSpecsResults.specFile = specFile.relativePath;
    const specsResults = [oldSpecsResults];
    versionModel.specsResults = specsResults;
  }
  return versionModel;
}

export default {
  name: 'convert specs results array',
  migrate: specsResultstoArray
};
