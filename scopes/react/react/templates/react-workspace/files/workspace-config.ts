import { ComponentContext } from '@teambit/generator';

export function workspaceConfig({ name }: ComponentContext) {
  const data = {
    $schema: 'https://static.bit.dev/teambit/schemas/schema.json',
    'teambit.workspace/workspace': {
      name,
      icon: 'https://static.bit.dev/bit-logo.svg',
      defaultDirectory: '{scope}/{name}',
      defaultScope: 'my-scope',
    },
    'teambit.dependencies/dependency-resolver': {
      packageManager: 'teambit.dependencies/pnpm',
      policy: {
        dependencies: {},
        peerDependencies: {
          react: '16.13.1',
          'react-dom': '16.13.1',
        },
      },
    },
    'teambit.workspace/variants': {
      '*': {
        'teambit.react/react': {},
      },
    },
  };
  return JSON.stringify(data, undefined, 2);
}
