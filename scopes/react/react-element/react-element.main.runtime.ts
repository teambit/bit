import camelCase from 'camelcase';
import { MainRuntime } from '@teambit/cli';
import { WebpackConfigTransformer } from '@teambit/webpack';
import ElementsAspect, { ElementsMain } from '@teambit/elements';
import { GetWrapperOpts, getWrapperTemplateFn } from './element-wrapper-template';
import basePreviewConfigFactory from './webpack/webpack.config.base';
import basePreviewProdConfigFactory from './webpack/webpack.config.base.prod';
import componentPreviewProdConfigFactory from './webpack/webpack.config.component.prod';

import { ReactElementAspect } from './react-element.aspect';

export class ReactElementMain {
  constructor(private elements: ElementsMain) {}
  createTask() {
    return this.elements.createTask();
  }

  getWrapperTemplateFn(opts?: Partial<GetWrapperOpts>) {
    return getWrapperTemplateFn(this.getWrapperTemplateOptsWithDefaults(opts || {}));
  }

  getWebpackTransformers(): WebpackConfigTransformer[] {
    const baseConfig = basePreviewConfigFactory(true);
    const baseProdConfig = basePreviewProdConfigFactory();
    const componentProdConfig = componentPreviewProdConfigFactory();

    const defaultTransformer: WebpackConfigTransformer = (configMutator, context) => {
      const merged = configMutator.merge([baseConfig, baseProdConfig, componentProdConfig]);
      const namePascalCase = camelCase(context.target.components[0].id.name, { pascalCase: true });
      merged.raw.output = merged.raw.output || {};
      merged.raw.output.filename = 'static/js/elements.[contenthash:8].js';
      merged.raw.output.library = {
        name: namePascalCase,
        type: 'umd',
      };
      return merged;
    };
    return [defaultTransformer];
  }

  private getWrapperTemplateOptsWithDefaults(opts: Partial<GetWrapperOpts>): GetWrapperOpts {
    return Object.assign({}, { elementsPrefix: 'x' }, opts);
  }

  static slots = [];
  static dependencies = [ElementsAspect];
  static runtime = MainRuntime;
  static async provider([elements]: [ElementsMain]) {
    return new ReactElementMain(elements);
  }
}

ReactElementAspect.addRuntime(ReactElementMain);
