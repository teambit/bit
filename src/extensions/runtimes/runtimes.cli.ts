import { Harmony } from '@teambit/harmony';
import { RuntimeNotDefined } from './runtimes/exceptions';
import { Runtimes } from './runtimes';
import { CLIRuntime } from '../cli/cli.aspect';

export class RuntimesCLI {
  constructor(private context: Harmony) {}

  static runtime = CLIRuntime;

  async getRuntime(runtimeName: string) {
    const runtimes = await Runtimes.load(this.context.graph);
    const runtime = runtimes.get(runtimeName);
    if (!runtime) throw new RuntimeNotDefined(runtimeName);
    return runtime;
  }

  async applyRuntime(runtimeName: string) {
    const runtime = await this.getRuntime(runtimeName);
    runtime.aspects;
    this.context.set(runtime.getAspects());
    runtime.requireAll(this.context.graph);
  }

  static id = '@teambit/runtimes';

  static async provider(deps, config, slots, context: Harmony) {
    return new RuntimesCLI(context);
  }
}
