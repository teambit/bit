import { Extension } from '@teambit/harmony';
import { RawComponentState, DependenciesDefinition, DependencyResolverWorkspaceConfig } from './types';

// TODO: add example of exposing a hook once its API is final by harmony
// export const Dependencies = Hooks.create();
// export const FileDependencies = Hooks.create();

@Extension
export class DependencyResolver {
  /**
   * Will return the final dependencies of the component after all calculation
   * @param rawComponent
   * @param dependencyResolverWorkspaceConfig
   */
  // TODO: remove this rule upon implementation
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getDependencies(
    rawComponent: RawComponentState,
    dependencyResolverWorkspaceConfig: DependencyResolverWorkspaceConfig
  ): DependenciesDefinition {
    // TODO: remove this rule upon implementation
    // eslint-disable-next-line
    return undefined;
  }
}
