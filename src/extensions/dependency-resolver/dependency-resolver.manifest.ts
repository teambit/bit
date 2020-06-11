import { ExtensionManifest } from '@teambit/harmony';
import { provideDependencyResolver } from './dependency-resolver.provider';

export const DependencyResolver: ExtensionManifest = {
  name: '@teambit/dependency-resolver',
  dependencies: [],
  provider: provideDependencyResolver
};
