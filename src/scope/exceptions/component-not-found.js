/** @flow */
export default class ComponentNotFound extends Error {
  id: string;
  code: number;
  
  constructor(id: string) {
    super();
    this.code = 127;
    this.id = id;
  }
}
