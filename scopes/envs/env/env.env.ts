import { CAPSULE_ARTIFACTS_DIR } from '@teambit/builder';
import { AspectEnv } from '@teambit/aspect';
import { PackageJsonProps } from '@teambit/pkg';
import { BUNDLE_UI_DIR } from '@teambit/ui';
import { COMPONENT_PREVIEW_STRATEGY_NAME, PreviewStrategyName } from '@teambit/preview';
import { AspectLoaderMain } from '@teambit/aspect-loader';
import { GetNpmIgnoreContext } from '@teambit/envs';

export const EnvEnvType = 'env';

/**
 * a component environment built for Envs.
 */
export class EnvEnv {
  constructor(
    private aspectEnv: AspectEnv,
    private aspectLoader: AspectLoaderMain
  ) {}
  // TODO: consider special icon for envs?
  icon = 'https://static.bit.dev/extensions-icons/default.svg';

  async __getDescriptor() {
    return {
      type: EnvEnvType,
    };
  }

  getNpmIgnore(context?: GetNpmIgnoreContext) {
    // ignores only .ts files in the root directory, so d.ts files inside dists are unaffected.
    // without this change, the package has "index.ts" file in the root, causing typescript to parse it instead of the
    // d.ts files. (changing the "types" prop in the package.json file doesn't help).

    // Ignores all the contents inside the artifacts directory.
    // Asterisk (*) is needed in order to ignore all other contents of the artifacts directory,
    // especially when specific folders are excluded from the ignore e.g. in combination with `!artifacts/ui-bundle`.
    const patterns = ['/*.ts', `${CAPSULE_ARTIFACTS_DIR}/*`];

    // In order to load the env preview template from core aspects we need it to be in the package of the core envs
    // This is because we don't have the core envs in the local scope so we load it from the package itself in the bvm installation
    // as this will be excluded from the package tar by default (as it's under the CAPSULE_ARTIFACTS_DIR)
    // we want to make sure to add it for the core envs
    if (context && this.aspectLoader.isCoreEnv(context.component.id.toStringWithoutVersion())) {
      patterns.push(`!${CAPSULE_ARTIFACTS_DIR}/env-template`);
    }
    if (context && this.aspectLoader.isCoreAspect(context.component.id.toStringWithoutVersion())) {
      patterns.push(`!${CAPSULE_ARTIFACTS_DIR}/${BUNDLE_UI_DIR}`);
    }
    return patterns;
  }

  getPackageJsonProps(): PackageJsonProps {
    const packageJsonProps = this.aspectEnv.getPackageJsonProps();
    delete packageJsonProps.exports;
    return packageJsonProps;
  }

  getPreviewConfig() {
    return {
      strategyName: COMPONENT_PREVIEW_STRATEGY_NAME as PreviewStrategyName,
      splitComponentBundle: false,
    };
  }
}
