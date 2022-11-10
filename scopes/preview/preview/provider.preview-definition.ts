import { ComponentMap } from '@teambit/component';
import type { ExecutionContext, Environment } from '@teambit/envs';
import { PreviewDefinition } from '@teambit/preview';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
// import { PreviewMain } from './preview.main.runtime';

export class ProviderPreviewDefinition implements PreviewDefinition {
  readonly prefix = 'provider';
  readonly includePeers = true;

  // constructor(private preview: PreviewMain) {}

  async renderTemplatePath(context: ExecutionContext): Promise<string> {
    return this.renderTemplatePathByEnv(context.env);
  }

  async renderTemplatePathByEnv(env: Environment) {
    if (!env?.getProvider) return undefined;
    return env.getProvider();
  }

  async getModuleMap(): Promise<ComponentMap<AbstractVinyl[]>> {
    return ComponentMap.create([]);
  }
}
