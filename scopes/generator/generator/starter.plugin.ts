import { PluginDefinition } from '@teambit/aspect-loader';
import { MainRuntime } from '@teambit/cli';
import { WorkspaceTemplateSlot } from './generator.main.runtime';

export class StarterPlugin implements PluginDefinition {
  constructor(private workspaceTemplateSlot: WorkspaceTemplateSlot) {}

  pattern = '*.starter.*';

  runtimes = [MainRuntime.name];

  async register(object: any) {
    return this.workspaceTemplateSlot.register([object]);
  }
}
