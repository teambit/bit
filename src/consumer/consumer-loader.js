/** @flow */
import path from 'path';
import Consumer from './consumer';

export default function loadConsumer(currentPath: ?string): Promise<Consumer> {
  if (!currentPath) currentPath = process.cwd();
  return Consumer.load(path.resolve(currentPath));
}
