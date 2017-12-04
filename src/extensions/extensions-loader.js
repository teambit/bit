/** @flow */
import R from 'ramda';
import Extension from './extension';
import { loadConsumer, Consumer } from '../consumer';
import logger from '../logger/logger';

export default (async function loadExtensions(): Extension[] {
  try {
    const consumer: Consumer = await loadConsumer();
    const rawExtensions = consumer.bitJson.extensions || {};
    const extensions = R.values(R.mapObjIndexed(_loadExtension(consumer.scope.path), rawExtensions));
    return Promise.all(extensions);
  } catch (err) {
    return [];
  }
});

const _loadExtension = (scopePath: string) => (rawConfig: Object, name: string): Promise<Extension> => {
  return Extension.load(name, rawConfig, scopePath);
};
