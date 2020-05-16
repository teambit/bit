import { StartCmd } from './start.cmd';
import { Watch, WatchExt } from '../watch';
import { BitCliExt, BitCli } from '../cli';
import { WorkspaceExt, Workspace } from '../workspace';
import { Component } from '../component';
import { BitId as ComponentId } from '../../bit-id';
import { Environment } from './environment';
import { Slot, SlotRegistry } from '@teambit/harmony';

export type EnvsRegistry = SlotRegistry<Environment>;

export type EnvsConfig = {
  env: string;
};

export class Environments {
  static dependencies = [BitCliExt, WatchExt, WorkspaceExt];

  constructor(
    /**
     * environments extension configuration.
     */
    readonly config: EnvsConfig,

    /**
     * instance of the watcher extension.
     */
    private watcher: Watch,

    /**
     * slot for allowing extensions to register new env
     */
    private envSlot: EnvsRegistry
  ) {}

  async start(components?: Component[]) {
    // :TODO how to standardize this? we need to make sure all validation errors will throw nicely at least.
    const env = this.envSlot.get(this.config.env);
    if (!env) throw new Error('environment was not defined');
    env.start();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async serve(componentId: ComponentId) {
    // @ts-ignore
    const observable = await this.watcher.watch();
    observable.subscribe(() => {});
  }

  register(env: Environment) {
    return this.envSlot.register(env);
  }

  static slots = [Slot.withType<Environment>()];

  static defaultConfig = {
    env: 'React'
  };

  static async provider(
    [cli, watcher, workspace]: [BitCli, Watch, Workspace],
    config: EnvsConfig,
    [envSlot]: [EnvsRegistry]
  ) {
    const envs = new Environments(config, watcher, envSlot);
    cli.register(new StartCmd(envs));
    return envs;
  }
}
