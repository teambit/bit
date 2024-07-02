import { isObject } from 'lodash';
import mapSeries from 'p-map-series';
import PackageJsonFile from '@teambit/legacy/dist/consumer/component/package-json-file';
import { parseScope } from '@teambit/legacy.utils';
import { replacePlaceHolderForPackageValue } from '@teambit/legacy.utils';
import { Component } from '@teambit/component';

type PackageJsonTransformers = Function[];

export class PackageJsonTransformer {
  static packageJsonTransformersRegistry: PackageJsonTransformers = [];
  static registerPackageJsonTransformer(
    func: (component: Component, packageJsonObject: Record<string, any>) => Promise<Record<string, any>>
  ) {
    this.packageJsonTransformersRegistry.push(func);
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
