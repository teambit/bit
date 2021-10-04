import React from 'react';
import { Text, Newline } from 'ink';
import { EnvService, EnvDefinition } from '@teambit/envs';
import highlight from 'cli-highlight';

export type PkgDescriptor = {
  id: string;
  displayName: string;
  config?: string;
};

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
