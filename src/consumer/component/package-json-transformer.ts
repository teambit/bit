import Bluebird from 'bluebird';

import ConsumerComponent from './consumer-component';
import PackageJsonFile from './package-json-file';

type PackageJsonTransformers = Function[];

export class PackageJsonTransformer {
  static packageJsonTransformersRegistry: PackageJsonTransformers = [];
  static registerPackageJsonTransformer(func: (component: ConsumerComponent, packageJsonObject: Record<string, any>) => Promise<Record<string, any>>) {
    this.packageJsonTransformersRegistry.push(func);
  }

  /**
   * these are changes made by aspects
   */
  static async applyTransformers(component: ConsumerComponent, packageJson: PackageJsonFile) {
    let newPackageJsonObject = packageJson.packageJsonObject;

    await Bluebird.mapSeries(PackageJsonTransformer.packageJsonTransformersRegistry, async (transformer) =>
      newPackageJsonObject = await transformer(component, newPackageJsonObject)
    );

    packageJson.mergePackageJsonObject(newPackageJsonObject);
  }
}
