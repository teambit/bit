/** @flow */

function updateBindingPrefixToNewDefault(componentModel: Object): Object {
  const oldDefault = 'bit';
  const newDefault = '@bit';
  if (componentModel.bindingPrefix && componentModel.bindingPrefix === oldDefault) {
    componentModel.bindingPrefix = newDefault;
  }
  return componentModel;
}

export default {
  name: 'update bindingPrefix from "bit" to "@bit"',
  migrate: updateBindingPrefixToNewDefault
};
