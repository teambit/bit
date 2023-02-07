import mapSeries from 'p-map-series';
import PackageJsonFile from '@teambit/legacy/dist/consumer/component/package-json-file';
import { parseScope } from '@teambit/legacy/dist/utils/bit/parse-scope';
import { replacePlaceHolderForPackageValue } from '@teambit/legacy/dist/utils/bit/component-placeholders';
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

    Object.keys(newPackageJsonObject).forEach((key) => {
      let value = newPackageJsonObject[key];
      if (typeof value === 'string') {
        value = replacePlaceHolderForPackageValue(contextForReplace, newPackageJsonObject[key]);
      }
      newPackageJsonObject[key] = value;
    }, {});

    packageJson.mergePackageJsonObject(newPackageJsonObject);
  }
}
