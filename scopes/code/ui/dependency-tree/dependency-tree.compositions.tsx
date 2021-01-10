import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { DependencyTree } from './dependency-tree';

export const DrawerExample = () => {
  return (
    <ThemeCompositions>
      <DependencyTree dependenciesArray={data} />
    </ThemeCompositions>
  );
};

DrawerExample.canvas = {
  height: 400,
};

const data = [
  {
    id: 'ui/code-tab-page',
    version: 'latest',
    lifecycle: 'runtime',
    packageName: '@teambit/ui.code-tab-page',
    __typename: 'ComponentDependency',
  },
  {
    id: 'ui/utils/get-file-icon',
    version: 'latest',
    lifecycle: 'runtime',
    packageName: '@teambit/ui.utils.get-file-icon',
    __typename: 'ComponentDependency',
  },
  {
    id: 'teambit.ui-foundation/ui@0.0.236',
    version: '0.0.236',
    lifecycle: 'runtime',
    packageName: '@teambit/ui',
    __typename: 'ComponentDependency',
  },
  {
    id: '@teambit/harmony',
    version: '0.2.10',
    lifecycle: 'runtime',
    packageName: null,
    __typename: 'PackageDependency',
  },
  {
    id: '@types/react',
    version: '16.9.43',
    lifecycle: 'dev',
    packageName: null,
    __typename: 'PackageDependency',
  },
  {
    id: '@types/mocha',
    version: '^5.2.7',
    lifecycle: 'dev',
    packageName: null,
    __typename: 'PackageDependency',
  },
  {
    id: 'react',
    version: '^16.13.1',
    lifecycle: 'peer',
    packageName: null,
    __typename: 'PackageDependency',
  },
  {
    id: 'react-dom',
    version: '^16.13.1',
    lifecycle: 'peer',
    packageName: null,
    __typename: 'PackageDependency',
  },
  {
    id: 'bit-bin',
    version: '14.8.9-dev.253',
    lifecycle: 'peer',
    packageName: null,
    __typename: 'PackageDependency',
  },
];
