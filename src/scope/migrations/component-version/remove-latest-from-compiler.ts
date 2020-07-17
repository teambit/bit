import { VERSION_DELIMITER, LATEST } from '../../../constants';

/**
 * Add default binding prefix to version model
 * @param {*} versionModel - The parsed component model
 */
function removeLatestFromCompiler(versionModel: Object): Object {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (versionModel.compiler && versionModel.compiler.indexOf(LATEST) > -1) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    console.log('replacing before: ', versionModel.compiler);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    versionModel.compiler = versionModel.compiler.replace(`${VERSION_DELIMITER}${LATEST}`, '');
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    console.log('replacing after: ', versionModel.compiler);
  }
  return versionModel;
}

const removeLatestFromCompilerDeclartaion = {
  name: 'remove latest from compiler',
  migrate: removeLatestFromCompiler,
};

export default removeLatestFromCompilerDeclartaion;
