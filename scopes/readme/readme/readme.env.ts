import { Component } from '@teambit/component';
import { Environment } from '@teambit/envs';
import { DocsMain } from '@teambit/docs';

export const ReadmeEnvType = 'readme';

export class ReadmeEnv implements Environment {
  constructor(private docs: DocsMain) {}
  private removeDocsDevPatterns(): string[] {
    return this.docs.getPatterns().map((pattern) => `!${pattern}`);
  }
  getDocsDevPatterns(component: Component): string[] {
    return this.getDevPatterns(component).concat(this.removeDocsDevPatterns());
  }
  getDevPatterns(component: Component): string[] {
    return component.mainFile.path ? [component.mainFile.path, 'index.*'] : ['index.*'];
  }
  async __getDescriptor() {
    return {
      type: 'readme',
    };
  }
}
