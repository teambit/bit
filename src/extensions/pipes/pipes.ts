import { Paper } from '../paper';
import { RunCmd } from './run.cmd';
import { Workspace } from '../workspace';
import { Component } from '../component';
import { ActionNotFound, ExtensionNotFound, ActionsNotDefined } from './exceptions';
import { ResolvedComponent } from '../workspace/resolved-component';
import { Harmony, Extension } from '../../harmony';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import { ComponentCapsule } from '../capsule-ext';

export type BuildDeps = [Paper, Workspace, Capsule];

export type Options = {
  /**
   * set number of concurrent processes to use for executing actions.
   */
  parallelism: number;
};

/**
 * name of the default action of an extension.
 */
const DEFAULT_ACTION = 'default';

export class Pipes {
  constructor(
    /**
     * Bit's workspace
     */
    private workspace: Workspace,

    private harmony: Harmony<unknown>
  ) {}

  async getComponentsForBuild(components?: string[]) {
    if (components) return this.workspace.getMany(components);
    const modified = await this.workspace.modified();
    const newComps = await this.workspace.newComponents();
    return modified.concat(newComps);
  }

  getConfig(component: ResolvedComponent) {
    if (component.component.config.extensions.pipes) {
      return component.component.config.extensions.pipes;
    }

    return {};
  }

  private getAction(extension: Extension, action?: string) {
    if (!extension.manifest.actions) {
      throw new ActionsNotDefined();
    }

    if (!extension.manifest.actions[action || DEFAULT_ACTION]) {
      throw new ActionNotFound();
    }

    return extension.manifest.actions[action || DEFAULT_ACTION];
  }

  /**
   * resolve an action from an extension.
   */
  resolve(def: string) {
    const [id, action] = def.split(':');
    const extension = this.harmony.get(id);
    if (!extension) throw new ExtensionNotFound();

    return this.getAction(extension, action);
  }

  // resolveScript(def: string) {
  //   const [extension, task] = def.split(':');
  //   if (!this.scripts[extension]) return undefined;
  //   const relativePath = this.scripts[extension][task || 'default'];
  //   const moduleName = componentIdToPackageName(this.workspace.consumer.getParsedId(extension), '@bit');
  //   return path.join(moduleName, path.relative('', relativePath));
  // }

  // runScript(script: string, component: ResolvedComponent) {
  //   const capsule = component.capsule;
  //   capsule.run(script);
  //   // console.log(script);
  // }

  private async executeCommand(capsule: ComponentCapsule, command: string) {
    const exec = await capsule.exec({ command: command.split(' ') });
    // eslint-disable-next-line no-console
    exec.stdout.on('data', chunk => console.log(chunk.toString()));

    const promise = new Promise(resolve => {
      exec.stdout.on('close', () => resolve());
    });

    // save dists? add new dependencies? change component main file? add further configs?
    await promise;
  }

  watch() {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async run(pipeline: string, components?: Component[], options?: Options) {
    const componentsToBuild = components || (await this.getComponentsForBuild(components));
    // check if config is sufficent before building capsules and resolving deps.
    const resolvedComponents = await this.workspace.load(componentsToBuild.map(comp => comp.id.toString()));
    // add parrlalism and execute by graph order (use gilad's graph builder once we have it)
    const promises = resolvedComponents.map(async component => {
      const capsule = component.capsule;
      const pipe = this.getConfig(component)[pipeline];
      if (!Array.isArray(pipe)) {
        // TODO: throw error
        // eslint-disable-next-line no-console
        console.log(`skipping component ${component.component.id.toString()}. it has no defined '${pipeline}'`);
      }
      // TODO: use logger for this
      // eslint-disable-next-line no-console
      console.log(`building component ${component.component.id.toString()}...`);

      pipe.forEach(async (elm: string) => {
        const action = this.resolve(elm);
        if (action) return action(component);
        return this.executeCommand(capsule, elm);
      });
    });

    return Promise.all(promises).then(() => resolvedComponents);
  }

  /**
   * provides a new instance of Actions.
   */
  static async provide(config: {}, [cli, workspace]: BuildDeps, harmony: Harmony<unknown>) {
    const build = new Pipes(workspace, harmony);
    // @ts-ignore
    cli.register(new RunCmd(build));
    return build;
  }
}
