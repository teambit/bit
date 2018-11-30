// @flow
import extensionRegistry from '../../../extensions/extension-registry';

export async function extensionsList() {
  return extensionRegistry.workspaceExtensions.map((extensionWrapper) => {
    return {
      name: extensionWrapper.name,
      disabled: extensionWrapper.disabled
    };
  });
}

export async function extensionsHooks() {}
