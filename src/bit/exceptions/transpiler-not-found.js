/** @flow */
export default class TranspilerNotFoundException extends Error {
  transpiler: string;
    
  constructor(transpiler : string) {
    super();
    this.transpiler = transpiler;
  }
}
