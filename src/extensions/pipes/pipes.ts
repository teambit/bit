import { Paper } from '../paper';
import { RunCmd } from './run.cmd';
import { Workspace } from '../workspace';
import { Capsule } from '../capsule';
import { Component } from '../component';
import { TaskContext } from './task-context';
import { ResolvedComponent } from '../workspace/resolved-component';
import { BitId } from '../../bit-id';

export type BuildDeps = [Paper, Workspace, Capsule];

export type Options = {
  parallelism: number;
};

export type TaskFn = (context: TaskContext) => void;

export class Pipes {
  private tasks = {};

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

  registerTask(name: string, taskFn: TaskFn) {
    this.tasks[name] = taskFn;
  }

  getConfig(component: ResolvedComponent) {
    if (component.component.config.extensions.Pipes) {
      return component.component.config.extensions.Pipes;
    }

    return {};
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async run(pipeline: string, components?: string[], options?: Options) {
    const componentsToBuild = await this.getComponentsForBuild(components);
    // check if config is sufficient before building capsules and resolving deps.
    const resolvedComponents = await this.workspace.load(componentsToBuild.map(comp => comp.id.toString()));
    // add parallelism and execute by graph order (use gilad's graph builder once we have it)
    const promises = resolvedComponents.map(async component => {
      const capsule = component.capsule;
      const pipe = this.getConfig(component)[pipeline];
      if (!Array.isArray(pipe)) {
        // TODO: throw error
        // eslint-disable-next-line no-console
        console.log(`skipping component ${component.component.id.toString()}, it has no defined '${pipeline}'`);
      }
      // TODO: use logger for this
      // eslint-disable-next-line no-console
      console.log(`building component ${component.component.id.toString()}...`);

      // eslint-disable-next-line consistent-return
      pipe.forEach(async (elm: string) => {
        if (this.tasks[elm]) return this.runTask(elm, new TaskContext(component));
        // should execute registered extension tasks as well
        const exec = await capsule.exec({ command: elm.split(' ') });
        // eslint-disable-next-line no-console
        exec.stdout.on('data', chunk => console.log(chunk.toString()));

        const promise = new Promise(resolve => {
          exec.stdout.on('close', () => resolve());
        });

        // save dists? add new dependencies? change component main file? add further configs?
        await promise;
      });
    });

    return Promise.all(promises).then(() => resolvedComponents);
  }

  private runCommand() {}

  private async runTask(name: string, context: TaskContext) {
    // we need to set task as dev dependency, install and run. stdout, stderr return.
    // use the old compiler api to make everything work.
    return this.tasks[name](context);
  }

  static async provide(config: {}, [cli, workspace, capsule]: BuildDeps) {
    const build = new Pipes(workspace, capsule);
    // @ts-ignore
    cli.register(new RunCmd(build));
    return build;
  }
}
