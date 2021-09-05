import * as path from 'path';

import Consumer from './consumer';
import { ConsumerNotFound } from './exceptions';

type LoadConsumerFunc = {
  (currentPath?: string, newInstance?: boolean): Promise<Consumer>;
  cache?: Record<string, Consumer>;
};

export const loadConsumer: LoadConsumerFunc = async function (
  currentPath = process.cwd(),
  newInstance = false
): Promise<Consumer> {
  if (newInstance || !loadConsumer.cache || !loadConsumer.cache[currentPath]) {
    const consumer = await Consumer.load(path.resolve(currentPath));
    if (!loadConsumer.cache) loadConsumer.cache = {};
    loadConsumer.cache[currentPath] = consumer;
  }
  return loadConsumer.cache[currentPath];
};

export async function loadConsumerIfExist(
  currentPath = process.cwd(),
  newInstance = false
): Promise<Consumer | undefined> {
  try {
    return await loadConsumer(currentPath, newInstance);
  } catch (err: any) {
    if (err instanceof ConsumerNotFound) {
      return undefined;
    }
    throw err;
  }
}
