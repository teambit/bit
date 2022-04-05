import { ComponentDescriptor } from './component-descriptor';
import type { AspectListProps } from './aspect-list';

export const plainsApectObject: AspectListProps = {
  entries: [
    {
      aspectId: 'teambit.component/dev-files',
      aspectData: {
        id: 'teambit.component/dev-files',
        icon: 'https://static.bit.dev/extensions-icons/default.svg',
      },
    },
  ],
};

export const descriptorMock = ComponentDescriptor.fromObject({
  id: 'teambit.cloud/blocks/footer@0.0.24',
  aspectList: {
    entries: [
      {
        aspectId: 'teambit.component/dev-files',
        aspectData: {
          id: 'teambit.component/dev-files',
          data: {
            devPatterns: {
              'teambit.community/envs/community-react@1.95.0': [],
              config: [],
              'teambit.defender/tester': ['**/*.spec.+(js|ts|jsx|tsx)', '**/*.test.+(js|ts|jsx|tsx)'],
              'teambit.compositions/compositions': ['**/*.composition?(s).*'],
              'teambit.docs/docs': ['**/*.docs.*'],
            },
            devFiles: {
              'teambit.community/envs/community-react@1.95.0': [],
              config: [],
              'teambit.defender/tester': ['footer.spec.tsx'],
              'teambit.compositions/compositions': ['footer.composition.tsx'],
              'teambit.docs/docs': ['footer.docs.mdx'],
            },
          },
          icon: 'https://static.bit.dev/extensions-icons/default.svg',
        },
      },
      {
        aspectId: 'teambit.docs/docs',
        aspectData: {
          id: 'teambit.docs/docs',
          data: {
            doc: {
              filePath: 'footer.docs.mdx',
              props: [
                {
                  name: 'description',
                  value: 'A Footer component.',
                },
                {
                  name: 'labels',
                  value: ['footer', 'footing', 'foot', 'page footer', 'superfooter'],
                },
              ],
            },
          },
          icon: 'https://static.bit.dev/extensions-icons/default.svg',
        },
      },
      {
        aspectId: 'teambit.compositions/compositions',
        aspectData: {
          id: 'teambit.compositions/compositions',
          data: {
            compositions: [
              {
                identifier: 'BasicFooter',
                filepath: 'footer.composition.tsx',
              },
            ],
          },
          icon: 'https://static.bit.dev/extensions-icons/default.svg',
        },
      },
      {
        aspectId: 'teambit.envs/envs',
        aspectData: {
          id: 'teambit.envs/envs',
          config: {
            __specific: true,
            env: 'teambit.community/envs/community-react',
          },
          data: {
            type: 'react',
            id: 'teambit.community/envs/community-react@1.95.0',
            icon: 'https://static.bit.dev/extensions-icons/react.svg',
          },
          icon: 'https://static.bit.dev/extensions-icons/default.svg',
        },
      },
      {
        aspectId: 'teambit.dependencies/dependency-resolver',
        aspectData: {
          id: 'teambit.dependencies/dependency-resolver',
          data: {
            dependencies: [
              {
                id: 'teambit.base-ui/layout/page-frame@1.0.1',
                version: '1.0.1',
                __type: 'component',
                lifecycle: 'runtime',
                source: 'auto',
                componentId: {
                  scope: 'teambit.base-ui',
                  name: 'layout/page-frame',
                  version: '1.0.1',
                },
                isExtension: false,
                packageName: '@teambit/base-ui.layout.page-frame',
              },
              {
                id: 'teambit.design/blocks/footer@1.90.6',
                version: '1.90.6',
                __type: 'component',
                lifecycle: 'runtime',
                source: 'auto',
                componentId: {
                  scope: 'teambit.design',
                  name: 'blocks/footer',
                  version: '1.90.6',
                },
                isExtension: false,
                packageName: '@teambit/design.blocks.footer',
              },
              {
                id: 'teambit.design/ui/brand/logo@1.90.6',
                version: '1.90.6',
                __type: 'component',
                lifecycle: 'runtime',
                source: 'auto',
                componentId: {
                  scope: 'teambit.design',
                  name: 'ui/brand/logo',
                  version: '1.90.6',
                },
                isExtension: false,
                packageName: '@teambit/design.ui.brand.logo',
              },
              {
                id: 'teambit.design/ui/navigation/icon-link@1.90.6',
                version: '1.90.6',
                __type: 'component',
                lifecycle: 'runtime',
                source: 'auto',
                componentId: {
                  scope: 'teambit.design',
                  name: 'ui/navigation/icon-link',
                  version: '1.90.6',
                },
                isExtension: false,
                packageName: '@teambit/design.ui.navigation.icon-link',
              },
              {
                id: 'teambit.base-ui/layout/breakpoints@1.0.0',
                version: '1.0.0',
                __type: 'component',
                lifecycle: 'runtime',
                source: 'auto',
                componentId: {
                  scope: 'teambit.base-ui',
                  name: 'layout/breakpoints',
                  version: '1.0.0',
                },
                isExtension: false,
                packageName: '@teambit/base-ui.layout.breakpoints',
              },
              {
                id: 'teambit.community/envs/community-react@1.95.0',
                version: '1.95.0',
                __type: 'component',
                lifecycle: 'dev',
                source: 'auto',
                componentId: {
                  scope: 'teambit.community',
                  name: 'envs/community-react',
                  version: '1.95.0',
                },
                isExtension: true,
                packageName: '@teambit/community.envs.community-react',
              },
              {
                id: 'core-js',
                version: '^3.0.0',
                __type: 'package',
                lifecycle: 'runtime',
                source: 'env',
              },
              {
                id: '@types/testing-library__jest-dom',
                version: '5.9.5',
                __type: 'package',
                lifecycle: 'dev',
                source: 'env',
              },
              {
                id: '@babel/runtime',
                version: '7.12.18',
                __type: 'package',
                lifecycle: 'dev',
                source: 'env',
              },
              {
                id: '@types/jest',
                version: '^26.0.0',
                __type: 'package',
                lifecycle: 'dev',
                source: 'env',
              },
              {
                id: '@types/react-dom',
                version: '^17.0.5',
                __type: 'package',
                lifecycle: 'dev',
                source: 'env',
              },
              {
                id: '@types/react',
                version: '^17.0.8',
                __type: 'package',
                lifecycle: 'dev',
                source: 'env',
              },
              {
                id: '@types/node',
                version: '12.20.4',
                __type: 'package',
                lifecycle: 'dev',
                source: 'env',
              },
              {
                id: '@testing-library/react',
                version: '12.1.3',
                __type: 'package',
                lifecycle: 'peer',
                source: 'auto',
              },
              {
                id: 'react',
                version: '^16.8.0 || ^17.0.0',
                __type: 'package',
                lifecycle: 'peer',
                source: 'env',
              },
            ],
            policy: [
              {
                dependencyId: '@types/testing-library__jest-dom',
                value: {
                  version: '5.9.5',
                  resolveFromEnv: false,
                },
                lifecycleType: 'dev',
                source: 'env',
              },
              {
                dependencyId: '@babel/runtime',
                value: {
                  version: '7.12.18',
                  resolveFromEnv: false,
                },
                lifecycleType: 'dev',
                source: 'env',
              },
              {
                dependencyId: '@types/jest',
                value: {
                  version: '^26.0.0',
                  resolveFromEnv: false,
                },
                lifecycleType: 'dev',
                source: 'env',
              },
              {
                dependencyId: '@types/react-dom',
                value: {
                  version: '^17.0.5',
                  resolveFromEnv: false,
                },
                lifecycleType: 'dev',
                source: 'env',
              },
              {
                dependencyId: '@types/react',
                value: {
                  version: '^17.0.8',
                  resolveFromEnv: false,
                },
                lifecycleType: 'dev',
                source: 'env',
              },
              {
                dependencyId: '@types/node',
                value: {
                  version: '12.20.4',
                  resolveFromEnv: false,
                },
                lifecycleType: 'dev',
                source: 'env',
              },
              {
                dependencyId: '@types/mocha',
                value: {
                  version: '-',
                  resolveFromEnv: false,
                },
                lifecycleType: 'dev',
                source: 'env',
              },
              {
                dependencyId: 'react-dom',
                value: {
                  version: '-',
                  resolveFromEnv: false,
                },
                lifecycleType: 'dev',
                source: 'env',
              },
              {
                dependencyId: 'react',
                value: {
                  version: '-',
                  resolveFromEnv: false,
                },
                lifecycleType: 'dev',
                source: 'env',
              },
              {
                dependencyId: 'core-js',
                value: {
                  version: '^3.0.0',
                  resolveFromEnv: false,
                },
                lifecycleType: 'runtime',
                source: 'env',
              },
            ],
          },
          icon: 'https://static.bit.dev/extensions-icons/default.svg',
        },
      },
      {
        aspectId: 'teambit.pkg/pkg',
        aspectData: {
          id: 'teambit.pkg/pkg',
          data: {
            packageJsonModification: {
              main: 'dist/{main}.js',
              types: '{main}.ts',
            },
          },
          icon: 'https://static.bit.dev/extensions-icons/default.svg',
        },
      },
      {
        aspectId: 'teambit.pipelines/builder',
        aspectData: {
          id: 'teambit.pipelines/builder',
          data: {
            pipeline: [
              {
                taskId: 'teambit.compilation/compiler',
                taskName: 'TSCompiler',
                taskDescription: 'compile components for artifact dist',
                errors: [],
                startTime: 1646925407558,
                endTime: 1646925407864,
              },
              {
                taskId: 'teambit.defender/tester',
                taskName: 'TestComponents',
                errors: [],
              },
              {
                taskId: 'teambit.preview/preview',
                taskName: 'GeneratePreview',
                errors: [],
                startTime: 1646925472204,
                endTime: 1646925533342,
              },
              {
                taskId: 'teambit.pkg/pkg',
                taskName: 'PackComponents',
                errors: [],
                warnings: [],
                startTime: 1646925625353,
                endTime: 1646925626926,
              },
            ],
            aspectsData: [
              {
                aspectId: 'teambit.defender/tester',
                data: {
                  tests: {
                    testFiles: [
                      {
                        file: 'footer.spec.js',
                        tests: [
                          {
                            ancestor: ['<Footer>'],
                            name: 'should render a link to the blog',
                            status: 'passed',
                            duration: 0,
                          },
                        ],
                        pass: 1,
                        failed: 0,
                        pending: 0,
                        duration: 230,
                        slow: false,
                      },
                    ],
                    success: true,
                    start: 1646925429143,
                  },
                },
              },
              {
                aspectId: 'teambit.preview/preview',
                data: {
                  size: {
                    files: [
                      {
                        name: 'teambit_cloud_blocks_footer-component.js',
                        size: 29393,
                        compressedSize: 8299,
                      },
                      {
                        name: 'footer.d30059ab.css',
                        size: 2012,
                        compressedSize: 762,
                      },
                    ],
                    assets: [],
                    totalFiles: 31405,
                    totalAssets: 0,
                    total: 31405,
                    compressedTotalFiles: 9061,
                    compressedTotalAssets: 0,
                    compressedTotal: 9061,
                  },
                },
              },
              {
                aspectId: 'teambit.pkg/pkg',
                data: {
                  pkgJson: {
                    name: '@teambit/cloud.blocks.footer',
                    version: '0.0.24',
                    homepage: 'https://bit.dev/teambit/cloud/blocks/footer',
                    main: 'dist/index.js',
                    componentId: {
                      scope: 'teambit.cloud',
                      name: 'blocks/footer',
                      version: '0.0.24',
                    },
                    dependencies: {
                      'core-js': '^3.0.0',
                      '@teambit/base-ui.layout.page-frame': '1.0.1',
                      '@teambit/design.blocks.footer': '1.90.6',
                      '@teambit/design.ui.brand.logo': '1.90.6',
                      '@teambit/design.ui.navigation.icon-link': '1.90.6',
                      '@teambit/base-ui.layout.breakpoints': '1.0.0',
                    },
                    devDependencies: {
                      '@types/testing-library__jest-dom': '5.9.5',
                      '@babel/runtime': '7.12.18',
                      '@types/jest': '^26.0.0',
                      '@types/react-dom': '^17.0.5',
                      '@types/react': '^17.0.8',
                      '@types/node': '12.20.4',
                      '@teambit/community.envs.community-react': '1.95.0',
                    },
                    peerDependencies: {
                      '@testing-library/react': '12.1.3',
                      react: '^16.8.0 || ^17.0.0',
                    },
                    license: 'SEE LICENSE IN LICENSE',
                    bit: {
                      bindingPrefix: '@teambit',
                      overrides: {
                        dependencies: {
                          'core-js': '^3.0.0',
                        },
                        devDependencies: {
                          '@types/testing-library__jest-dom': '5.9.5',
                          '@babel/runtime': '7.12.18',
                          '@types/jest': '^26.0.0',
                          '@types/react-dom': '^17.0.5',
                          '@types/react': '^17.0.8',
                          '@types/node': '12.20.4',
                          '@types/mocha': '-',
                          'react-dom': '-',
                          react: '-',
                        },
                      },
                    },
                  },
                  tarName: 'teambit-cloud.blocks.footer-0.0.24.tgz',
                  checksum: '8bce935aa10f5915342613837e494ac86231a016',
                },
              },
            ],
          },
          icon: 'https://static.bit.dev/extensions-icons/default.svg',
        },
      },
      {
        aspectId: 'teambit.dot-components/aspects/components-env',
        aspectData: {
          id: 'teambit.community/envs/community-react@1.95.0',
          icon: 'https://static.bit.dev/extensions-icons/react.svg',
        },
      },
      {
        aspectId: 'teambit.dot-components/aspects/components-scope-build',
        aspectData: {
          closestTag: {
            hash: '45e1aef150d0d3bd2a939aed832935f9cc9a258e',
            version: '0.0.24',
          },
          buildStatus: 'succeed',
          snap: {
            timestamp: '1646925378055',
            hash: '45e1aef150d0d3bd2a939aed832935f9cc9a258e',
            author: {
              displayName: 'Nitsan Cohen',
              email: '77798308+NitsanCohen770@users.noreply.github.com',
            },
            message: '',
            parents: ['9e7ae704cd6583d9d341c576c4741810c33cfc64'],
          },
        },
      },
      {
        aspectId: 'teambit.dot-components/aspects/component-graph-scope',
        aspectData: [
          {
            id: 'teambit.base-ui/layout/page-frame@1.0.1',
            version: '1.0.1',
            __type: 'component',
            lifecycle: 'runtime',
            source: 'auto',
            componentId: {
              scope: 'teambit.base-ui',
              name: 'layout/page-frame',
              version: '1.0.1',
            },
            isExtension: false,
            packageName: '@teambit/base-ui.layout.page-frame',
          },
          {
            id: 'teambit.design/blocks/footer@1.90.6',
            version: '1.90.6',
            __type: 'component',
            lifecycle: 'runtime',
            source: 'auto',
            componentId: {
              scope: 'teambit.design',
              name: 'blocks/footer',
              version: '1.90.6',
            },
            isExtension: false,
            packageName: '@teambit/design.blocks.footer',
          },
          {
            id: 'teambit.design/ui/brand/logo@1.90.6',
            version: '1.90.6',
            __type: 'component',
            lifecycle: 'runtime',
            source: 'auto',
            componentId: {
              scope: 'teambit.design',
              name: 'ui/brand/logo',
              version: '1.90.6',
            },
            isExtension: false,
            packageName: '@teambit/design.ui.brand.logo',
          },
          {
            id: 'teambit.design/ui/navigation/icon-link@1.90.6',
            version: '1.90.6',
            __type: 'component',
            lifecycle: 'runtime',
            source: 'auto',
            componentId: {
              scope: 'teambit.design',
              name: 'ui/navigation/icon-link',
              version: '1.90.6',
            },
            isExtension: false,
            packageName: '@teambit/design.ui.navigation.icon-link',
          },
          {
            id: 'teambit.base-ui/layout/breakpoints@1.0.0',
            version: '1.0.0',
            __type: 'component',
            lifecycle: 'runtime',
            source: 'auto',
            componentId: {
              scope: 'teambit.base-ui',
              name: 'layout/breakpoints',
              version: '1.0.0',
            },
            isExtension: false,
            packageName: '@teambit/base-ui.layout.breakpoints',
          },
          {
            id: 'teambit.community/envs/community-react@1.95.0',
            version: '1.95.0',
            __type: 'component',
            lifecycle: 'dev',
            source: 'auto',
            componentId: {
              scope: 'teambit.community',
              name: 'envs/community-react',
              version: '1.95.0',
            },
            isExtension: true,
            packageName: '@teambit/community.envs.community-react',
          },
          {
            id: 'core-js',
            version: '^3.0.0',
            __type: 'package',
            lifecycle: 'runtime',
            source: 'env',
          },
          {
            id: '@types/testing-library__jest-dom',
            version: '5.9.5',
            __type: 'package',
            lifecycle: 'dev',
            source: 'env',
          },
          {
            id: '@babel/runtime',
            version: '7.12.18',
            __type: 'package',
            lifecycle: 'dev',
            source: 'env',
          },
          {
            id: '@types/jest',
            version: '^26.0.0',
            __type: 'package',
            lifecycle: 'dev',
            source: 'env',
          },
          {
            id: '@types/react-dom',
            version: '^17.0.5',
            __type: 'package',
            lifecycle: 'dev',
            source: 'env',
          },
          {
            id: '@types/react',
            version: '^17.0.8',
            __type: 'package',
            lifecycle: 'dev',
            source: 'env',
          },
          {
            id: '@types/node',
            version: '12.20.4',
            __type: 'package',
            lifecycle: 'dev',
            source: 'env',
          },
          {
            id: '@testing-library/react',
            version: '12.1.3',
            __type: 'package',
            lifecycle: 'peer',
            source: 'auto',
          },
          {
            id: 'react',
            version: '^16.8.0 || ^17.0.0',
            __type: 'package',
            lifecycle: 'peer',
            source: 'env',
          },
        ],
      },
    ],
  },
});
