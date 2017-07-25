/** @flow */
export default class ComponentNotFoundInPath extends Error {
  path: string;
  code: number;

  constructor(path: string) {
    super();
    this.code = 127;
    this.path = path;
  }
}
