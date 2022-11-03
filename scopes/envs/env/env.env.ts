import { COMPONENT_PREVIEW_STRATEGY_NAME, PreviewStrategyName } from "@teambit/preview";

export const EnvEnvType = 'env';

/**
 * a component environment built for Envs.
 */
export class EnvEnv {
  // TODO: consider special icon for envs?
  icon = 'https://static.bit.dev/extensions-icons/default.svg';

  async __getDescriptor() {
    return {
      type: EnvEnvType,
    };
  }

  getPreviewConfig() {
    return {
      strategyName: COMPONENT_PREVIEW_STRATEGY_NAME as PreviewStrategyName,
      splitComponentBundle: false,
    };
  }
}
