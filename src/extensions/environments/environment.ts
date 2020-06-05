import { Tester } from './../tester';
import { Compiler } from '../compile';

export interface Environment {
  getTester(): Tester;
  getCompiler(): Compiler;
  release(): any;
  // test(): any;
  // release() : void;
  // lint(): void;
  // serve(): void;
}
