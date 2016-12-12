/** @flow */
import * as path from 'path';
import Consumer from './consumer';

export default function loadConsumer(currentPath: ?string) {
  if (!currentPath) currentPath = process.cwd();
  return Consumer.load(path.resolve(currentPath), false);
}
