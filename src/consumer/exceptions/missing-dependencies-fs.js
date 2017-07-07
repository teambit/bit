/** @flow */
export default class MissingDependenciesOnFs extends Error {
  dependencies: string[];
  code: number;

  constructor(dependencies: string[]) {
    super();
    this.code = 127;
    this.dependencies = dependencies;
  }
}
