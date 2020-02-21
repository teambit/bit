import { ExtensionManifest } from '../extension-manifest';
import { Extension } from '../extension';

export function extensionFactory(manifest: ExtensionManifest) {
  return new Extension(manifest);
}
