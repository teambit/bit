import { resolve } from 'path';

import { BuildTask, BuiltTaskResult, BuildContext } from '@teambit/builder';
import { PreviewMain } from '@teambit/preview';
import { EnvsMain, ExecutionContext } from '@teambit/envs';
import { Bundler, BundlerContext, Target } from '@teambit/bundler';

import { PreviewAspect } from './preview.aspect';
// import { AspectAspect } from './aspect.aspect';

export const TASK_NAME = 'GenerateEnvPreview';

export class GenerateEnvPreviewTask implements BuildTask {
  name = TASK_NAME;
  aspectId = PreviewAspect.id;

  constructor(private envs: EnvsMain, private preview: PreviewMain) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    console.log('im inside bundle env task');
    // const envsIds = this.envs.listEnvsIds();
    // const allEnvResults = await mapSeries(
    //   envsIds,
    //   async (envId): Promise<BuiltTaskResult | undefined> => {
    // const capsules = context.capsuleNetwork.seedersCapsules;
    // const capsule = this.getCapsule(capsules, envId);
    // if (!capsule) return undefined;

    const defs = this.preview.getDefs();
    const url = `/preview/${context.envRuntime.id}`;
    // TODO: make the name exported from the strategy itself and take it from there
    const bundlingStrategy = this.preview.getBundlingStrategy('env-mf');

    const targets: Target[] = await bundlingStrategy.computeTargets(context, defs);

    const bundlerContext: BundlerContext = Object.assign(context, {
      targets,
      entry: [],
      publicPath: this.getPreviewDirectory(context),
      rootPath: url,
    });

    const bundler: Bundler = await context.env.getEnvBundler(bundlerContext);
    const bundlerResults = await bundler.run();

    return bundlingStrategy.computeResults(bundlerContext, bundlerResults);
    // }
    // );

    // const finalResult: BuiltTaskResult = {
    //   componentsResults: [],
    //   artifacts: []
    // }
    // allEnvResults.forEach((envResult) => {
    //   finalResult.componentsResults = finalResult.componentsResults.concat(envResult?.componentsResults || [])
    //   finalResult.artifacts = (finalResult.artifacts || []).concat(envResult?.artifacts || [])
    // }, finalResult);
    // return finalResult;
  }

  getPreviewDirectory(context: ExecutionContext) {
    const outputPath = resolve(`${context.id}/public`);
    return outputPath;
  }

  // private getCapsule(capsules: Capsule[], aspectId: string) {
  //   const aspectCapsuleId = ComponentID.fromString(aspectId).toStringWithoutVersion();
  //   return capsules.find((capsule) => capsule.component.id.toStringWithoutVersion() === aspectCapsuleId);
  // }
}
