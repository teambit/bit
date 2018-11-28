// @flow
import pMapSeries from 'p-map-series';
import extensionRegistry from './extension-registry';
import ExtensionWrapper from './extension-wrapper';
import { Component as ComponentType } from './types';
import ConsumerComponent from '../consumer/component';

export async function triggerWorkspaceHook(hookName: string, args: ?Object) {
  // don't use Promise.all(), the order is important. (the order/priority is not implemented yet)
  return pMapSeries(extensionRegistry.workspaceExtensions, extensionWrapper =>
    runHookFromExtensionIfExist(extensionWrapper, hookName, args)
  );
}

export async function triggerComponentsHook(
  hookName: string,
  components: ComponentType[] | ConsumerComponent[],
  args: ?Object
) {
  if (!components || !Array.isArray(components)) {
    throw TypeError('triggerComponentsHook expects to get an array of components as the second parameter');
  }
  const componentsType = getComponentsType(components);
  // don't use Promise.all(), the order is important. (the order/priority is not implemented yet)
  return pMapSeries(componentsType, componentType => runHookFromComponentType(componentType, hookName, args));
}

function runHookFromComponentType(componentType: ComponentType, hookName: string, args: ?Object) {
  return pMapSeries(componentType.extensions, extensionWrapper =>
    runHookFromExtensionIfExist(extensionWrapper, hookName, args)
  );
}

function getComponentsType(components: ComponentType[] | ConsumerComponent[]): ComponentType[] {
  return components.map((component) => {
    const type = typeof component;
    if (type === ComponentType) return component;
    if (type === ConsumerComponent) return ComponentType.fromConsumerComponent(component);
    throw new TypeError(`expects component to be of a type Component but got ${type}`);
  });
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
