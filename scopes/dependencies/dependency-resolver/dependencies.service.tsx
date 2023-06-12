import React from 'react';
import { Text, Newline } from 'ink';
import { EnvService, EnvDefinition, Env, EnvContext, ServiceTransformationMap } from '@teambit/envs';
import highlight from 'cli-highlight';
import { DependencyDetector } from './dependency-detector';

export type DependenciesDescriptor = {
  id: string;
  displayName: string;
  config?: string;
};

type DependenciesTransformationMap = ServiceTransformationMap & {
  getDepDetectors: () => DependencyDetector[] | null;
};

export class DependenciesService implements EnvService<{}, DependenciesDescriptor> {
  name = 'Dependencies';

  async render(env: EnvDefinition) {
    const descriptor = await this.getDescriptor(env);

    return (
      <Text key={descriptor?.id}>
        <Text color="cyan">configured dependencies: </Text>
        <Newline />
        <Text>
          {descriptor?.config && highlight(descriptor?.config, { language: 'javascript', ignoreIllegals: true })}
        </Text>
        <Newline />
      </Text>
    );
  }

  async getDescriptor(env: EnvDefinition): Promise<DependenciesDescriptor | undefined> {
    if (!env.env.getDependencies) return undefined;
    const dependencies = await env.env.getDependencies();
    return {
      id: this.name,
      config: dependencies ? JSON.stringify(dependencies, null, 2) : undefined,
      displayName: this.name,
    };
  }

  transform(env: Env, context: EnvContext): DependenciesTransformationMap | undefined {
    // Old env
    if (!env?.detectors) return undefined;
    return {
      getDepDetectors: () => env.detectors()(context),
    };
  }
}
