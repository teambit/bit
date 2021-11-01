import { resolve } from 'path';
import { ExecutionContext } from '@teambit/envs';
import { BuildContext, BuiltTaskResult, BuildTask, TaskLocation } from '@teambit/builder';
import { Bundler, BundlerContext, Target } from '@teambit/bundler';
import { ElementsMain } from './elements.main.runtime';
import { computeTargets } from './compute-targets';
import { computeResults } from './compute-results';
import { CompilerAspect } from '@teambit/compiler';

export type ElementsWrapperContext = {
  mainFilePath: string;
  componentName: string;
};
export type ElementsWrapperFn = (context: ElementsWrapperContext) => string;

export class ElementTask implements BuildTask {
  constructor(
    /**
     * elements extension.
     */
    private elements: ElementsMain
  ) {}

  aspectId = 'teambit.mfe/elements';
  name = 'GenerateElementBundle';
  location: TaskLocation = 'end';
  readonly dependencies = [CompilerAspect.id];

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const url = `/element/${context.envRuntime.id}`;

    const outDirName = this.elements.getElementsDirName();

    const elementsWrapperFn = context.env.getElementsWrapper.bind(context.env);

    const targets: Target[] = await computeTargets(context, elementsWrapperFn, outDirName);

    const bundlerContext: BundlerContext = Object.assign(context, {
      targets,
      entry: [],
      publicPath: this.getPreviewDirectory(context),
      rootPath: url,
    });

    const bundler: Bundler = await context.env.getElementsBundler(bundlerContext, []);
    const bundlerResults = await bundler.run();

    return computeResults(bundlerContext, bundlerResults, outDirName);
  }

  getPreviewDirectory(context: ExecutionContext) {
    const outputPath = resolve(`${context.id}/public`);
    return outputPath;
  }
}
