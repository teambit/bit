function updateBindingPrefixToNewDefault(componentModel: Record<string, any>): Record<string, any> {
  const oldDefault = 'bit';
  const newDefault = '@bit';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (componentModel.bindingPrefix && componentModel.bindingPrefix === oldDefault) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    componentModel.bindingPrefix = newDefault;
  }
  return componentModel;
}

export default {
  name: 'update bindingPrefix from "bit" to "@bit"',
  migrate: updateBindingPrefixToNewDefault,
};
