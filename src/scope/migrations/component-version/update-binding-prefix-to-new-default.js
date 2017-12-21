/** @flow */

function updateBindingPrefixToNewDefault(versionModel: Object): Object {
  const oldDefault = 'bit';
  const newDefault = '@bit';
  if (versionModel.bindingPrefix && versionModel.bindingPrefix === oldDefault) {
    versionModel.bindingPrefix = newDefault;
  }
  return versionModel;
}

export default {
  name: 'update bindingPrefix from "bit" to "@bit"',
  migrate: updateBindingPrefixToNewDefault
};
