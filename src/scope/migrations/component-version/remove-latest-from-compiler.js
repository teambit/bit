/** @flow */
import { VERSION_DELIMITER, LATEST } from '../../../constants';

/**
 * Add default binding prefix to version model
 * @param {*} versionModel - The parsed component model
 */
function removeLatestFromCompiler(versionModel: Object): Object {
  if (versionModel.compiler && versionModel.compiler.indexOf(LATEST) > -1) {
    console.log('replacing before: ', versionModel.compiler);
    versionModel.compiler = versionModel.compiler.replace(`${VERSION_DELIMITER}${LATEST}`, '');
    console.log('replacing after: ', versionModel.compiler);
  }
  return versionModel;
}

const removeLatestFromCompilerDeclartaion = {
  name: 'remove latest from compiler',
  migrate: removeLatestFromCompiler
};

export default removeLatestFromCompilerDeclartaion;
