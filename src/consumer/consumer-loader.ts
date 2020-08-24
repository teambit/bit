import * as path from 'path';

import Consumer from './consumer';
import { ConsumerNotFound } from './exceptions';

export async function loadConsumer(
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  currentPath?: string = process.cwd(),
  newInstance? = false
): Promise<Consumer> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (newInstance || !loadConsumer.cache || !loadConsumer.cache[currentPath]) {
    const consumer = await Consumer.load(path.resolve(currentPath));
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!loadConsumer.cache) loadConsumer.cache = {};
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    loadConsumer.cache[currentPath] = consumer;
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return loadConsumer.cache[currentPath];
}

export async function loadConsumerIfExist(
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  currentPath?: string = process.cwd(),
  newInstance? = false
): Promise<Consumer | undefined> {
  try {
    return await loadConsumer(currentPath, newInstance);
  } catch (err) {
    if (err instanceof ConsumerNotFound) {
      return undefined;
    }
    throw err;
  }
}
