import { Component } from '../component';

export type CompilerResult = {};

export interface Compiler {
  /**
   * compiles given set of components.
   */
  compile(components: Component[]): CompilerResult;
}
