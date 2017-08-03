/** @flow */
export default class MissingPackageDependenciesOnFs extends Error {
  packageDependencies: string[];
  code: number;

  constructor(packageDependencies: string[]) {
    super();
    this.code = 127;
    this.packageDependencies = packageDependencies;
  }
}
