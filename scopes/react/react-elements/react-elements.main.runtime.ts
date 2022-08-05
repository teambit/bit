import { MainRuntime } from '@teambit/cli';
import { ArtifactsStorageResolver } from '@teambit/builder';
import { WebpackConfigTransformer } from '@teambit/webpack';
import ElementsAspect, { ElementsMain } from '@teambit/elements';
import { GetWrapperOpts, getWrapperTemplateFn } from './element-wrapper-template';
import basePreviewConfigFactory from './webpack/webpack.config.base';
import basePreviewProdConfigFactory from './webpack/webpack.config.base.prod';

import { ReactElementsAspect } from './react-elements.aspect';

export class ReactElementsMain {
  constructor(private elements: ElementsMain) {}
  createTask(storageResolvers?: ArtifactsStorageResolver[]) {
    return this.elements.createTask(storageResolvers);
  }

  getWrapperTemplateFn(opts?: Partial<GetWrapperOpts>) {
    return getWrapperTemplateFn(this.getWrapperTemplateOptsWithDefaults(opts || {}));
  }

  getWebpackTransformers(): WebpackConfigTransformer[] {
    const baseConfig = basePreviewConfigFactory(true);
    const baseProdConfig = basePreviewProdConfigFactory();
    const baseElementsTransformers = this.elements.getWebpackTransformers();

    const defaultTransformer: WebpackConfigTransformer = (configMutator) => {
      const merged = configMutator.merge([baseConfig, baseProdConfig]);
      return merged;
    };
    return [...baseElementsTransformers, defaultTransformer];
  }

  private getWrapperTemplateOptsWithDefaults(opts: Partial<GetWrapperOpts>): GetWrapperOpts {
    return Object.assign({}, { elementsPrefix: 'x' }, opts);
  }

  static slots = [];
  static dependencies = [ElementsAspect];
  static runtime = MainRuntime;
  static async provider([elements]: [ElementsMain]) {
    return new ReactElementsMain(elements);
  }
}

ReactElementsAspect.addRuntime(ReactElementsMain);
