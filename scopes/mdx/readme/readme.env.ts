import type { Component } from '@teambit/component';
import type { Environment } from '@teambit/envs';
import type { DocsMain } from '@teambit/docs';

export const ReadmeEnvType = 'readme';

export class ReadmeEnv implements Environment {
  constructor(private docs: DocsMain) {}
  private getNegateDocsDevPatterns(): string[] {
    return this.docs.getPatterns().map((pattern) => `!${pattern}`);
  }
  getDocsDevPatterns(component: Component): string[] {
    return this.getDevPatterns(component).concat(this.getNegateDocsDevPatterns());
  }
  getDevPatterns(component?: Component): string[] {
    return component && component.mainFile.relative ? [component.mainFile.relative] : ['index.*'];
  }
  async __getDescriptor() {
    return {
      type: 'readme',
    };
  }
}
