import fs from 'fs-extra';
import * as path from 'path';
import R from 'ramda';

import { BIT_JSON, GLOBAL_CONFIG } from '../constants';
import { Consumer, loadConsumer } from '../consumer';
import logger from '../logger/logger';
import Extension, { LoadArgsProps } from './extension';

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
      // Implementing the catch my self since the throws: false not really working
      .catch((e) => {
        if (throws) {
          throw e;
        }
        logger.debug('error during loading global bit.json', e);
        return null;
      })
  );
};

/**
 * Load specific extension
 * @param {string} consumerPath
 * @param {string} scopePath
 */
const _loadExtension = (consumerPath: string | null | undefined, scopePath: string | null | undefined) => (
  rawConfig: Record<string, any> = {},
  name: string
): Promise<Extension> => {
  const loadArgs: LoadArgsProps = {
    name,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    rawConfig: rawConfig.config,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    options: rawConfig.options,
    consumerPath,
    scopePath,
  };
  return Extension.load(loadArgs);
};

/**
 * Load all extensions
 * Regular, core, globals
 */
export default async function loadExtensions(): Promise<Extension[]> {
  try {
    logger.debug('legacy-extensions.extensions-loader, start loading extensions');
    const getConsumer = async (): Promise<Consumer | null | undefined> => {
      try {
        const consumer = await loadConsumer();
        return consumer;
      } catch (err) {
        return null;
      }
    };
    const consumer: Consumer | null | undefined = await getConsumer();
    let consumerPath = null;
    let scopePath = null;

    let rawExtensions = {};
    if (consumer) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      consumerPath = consumer.getPath();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
    return await Promise.all(extensions);
  } catch (err) {
    logger.error('loading extensions failed', err);
    return [];
  }
}
