/** @flow */
import path from 'path';
import Consumer from './consumer';
import { ConsumerNotFound } from './exceptions';

export async function loadConsumer(
  currentPath?: string = process.cwd(),
  newInstance?: boolean = false
): Promise<Consumer> {
  if (newInstance || !loadConsumer.cache || !loadConsumer.cache[currentPath]) {
    const consumer = await Consumer.load(path.resolve(currentPath));
    if (!loadConsumer.cache) loadConsumer.cache = {};
    loadConsumer.cache[currentPath] = consumer;
  }
  return loadConsumer.cache[currentPath];
}

export async function loadConsumerIfExist(
  currentPath?: string = process.cwd(),
  newInstance?: boolean = false
): Promise<?Consumer> {
  try {
    return await loadConsumer(currentPath, newInstance);
  } catch (err) {
    if (err instanceof ConsumerNotFound) {
      return null;
    }
    throw err;
  }
}
