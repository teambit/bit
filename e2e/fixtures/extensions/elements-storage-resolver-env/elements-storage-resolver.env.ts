

import { Bundler, BundlerContext } from '@teambit/bundler';
import { ElementsEnv, BuilderEnv } from "@teambit/envs";
import { ReactElementsMain } from '@teambit/react-elements';
import { ElementsWrapperContext } from '@teambit/elements';
import { WebpackConfigTransformer, WebpackMain } from '@teambit/webpack';
import { ReactMain } from '@teambit/react';
import { BuildTask } from '@teambit/builder';
import { FakeStorageResolver } from './fake-storage-resover';

export class ElementsStorageResolverEnv implements ElementsEnv, BuilderEnv {
  constructor(
    private reactElements: ReactElementsMain,
    private webpack: WebpackMain,
    private react: ReactMain,
  ) {}
  getElementsWrapper(context: ElementsWrapperContext): string {
    return this.reactElements.getWrapperTemplateFn()(context);
  }
  async getElementsBundler(
    context: BundlerContext,
    transformers: WebpackConfigTransformer[] = []
  ): Promise<Bundler> {
    const reactElementsTransformers =
      this.reactElements.getWebpackTransformers();
    const allTransformers = reactElementsTransformers.concat(transformers);
    return this.webpack.createBundler(context, allTransformers);
  }

  getBuildPipe(): BuildTask[] {
    const fakeStorageResolver = new FakeStorageResolver();
    const elementsTask = this.reactElements.createTask(fakeStorageResolver);
    return [...this.react.reactEnv.getBuildPipe(), elementsTask];
  }
}
