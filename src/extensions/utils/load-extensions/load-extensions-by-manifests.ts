import { Harmony, ExtensionManifest } from '@teambit/harmony';
import { UNABLE_TO_LOAD_EXTENSION_FROM_LIST } from './constants';

// TODO: change to use the new logger, see more info at loadExtensions function in the workspace
export async function loadExtensionsByManifests(harmony: Harmony, extensionsManifests: ExtensionManifest[], logger) {
  try {
    await harmony.set(extensionsManifests);
  } catch (e) {
    const ids = extensionsManifests.map(manifest => manifest.name);
    const warning = UNABLE_TO_LOAD_EXTENSION_FROM_LIST(ids);
    logger.warn(warning);
    // TODO: improve texts
    logger.console(warning, 'warn', 'yellow');
    logger.warn(warning, e);
  }
}
