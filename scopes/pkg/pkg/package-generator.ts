import { EnvContext, EnvHandler } from '@teambit/envs';
import { Component } from '@teambit/component';
import { PackageJsonProps } from './pkg.main.runtime';

export type ModifyPackageJsonFunc = (
  component: Component, packageJsonObject: PackageJsonProps) => Promise<PackageJsonProps>;

export type PackageGeneratorOptions = {
  packageJson: PackageJsonProps;
  npmIgnore?: string[];
  modifyPackageJson?: ModifyPackageJsonFunc;
};

/**
 * create and maintain build pipelines for component
 * dev environments.
 */
export class PackageGenerator {
  constructor(
    private _packageJson: PackageJsonProps = {},
    private _npmIgnore: string[] = [],
    private context: EnvContext,
    private _modifyPackageJson?: ModifyPackageJsonFunc,
  ) {}

  get packageJsonProps() {
    return this._packageJson;
  }

  get npmIgnore() {
    return this._npmIgnore;
  }

  get modifyPackageJson(): ModifyPackageJsonFunc | undefined {
    return this._modifyPackageJson;
  }

  static from(options: PackageGeneratorOptions): EnvHandler<PackageGenerator> {
    return (context: EnvContext) => {
      return new PackageGenerator(options.packageJson, options.npmIgnore, context, options.modifyPackageJson);
    };
  }
}
