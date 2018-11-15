/** @flow */
import path from 'path';
import R from 'ramda';
import fs from 'fs-extra';
import ExtensionWrapper from './extension-wrapper';
import type { ExtensionLoadContext } from './extension-wrapper';
import type { LoadArgsProps } from './extension';
import { loadConsumer, Consumer } from '../consumer';
import logger from '../logger/logger';
import { GLOBAL_CONFIG, BIT_JSON } from '../constants';
import Workspace from './context/workspace';
import Store from './context/store';

/**
 * Load all extensions
 * Regular, core, globals
 */
export default (async function loadExtensions(): Promise<Extension[]> {
  try {
    logger.debug('start loading workspace extensions');
    const getConsumer = async (): Promise<?Consumer> => {
      try {
        const consumer = await loadConsumer();
        return consumer;
      } catch (err) {
        return null;
      }
    };
    const consumer: ?Consumer = await getConsumer();
    const consumerPath = null;
    let scopePath = null;
    let workspace = null;
    let store = null;

    let rawExtensions = {};
    if (consumer) {
      rawExtensions = consumer.bitJson.extensions || {};
      scopePath = consumer.scope.path;
      workspace = await Workspace.load(consumer);
      store = await Store.load(consumer.scope);
    }

    // Load global extensions
    const globalBitJson = await _getGlobalBitJson(false);
    const globalRawExtensions = globalBitJson && globalBitJson.extensions;
    // Merge the global with the local extensions only if exists
    // The local extension is higher priority than the global ones since they are closer to the user
    // This mechanism is for internal use by bitsrc server and should not be used by the users
    if (globalRawExtensions) {
      rawExtensions = R.mergeDeepLeft(rawExtensions, globalRawExtensions);
    }
    const extensions = R.values(R.mapObjIndexed(_loadExtension({ workspace, store }), rawExtensions));
    return Promise.all(extensions);
  } catch (err) {
    logger.error('loading extensions failed');
    logger.error(err);
    return [];
  }
});

/**
 * Load specific extension
 * @param {string} consumerPath
 * @param {string} scopePath
 */
const _loadExtension = (context: ExtensionLoadContext) => async (
  rawConfig: Object = {},
  name: string
): Promise<Extension> => {
  const loadArgs: LoadArgsProps = {
    name,
    rawConfig,
    context
  };
  return ExtensionWrapper.load(loadArgs);
};

/**
 * Load the global bit.json file (in order to get the global extensions)
 * @param {boolean} throws - whether to throw an error if the file corrupted
 */
const _getGlobalBitJson = async (throws: boolean) => {
  const globalBitJsonPath = path.join(GLOBAL_CONFIG, BIT_JSON);
  const exists = await fs.pathExists(globalBitJsonPath);
  if (!exists) return null;

  return (
    fs
      .readJson(globalBitJsonPath, { throws })
      // Implementing the catch my self since the throws: false not really workging
      .catch((e) => {
        if (throws) {
          throw e;
        }
        logger.debug('error during loading global bit.json');
        logger.debug(e);
        return null;
      })
  );
};
