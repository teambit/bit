// @flow
import pMapSeries from 'p-map-series';
import extensionRegistry from './extension-registry';
import ExtensionWrapper from './extension-wrapper';

export async function triggerHook(hookName: string, args: ?Object) {
  // don't use Promise.all(), the order is important. (the order/priority is not implemented yet)
  return pMapSeries(extensionRegistry.workspaceExtensions, extensionWrapper =>
    runHookFromExtensionIfExist(extensionWrapper, hookName, args)
  );
}

/**
 * an extension can be a class or an object. a hook can be a method or a function. support them all!
 */
async function runHookFromExtensionIfExist(extensionWrapper: ExtensionWrapper, hookName: string, args: ?Object) {
  if (hasHook(extensionWrapper.extensionInstance, hookName)) {
    return extensionWrapper.extensionInstance[hookName](args);
  }
  if (hasHook(extensionWrapper.extensionConstructor, hookName)) {
    // $FlowFixMe
    return extensionWrapper.extensionConstructor[hookName](args);
  }
  return null;
}

export function hasHook(obj: any, hookName: string) {
  return Boolean(obj && obj[hookName] && typeof obj[hookName] === 'function');
}
