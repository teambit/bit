import { EnvService, Env, EnvContext, ServiceTransformationMap } from '@teambit/envs';
import { EnvPreviewConfig } from './preview.main.runtime';

type PreviewTransformationMap = ServiceTransformationMap & {
  /**
   * Returns a paths to a function which mounts a given component to DOM
   * Required for `bit start` & `bit build`
   */
  getMounter?: () => string;

  /**
   * Returns a path to a docs template.
   * Required for `bit start` & `bit build`
   */
  getDocsTemplate?: () => string;

  /**
   * Returns a list of additional host dependencies
   * this list will be provided as globals on the window after bit preview bundle
   * by default bit will merge this list with the peers from the getDependencies function
   */
  getAdditionalHostDependencies?: () => string[] | Promise<string[]>;

  /**
   * Returns preview config like the strategy name to use when bundling the components for the preview
   */
  getPreviewConfig?: () => EnvPreviewConfig;
};

export class PreviewService implements EnvService<any> {
  name = 'preview';

  transform(env: Env, envContext: EnvContext): PreviewTransformationMap | undefined {
    // Old env
    if (!env?.preview) return undefined;
    const preview = env.preview()(envContext);

    return {
      getAdditionalHostDependencies: preview.getHostDependencies.bind(preview),
      getMounter: preview.getMounter.bind(preview),
      getDocsTemplate: preview.getDocsTemplate.bind(preview),
      getPreviewConfig: preview.getPreviewConfig.bind(preview),
    };
  }
}
