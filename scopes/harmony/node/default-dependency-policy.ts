import type { EnvPolicyConfigObject } from '@teambit/dependency-resolver';

/** Default dependency policy, accessible without loading the environment runtime. */
export function getNodeDependencyPolicy(): EnvPolicyConfigObject {
  return {
    // dependencies: {
    //   react: '-',
    //   'react-dom': '-',
    // },
    devDependencies: {
      // react: '-',
      // 'react-dom': '-',
      '@types/jest': '26.0.20',
      '@types/node': '22.10.5',
    },
    peers: [
      {
        name: 'react',
        /* the version to be installed and used by the env */
        version: '^19.0.0',
        /* the range of versions this env's components are compatible with */
        supportedRange: '^17.0.0 || ^18.0.0 || ^19.0.0',
      },
      {
        name: 'react-dom',
        /* the version to be installed and used by the env */
        version: '^19.0.0',
        /* the range of versions this env's components are compatible with */
        supportedRange: '^17.0.0 || ^18.0.0 || ^19.0.0',
      },
    ],
  };
}
