/** @flow */
import { DEFAULT_BINDINGS_PREFIX } from '../../../constants';

/**
 * Add default binding prefix to version model
 * @param {*} versionModel - The parsed component model
 */
function addBindingPrefix(versionModel: Object): Object {
  if (!versionModel.bindingPrefix) {
    versionModel.bindingPrefix = DEFAULT_BINDINGS_PREFIX;
  }
  return versionModel;
}

const addBindingPrefixDeclartaion = {
  name: 'add binding prefix',
  migrate: addBindingPrefix
};

export default addBindingPrefixDeclartaion;
