import { ExtensionManifest } from '../extension-manifest';
import { Extension } from '../extension';

export function extensionFactory({ name, dependencies, config, provider }: ExtensionManifest) {
  return Extension.instantiate({
    name,
    config: config || {},
    dependencies: dependencies || [],
    provider
  });
}
