import { PreviewRuntime } from '@teambit/preview';
import { ReactAspect, ReactPreview } from '@teambit/react';
import { Aspect } from '@teambit/harmony';
import { NodeAspect } from './node.aspect';

export class NodePreview {
  constructor(private config: any) {}

  /**
   * this is how other aspects can now access the runtime's configured values.
   */
  getConfigs() {
    return this.config;
  }

  static runtime: any = PreviewRuntime;

  static dependencies: Aspect[] = [ReactAspect];

  static async provider([react]: [ReactPreview], config: any) {
    const nodePreview = new NodePreview(config);

    return nodePreview;
  }
}

NodeAspect.addRuntime(NodePreview);
