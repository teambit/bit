// @flow
import extensionRegistry from '../../../extensions/extension-registry';

export default (async function extensionsList() {
  return extensionRegistry.workspaceExtensions.map((extensionWrapper) => {
    return {
      name: extensionWrapper.name,
      disabled: extensionWrapper.disabled
    };
  });
});
