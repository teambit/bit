import { Environment } from '@teambit/envs';

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
}
