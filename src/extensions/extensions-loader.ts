/** @flow */
import path from 'path';
import R from 'ramda';
import fs from 'fs-extra';
import Extension from './extension';
import type { LoadArgsProps } from './extension';
import { loadConsumer, Consumer } from '../consumer';
import logger from '../logger/logger';
import { GLOBAL_CONFIG, BIT_JSON } from '../constants';

/**
 * Load all extensions
 * Regular, core, globals
 */
export default (async function loadExtensions(): Promise<Extension[]> {
  try {
    logger.debug('start loading extensions');
    const getConsumer = async (): Promise<?Consumer> => {
      try {
        const consumer = await loadConsumer();
        return consumer;
      } catch (err) {
        return null;
      }
    };
    const consumer: ?Consumer = await getConsumer();
    let consumerPath = null;
    let scopePath = null;

    let rawExtensions = {};
    if (consumer) {
      rawExtensions = consumer.config.extensions || {};
      consumerPath = consumer.getPath();
      scopePath = consumer.scope.path;
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
    const extensions = R.values(R.mapObjIndexed(_loadExtension(consumerPath, scopePath), rawExtensions));
    return Promise.all(extensions);
  } catch (err) {
    logger.error('loading extensions failed', err);
    return [];
  }
});

/**
 * Load specific extension
 * @param {string} consumerPath
 * @param {string} scopePath
 */
const _loadExtension = (consumerPath: ?string, scopePath: ?string) => (
  rawConfig: Object = {},
  name: string
): Promise<Extension> => {
  const loadArgs: LoadArgsProps = {
    name,
    rawConfig: rawConfig.config,
    options: rawConfig.options,
    consumerPath,
    scopePath
  };
  return Extension.load(loadArgs);
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
