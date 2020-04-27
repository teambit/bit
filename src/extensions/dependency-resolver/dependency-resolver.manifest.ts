import { ExtensionManifest } from '@teambit/harmony';
import { provideDependencyResolver } from './dependency-resolver.provider';

export const DependencyResolver: ExtensionManifest = {
  name: 'dependencyResolver',
  dependencies: [],
  provider: provideDependencyResolver
};
