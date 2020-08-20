import { Harmony } from '@teambit/harmony';
import { UNABLE_TO_LOAD_EXTENSION } from './constants';
import { loadExtensionsByManifests } from './load-extensions-by-manifests';
// TODO: change to module path once utils are tracked as components
import { RequireableComponent } from '../requireable-component';
import { Logger } from '../../../extensions/logger';
import { CannotLoadExtension } from './exceptions';

// TODO: take for some other place like config
// TODO: consider pass it from outside into the function
// TODO: unify this and the same in src/consumer/config/component-config.ts
// @gilad, not sure if I can remove all the todo above.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ignoreLoadingExtensionsErrors = false;

/**
 * in case the extension failed to load, prefer to throw an error, unless `throwOnError` param
 * passed as `false`.
 * there are cases when throwing an error blocks the user from doing anything else. for example,
 * when a user develops an extension and deletes the node-modules, the extension on the workspace
 * cannot be loaded anymore until "bit compile" is running. however, if this function throws an
 * error, it'll throw for "bit compile" as well, which blocks the user.
 * for the CI, it is important to throw an error because errors on console can be ignored.
 * for now, when loading the extension from the workspace the throwOnError is passed as false.
 * when loading from the scope (CI) it should be true.
 *
 * the console printing here is done directly by "console.error" and not by the logger. the reason
 * is that the logger.console only prints when the loader started (which, btw, happens after
 * entering this function, so it can't work) and here we want it to be printed regardless of the
 * rules of starting the loader. e.g. if by mistake the CI got it as throwOnError=false, it's ok
 * to break the output by the console.error.
 *
 * @todo: this is not the final word however about throwing/non throwing errors here.
 * in some cases, such as "bit tag", it's better not to tag if an extension changes the model.
 */
export async function loadRequireableExtensions(
  harmony: Harmony,
  requireableExtensions: RequireableComponent[],
  logger: Logger,
  throwOnError = false
): Promise<void> {
  const manifestsP = requireableExtensions.map(async (requireableExtension) => {
    if (!requireableExtensions) return undefined;
    const id = requireableExtension.component.id.toString();
    try {
      // TODO: @gilad compile before or skip running on bit compile? we need to do this properly
      const aspect = requireableExtension.require();
      const manifest = aspect.default || aspect;
      // manifest.id = id;
      return manifest;
    } catch (e) {
      const errorMsg = UNABLE_TO_LOAD_EXTENSION(id);
      logger.consoleFailure(errorMsg);
      logger.error(errorMsg, e);
      if (throwOnError) {
        // console.log(e);
        throw new CannotLoadExtension(id, e);
      }
      logger.console(e);
    }
    return undefined;
  });
  const manifests = await Promise.all(manifestsP);

  // Remove empty manifests as a result of loading issue
  const filteredManifests = manifests.filter((manifest) => manifest);
  return loadExtensionsByManifests(harmony, filteredManifests, logger, throwOnError);
}
