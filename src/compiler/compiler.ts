import { Paper } from '../paper';
import { CompileCmd } from './compile.cmd';
import { Workspace } from '../workspace';
import { Component } from '../component';

export type CompilerDeps = [Paper, Workspace];

export class Compiler {
  private compilers = [];

  // fetch all compilers of imported components.
  // calculate execution order.
  // get all components to build.
  // distribute by compiler.
  // execute all in order.
  // watch?
  register(compiler: Compiler) {
    this.compilers.push(compiler);
  }

  static async provide(config: {}, [paper, workspace]: CompilerDeps) {
    paper.register(new CompileCmd(workspace));
    return new Compiler();
  }
}
