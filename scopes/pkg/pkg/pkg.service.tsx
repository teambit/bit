import React from 'react';
import { Text, Newline } from 'ink';
import { EnvService, EnvDefinition, Env, EnvContext, ServiceTransformationMap, GetNpmIgnoreContext } from '@teambit/envs';
import highlight from 'cli-highlight';
import { PackageJsonProps } from './pkg.main.runtime';

export type PkgDescriptor = {
  id: string;
  displayName: string;
  config?: string;
};

type PkgTransformationMap = ServiceTransformationMap  & {
  getPackageJsonProps: () => PackageJsonProps,
  getNpmIgnore: (npmIgnoreContext?: GetNpmIgnoreContext) => string[];
}

export class PkgService implements EnvService<{}, PkgDescriptor> {
  name = 'Pkg';

  async render(env: EnvDefinition) {
    const descriptor = this.getDescriptor(env);

    return (
      <Text key={descriptor?.id}>
        <Text color="cyan">configured package.json properties: </Text>
        <Newline />
        <Text>
          {descriptor?.config && highlight(descriptor?.config, { language: 'javascript', ignoreIllegals: true })}
        </Text>
        <Newline />
      </Text>
    );
  }

  transform(env: Env, context: EnvContext): PkgTransformationMap | undefined {
    // Old env
    if (!env?.package) return undefined;
    const packageGenerator = env.package()(context);

    return {
      getPackageJsonProps: () => packageGenerator.packageJsonProps,
      // TODO: somehow handle context here? used in the aspect env
      getNpmIgnore: () => packageGenerator.npmIgnore,
    }
  }

  getDescriptor(env: EnvDefinition): PkgDescriptor | undefined {
    if (!env.env.getPackageJsonProps) return undefined;
    const props = env.env.getPackageJsonProps();
    return {
      id: this.name,
      config: props ? JSON.stringify(props, null, 2) : undefined,
      displayName: this.name,
    };
  }
}
