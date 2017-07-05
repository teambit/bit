/** @flow */
export default class MissingDependencies extends Error {
  dependencies: string[];
  code: number;

  constructor(dependencies: string[]) {
    super();
    this.code = 133;
    this.dependencies = dependencies;
  }
}
