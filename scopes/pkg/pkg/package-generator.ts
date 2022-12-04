import { EnvContext, EnvHandler } from "@teambit/envs";
import { PackageJsonProps } from "./pkg.main.runtime";

export type PackageGeneratorOptions = {
  packageJson: PackageJsonProps;
  npmIgnore: string[];
}

/**
 * create and maintain build pipelines for component
 * dev environments.
 */
export class PackageGenerator {
  constructor(
    private _packageJson: PackageJsonProps = {},
    private _npmIgnore: string[] = [],
    private context: EnvContext
  ) {}

  get packageJsonProps() {
    return this._packageJson;
  }

  get npmIgnore() {
    return this._npmIgnore;
  }

  static from(options: PackageGeneratorOptions): EnvHandler<PackageGenerator> {
    return (context: EnvContext) => {
      return new PackageGenerator(options.packageJson, options.npmIgnore, context);
    }
  }
}
