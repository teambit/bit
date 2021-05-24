import mapSeries from 'p-map-series';
import { replacePlaceHolderForPackageValue } from '../../utils/bit/component-placeholders';

import ConsumerComponent from './consumer-component';
import PackageJsonFile from './package-json-file';
import { parseScope } from '../../utils/bit/parse-scope';

type PackageJsonTransformers = Function[];

export class PackageJsonTransformer {
  static packageJsonTransformersRegistry: PackageJsonTransformers = [];
  static registerPackageJsonTransformer(
    func: (component: ConsumerComponent, packageJsonObject: Record<string, any>) => Promise<Record<string, any>>
  ) {
    this.packageJsonTransformersRegistry.push(func);
  }

  /**
   * these are changes made by aspects
   */
  static async applyTransformers(component: ConsumerComponent, packageJson: PackageJsonFile) {
    let newPackageJsonObject = packageJson.packageJsonObject;

    await mapSeries(PackageJsonTransformer.packageJsonTransformersRegistry, async (transformer) => {
      newPackageJsonObject = await transformer(component, newPackageJsonObject);
    });

    const scopeId = component.scope || component.defaultScope;
    const { scope, owner } = parseScope(scopeId);
    const name = component.id.name;

    const contextForReplace = {
      mainFile: component.mainFile,
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
