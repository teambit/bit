import { Graph } from 'graphlib';
import PQueue from 'p-queue';
import { Paper } from '../paper';
import { RunCmd } from './run.cmd';
import { Workspace } from '../workspace';
import { Capsule } from '../capsule';
import { TaskContext } from './task-context';
import { ResolvedComponent } from '../workspace/resolved-component';
import { buildOneGraphForComponents } from '../../scope/graph/components-graph';
import { Consumer } from '../../consumer';
import { Component } from '../component';
import { getTopologicalWalker } from './component-walker';

export type BuildDeps = [Paper, Workspace, Capsule];

export type PipeOptions = {
  concurrency: number;
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
    if (components && components.length > 0) return this.workspace.getMany(components);
    const modified = await this.workspace.modified();
    const newComps = await this.workspace.newComponents();
    return modified.concat(newComps);
  }

  registerTask(name: string, taskFn: TaskFn) {
    this.tasks[name] = taskFn;
  }

  getConfig(component: Component) {
    if (component.config.extensions.pipes) {
      return component.config.extensions.pipes;
    }

    return {};
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async run(pipeline: string, components?: string[], options?: PipeOptions) {
    const componentsToBuild = await this.getComponentsForBuild(components);
    // check if config is sufficient before building capsules and resolving deps.

    const resolvedComponents = await this.workspace.load(componentsToBuild.map(comp => comp.id.toString()));
    // add parallelism and execute by graph order (use gilad's graph builder once we have it)
    const opts = options || {
      concurrency: 4
    };
    const walk = await getTopologicalWalker(resolvedComponents, opts.concurrency, this.workspace);
    const promises = await walk(async resolved => {
      const component = resolved.component;
      const capsule = resolved.capsule;
      const pipe = this.getConfig(component)[pipeline];
      if (!Array.isArray(pipe)) {
        // TODO: throw error
        // eslint-disable-next-line no-console
        console.log(`skipping component ${component.id.toString()}, it has no defined '${pipeline}'`);
      }
      // TODO: use logger for this
      // eslint-disable-next-line no-console
      console.log(`building component ${component.id.toString()}...`);

      // eslint-disable-next-line consistent-return
      pipe.forEach(async (elm: string) => {
        if (this.tasks[elm]) return this.runTask(elm, new TaskContext(resolved));
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
    return promises;
    // return Promise.all(promises).then(() => resolvedComponents);
  }

  private runCommand() {}

  private async runTask(name: string, context: TaskContext) {
    // we need to set task as dev dependency, install and run. stdout, stderr return.
    // use the old compiler api to make everything work.
    return this.tasks[name](context);
  }

  static async provide(config: {}, [cli, workspace, capsule]: BuildDeps) {
    const pipes = new Pipes(workspace, capsule);
    cli.register(new RunCmd(pipes));
    return pipes;
  }
}
