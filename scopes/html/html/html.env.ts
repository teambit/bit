import { Environment } from '@teambit/envs';
import { COMPONENT_PREVIEW_STRATEGY_NAME, PreviewStrategyName } from '@teambit/preview';

export const HtmlEnvType = 'html';

export class HtmlEnv implements Environment {
  icon = 'https://static.bit.dev/file_type_html5.svg';

  getDocsTemplate() {
    return require.resolve('./html-docs-app');
  }

  getMounter() {
    return require.resolve('./mount');
  }

  getDependencies() {
    return {
      devDependencies: {
        '@types/jest': '26.0.20',
      },
    };
  }

  getPreviewConfig() {
    return {
      strategyName: COMPONENT_PREVIEW_STRATEGY_NAME as PreviewStrategyName,
      splitComponentBundle: true,
    };
  }

  async __getDescriptor() {
    return {
      type: HtmlEnvType,
    };
  }
}
