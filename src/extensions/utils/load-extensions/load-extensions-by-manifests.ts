import { Harmony, ExtensionManifest } from '@teambit/harmony';
import { UNABLE_TO_LOAD_EXTENSION_FROM_LIST } from './constants';
// TODO: change to module path once types are tracked as components
import { LogPublisher } from '../../types';

export async function loadExtensionsByManifests(
  harmony: Harmony,
  extensionsManifests: ExtensionManifest[],
  logger: LogPublisher
) {
  try {
    await harmony.set(extensionsManifests);
  } catch (e) {
    const ids = extensionsManifests.map(manifest => manifest.name);
    const warning = UNABLE_TO_LOAD_EXTENSION_FROM_LIST(ids);
    logger.warn(warning);
    // legacyLogger.warn(`${warning} error: ${e.message}`);
    // legacyLogger.silly(e.stack);
  }
}
