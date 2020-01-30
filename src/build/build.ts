import { Paper } from '../paper';
import { BuildCmd } from './build.cmd';
import { Workspace } from '../workspace';
import { Component } from '../component';

export type BuildDeps = [Paper, Workspace];

export class Build {
  private tasks = [];

  // fetch all compilers of all imported components upon cloning.
  // calculate execution order.
  // get all components to build.
  // distribute by compiler.
  // execute all in order.
  // watch?
  register(task: Task) {}

  static async provide(config: {}, [paper, workspace]: BuildDeps): Build {
    const build = new Build(workspace);
    paper.register(new BuildCmd(workspace, build));
    return build;
  }
}
