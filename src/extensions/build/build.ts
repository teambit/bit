import { Paper } from '../paper';
import { RunCmd } from './build.cmd';
import { Workspace } from '../workspace';
import { Capsule } from '../../capsule';

export type BuildDeps = [Paper, Workspace];

export type Options = {
  parallelism: number;
};

export class Build {
  private tasks = [];

  constructor(
    /**
     * Bit's workspace
     */
    private workspace: Workspace,

    private capsule: Capsule
  ) {}

  async getComponentsForBuild(components?: string[]) {
    if (components) return this.workspace.getMany(components);
    const modified = await this.workspace.modified();
    const newComps = await this.workspace.newComponents();
    return modified.concat(newComps);
  }

  async run(pipeline: string, components?: string[], options?: Options) {
    const componentsToBuild = await this.getComponentsForBuild(components);
    const capsules = await this.capsule.create(componentsToBuild);
    // add parrlalism and execute by graph order (use gilad's graph builder once we have it)
    console.log(capsules);
  }

  static async provide(config: {}, [paper, workspace, capsule]: BuildDeps) {
    const build = new Build(workspace, capsule);
    // @ts-ignore
    paper.register(new RunCmd(build));
    return build;
  }
}
