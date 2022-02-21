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
      strategyName: 'component',
      splitComponentBundle: false,
    };
  }
}
