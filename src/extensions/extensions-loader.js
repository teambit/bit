/** @flow */
import path from 'path';
import R from 'ramda';
import fs from 'fs-extra';
import Extension from './extension';
import { loadConsumer, Consumer } from '../consumer';
import logger from '../logger/logger';
import { GLOBAL_CONFIG, BIT_JSON } from '../constants';

/**
 * Load all extensions
 * Regular, defaults, globals
 */
export default (async function loadExtensions(): Extension[] {
  try {
    logger.info('start loading extensions');
    const consumer: Consumer = await loadConsumer();
    let rawExtensions = consumer.bitJson.extensions || {};
    // Load global extensions
    const globalBitJson = await _getGlobalBitJson(false);
    const globalRawExtensions = globalBitJson && globalBitJson.extensions;
    // Merge the global with the local extensions only if exists
    // The local extension is higher priority than the global ones since they are closer to the user
    // This mechanism is for internal use by bitsrc server and should not be used by the users
    if (globalRawExtensions) {
      rawExtensions = R.mergeDeepLeft(rawExtensions, globalRawExtensions);
    }
    const extensions = R.values(
      R.mapObjIndexed(_loadExtension(consumer.getPath(), consumer.scope.path), rawExtensions)
    );
    return Promise.all(extensions);
  } catch (err) {
    logger.error('loading extensions failed');
    logger.error(err);
    return [];
  }
});

/**
 * Load specific exntesion
 * @param {string} consumerPath
 * @param {string} scopePath
 */
const _loadExtension = (consumerPath: string, scopePath: string) => (
  rawConfig: Object = {},
  name: string
): Promise<Extension> => {
  return Extension.load(name, rawConfig.config, rawConfig.options, consumerPath, scopePath);
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
