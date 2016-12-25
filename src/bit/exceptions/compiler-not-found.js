/** @flow */
export default class CompilerNotFoundException extends Error {
  compiler: string;
    
  constructor(compiler : string) {
    super();
    this.compiler = compiler;
  }
}
