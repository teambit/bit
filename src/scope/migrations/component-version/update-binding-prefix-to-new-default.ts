function updateBindingPrefixToNewDefault(versionModel: Record<string, any>): Record<string, any> {
  const oldDefault = 'bit';
  const newDefault = '@bit';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (versionModel.bindingPrefix && versionModel.bindingPrefix === oldDefault) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    versionModel.bindingPrefix = newDefault;
  }
  return versionModel;
}

export default {
  name: 'update bindingPrefix from "bit" to "@bit"',
  migrate: updateBindingPrefixToNewDefault,
};
