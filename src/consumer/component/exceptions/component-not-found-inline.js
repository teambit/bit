/** @flow */
export default class ComponentNotFoundInline extends Error {
  path: string;
  code: number;
  
  constructor(path: string) {
    super();
    this.code = 127;
    this.path = path;
  }
}
