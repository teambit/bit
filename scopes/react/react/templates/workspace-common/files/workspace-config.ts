import { WorkspaceContext } from '@teambit/generator';
import { getWorkspaceConfigTemplateParsed, stringifyWorkspaceConfig } from '@teambit/config';
import { parse, assign } from 'comment-json';

export async function workspaceConfig({ name, defaultScope }: WorkspaceContext) {
  const scope = defaultScope || 'company.scope';
  const configParsed = await getWorkspaceConfigTemplateParsed();
  configParsed['teambit.workspace/workspace'].name = name;
  configParsed['teambit.workspace/workspace'].defaultScope = scope;
  configParsed['teambit.dependencies/dependency-resolver'].packageManager = 'teambit.dependencies/pnpm';
  configParsed['teambit.dependencies/dependency-resolver'].policy = {
    dependencies: {
      '@teambit/eslint-config-bit-react': '~0.0.367',
      '@typescript-eslint/eslint-plugin': '4.29.3',
      'eslint-import-resolver-node': '0.3.6',
      'eslint-plugin-import': '2.22.1',
      'eslint-plugin-jest': '24.4.0',
      'eslint-plugin-jsx-a11y': '6.4.1',
      'eslint-plugin-mdx': '1.15.0',
      'eslint-plugin-react': '7.25.1',
    },
    peerDependencies: {
      '@testing-library/react': '12.0.0',
      react: '17.0.2',
      'react-dom': '17.0.2',
    },
  };

  const variants = {
    'teambit.workspace/variants': parse(`{
      /**
       * configures all components with namespaces 'ui', 'blocks', 'pages' and 'themes'
       * to use the default React development environment.
       *
      */
      "{ui/**}, {blocks/**}, {pages/**}, {themes/**}": {
        "teambit.react/react": {}
      },
  
      /**
       * configures components with namespaces 'entities', 'modules' and 'functions' to use the 
       * default NodeJS dev environment.
      */
      "{entities/**}, {modules/**}, {functions/**}": {
        "teambit.harmony/node": {}
      },
      /**
       * configures components with namespace 'content' to use the MDX dev environment.
      */
      "{content/**}": {
        "teambit.mdx/mdx": {}
      },
  
      /**
       * configures components with namespaces 'envs' and 'aspects' to use the default Aspect development environment.
      */
      "{envs/**}, {aspects/**}": {
        "teambit.harmony/aspect": {}
      }
    }`),
  };

  const configMerged = assign(configParsed, variants);

  return stringifyWorkspaceConfig(configMerged);
}
