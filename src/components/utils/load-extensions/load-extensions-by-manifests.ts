import { Harmony, ExtensionManifest } from '@teambit/harmony';
import { UNABLE_TO_LOAD_EXTENSION_FROM_LIST } from './constants';

// TODO: change to use the new logger, see more info at loadExtensions function in the workspace
export async function loadExtensionsByManifests(
  harmony: Harmony,
  extensionsManifests: ExtensionManifest[],
  logger,
  throwOnError = true
) {
  try {
    await harmony.set(extensionsManifests);
  } catch (e) {
    const ids = extensionsManifests.map((manifest) => manifest.name);
    // TODO: improve texts
    const warning = UNABLE_TO_LOAD_EXTENSION_FROM_LIST(ids);
    logger.warn(warning, e);
    logger.consoleFailure(warning);
    if (throwOnError) {
      throw e;
    }
  }
}
