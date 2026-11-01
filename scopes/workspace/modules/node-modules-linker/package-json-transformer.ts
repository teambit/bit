import { isObject } from 'lodash';
import mapSeries from 'p-map-series';
import type { PackageJsonFile } from '@teambit/component.sources';
import { parseScope, replacePlaceHolderForPackageValue } from '@teambit/legacy.utils';
import type { Component } from '@teambit/component';

type PackageJsonTransformers = Function[];

export class PackageJsonTransformer {
  static packageJsonTransformersRegistry: PackageJsonTransformers = [];
  // weak, so it holds no transformer, and stays right when a loader resets or restores the array
  private static keyOfTransformer = new WeakMap<Function, string>();

  /**
   * @param key when given, a later registration with the same key replaces this one. aspects pass their id, so a
   * process that loads harmony more than once runs the transformer of the latest load only.
   */
  static registerPackageJsonTransformer(
    func: (component: Component, packageJsonObject: Record<string, any>) => Promise<Record<string, any>>,
    key?: string
  ) {
    const index = key
      ? this.packageJsonTransformersRegistry.findIndex((fn) => this.keyOfTransformer.get(fn) === key)
      : -1;
    if (index === -1) this.packageJsonTransformersRegistry.push(func);
    else this.packageJsonTransformersRegistry[index] = func;
    if (key) this.keyOfTransformer.set(func, key);
  }

  /**
   * these are changes made by aspects
   */
  static async applyTransformers(component: Component, packageJson: PackageJsonFile) {
    let newPackageJsonObject = packageJson.packageJsonObject;

    await mapSeries(PackageJsonTransformer.packageJsonTransformersRegistry, async (transformer) => {
      newPackageJsonObject = await transformer(component, newPackageJsonObject);
    });

    const scopeId = component.id.scope;
    const { scope, owner } = parseScope(scopeId);
    const name = component.id.fullName;

    const contextForReplace = {
      mainFile: component.state._consumer.mainFile,
      name,
      scope,
      scopeId,
      owner,
    };
    // TODO: Consider calling the replacePlaceHoldersRecursive instead
    replacePlaceHolders(newPackageJsonObject, contextForReplace);
    if (newPackageJsonObject.exports && typeof newPackageJsonObject.exports === 'object') {
      replacePlaceHoldersRecursive(newPackageJsonObject.exports, contextForReplace);
    }
    packageJson.mergePackageJsonObject(newPackageJsonObject);
  }
}

function replacePlaceHoldersRecursive(obj: Record<string, string>, contextForReplace): void {
  Object.keys(obj).forEach((key) => {
    let value = obj[key];
    if (typeof value === 'string') {
      value = replacePlaceHolderForPackageValue(contextForReplace, obj[key]);
      obj[key] = value;
    } else if (isObject(value)) {
      replacePlaceHoldersRecursive(value, contextForReplace);
    }
  }, {});
}

function replacePlaceHolders(obj: Record<string, string>, contextForReplace): void {
  Object.keys(obj).forEach((key) => {
    let value = obj[key];
    if (typeof value === 'string') {
      value = replacePlaceHolderForPackageValue(contextForReplace, obj[key]);
    }
    obj[key] = value;
  }, {});
}
