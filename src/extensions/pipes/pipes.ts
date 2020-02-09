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

export type BuildDeps = [Paper, Workspace, Capsule];

export type Options = {
  parallelism: number;
  topologicalSort: boolean;
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

  getConfig(component: ResolvedComponent) {
    if (component.component.config.extensions.Pipes) {
      return component.component.config.extensions.Pipes;
    }

    return {};
  }

  getWalker(comps: ResolvedComponent[], options: Options) {
    return options.topologicalSort ? getTopoWalker(comps, this.workspace.consumer) : getArrayWalker(comps, options);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async run(pipeline: string, components?: string[], options?: Options) {
    const componentsToBuild = await this.getComponentsForBuild(components);
    // check if config is sufficient before building capsules and resolving deps.
    const resolvedComponents = await this.workspace.load(componentsToBuild.map(comp => comp.id.toString()));
    // add parallelism and execute by graph order (use gilad's graph builder once we have it)
    const opts = options || {
      parallelism: 4,
      topologicalSort: true
    };
    const walk = await this.getWalker(resolvedComponents, opts);
    const promises = await walk(async resolved => {
      const component = resolved.component;
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
    }, new PQueue({ concurrency: options?.parallelism }));
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
    const build = new Pipes(workspace, capsule);
    // @ts-ignore
    cli.register(new RunCmd(build));
    return build;
  }
}

async function getTopoWalker(comps: ResolvedComponent[], consumer: Consumer) {
  const graph = await buildOneGraphForComponents(
    comps.map(comp => comp.component.id._legacy),
    consumer
  );
  const getSources = (cache: ResolvedComponent[], src: Graph) =>
    src
      .sources()
      .map(id => cache.find(comp => comp.component.id.toString() === id) as ResolvedComponent)
      .filter(val => val);

  return async function walk(v: (Component) => Promise<any>, q: PQueue) {
    debugger;
    if (!graph.nodes().length) {
      return Promise.resolve();
    }
    const sources = getSources(comps, graph);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _level = await Promise.all(sources.map(src => q.add(() => v(src.component))));
    sources.forEach(src => graph.removeNode(src.component.id.toString()));
    return walk(v, q);
  };
}

function getArrayWalker(comps: ResolvedComponent[], options: Options) {
  options;
  return comps.map;
}
