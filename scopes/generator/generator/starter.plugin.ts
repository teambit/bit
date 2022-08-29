import { PluginDefinition } from '@teambit/aspect-loader';
import { MainRuntime } from '@teambit/cli';
import { GeneratorMain } from './generator.main.runtime';

export class StarterPlugin implements PluginDefinition {
  constructor(private generator: GeneratorMain) {}

  pattern = '*.starter.*';

  runtimes = [MainRuntime.name];

  async register(object: any) {
    const res = await this.generator.registerWorkspaceTemplate([object]);
    return res;
  }
}
