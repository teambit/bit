/** @flow */
import R from 'ramda';
import Extension from './extension';
import { loadConsumer, Consumer } from '../consumer';
import logger from '../logger/logger';

const newCommands = [];
const newHooks = [];
const registerToHooks = [];

export default (async function loadExtensions(): Extension[] {
  const consumer: Consumer = await loadConsumer();
  const rawExtensions = consumer.bitJson.extensions || [];
  const extensions = R.mapObjIndexed(_loadExtension, rawExtensions);
});

function _loadExtension(rawConfig: Object, name: string) {
  return Extension.load(name, rawConfig);
}
