import { Harmony } from '@teambit/harmony';
import { UNABLE_TO_LOAD_EXTENSION } from './constants';
import { loadExtensionsByManifests } from './load-extensions-by-manifests';
// TODO: change to module path once utils are tracked as components
import { ResolvedComponent } from '../resolved-component';
import { LogPublisher } from '../../types';

export async function loadResolvedExtensions(
  harmony: Harmony,
  resolvedExtensions: ResolvedComponent[],
  logger: LogPublisher
): Promise<void> {
  const manifests = resolvedExtensions.map(resolvedExtension => {
    const compId = resolvedExtension.component.id.toString();
    try {
      const manifest = resolvedExtension.require();
      manifest.name = compId;
      return manifest;
    } catch (e) {
      const warning = UNABLE_TO_LOAD_EXTENSION(compId);
      logger.warn(warning);
      // legacyLogger.warn(`${warning} error: ${e.message}`);
      // legacyLogger.silly(e.stack);
    }
    return undefined;
  });

  // Remove empty manifests as a result of loading issue
  const filteredManifests = manifests.filter(manifest => manifest);
  return loadExtensionsByManifests(harmony, filteredManifests, logger);
}
