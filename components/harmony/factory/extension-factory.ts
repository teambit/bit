import { ExtensionManifest } from '../extension/extension-manifest';
import { Extension } from '../extension/extension';

export function extensionFactory(manifest: ExtensionManifest) {
  // to allow the use of `provide` as an alias to `provider` in ExtensionManifest
  if (manifest.provide) manifest.provider = manifest.provide;
  return new Extension(manifest);
}
