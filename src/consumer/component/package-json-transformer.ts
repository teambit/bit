import mapSeries from 'p-map-series';
import { replacePlaceHolderWithComponentValue } from '../../utils/bit/component-placeholders';

import ConsumerComponent from './consumer-component';
import PackageJsonFile from './package-json-file';

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

    Object.keys(newPackageJsonObject).forEach((key) => {
      const value = replacePlaceHolderWithComponentValue(component, newPackageJsonObject[key]);
      newPackageJsonObject[key] = value;
    }, {});

    packageJson.mergePackageJsonObject(newPackageJsonObject);
  }
}
