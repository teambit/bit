import { PluginDefinition } from '@teambit/aspect-loader';
import { MainRuntime } from '@teambit/cli';
import { GeneratorMain } from './generator.main.runtime';

export class StarterPlugin implements PluginDefinition {
  constructor(private generator: GeneratorMain) {}

  pattern = '*.starter.*';

  runtimes = [MainRuntime.name];

  register(object: any) {
    const templates = Array.isArray(object) ? object : [object];
    return this.generator.registerWorkspaceTemplate(templates);
  }
}
