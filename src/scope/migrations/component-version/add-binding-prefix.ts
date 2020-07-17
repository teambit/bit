import { DEFAULT_BINDINGS_PREFIX } from '../../../constants';

/**
 * Add default binding prefix to version model
 * @param {*} versionModel - The parsed component model
 */
function addBindingPrefix(versionModel: Record<string, any>): Record<string, any> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (!versionModel.bindingPrefix) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    versionModel.bindingPrefix = DEFAULT_BINDINGS_PREFIX;
  }
  return versionModel;
}

const addBindingPrefixDeclartaion = {
  name: 'add binding prefix',
  migrate: addBindingPrefix,
};

export default addBindingPrefixDeclartaion;
