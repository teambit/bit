import { Component } from '@teambit/component';
import { Environment } from '@teambit/envs';

export const ReadmeEnvType = 'readme';

export class ReadmeEnv implements Environment {
  private removeDocsDevPatterns() {
    this.getDocs.getPattern().map((pattern) => `-${pattern}`);
  }
  getDevFilesPatterns(component) {
    return this.getDocsDevPatterns(component);
  }
  getDocsDevPatterns(component: Component) {
    return [component.mainFile, 'index.*'];
  }
  async __getDescriptor() {
    return {
      type: 'readme',
    };
  }
}
