/** @flow */
import path from 'path';
import Consumer from './consumer';

export default (async function loadConsumer(
  currentPath?: string = process.cwd(),
  newInstance?: boolean = false
): Promise<Consumer> {
  if (newInstance || !loadConsumer.cache || !loadConsumer.cache[currentPath]) {
    const consumer = await Consumer.load(path.resolve(currentPath));
    if (!loadConsumer.cache) loadConsumer.cache = {};
    loadConsumer.cache[currentPath] = consumer;
  }
  return loadConsumer.cache[currentPath];
});
