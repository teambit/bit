/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { createHash } from 'crypto';
import { path, equals } from 'ramda';
import { promises as fs } from 'fs';
import { lock } from 'proper-lockfile';
import { join } from 'path';
import { CACHE_ROOT } from '../../constants';
import { Capsule } from '../isolator/capsule';
import ConsumerComponent from '../../consumer/component';

export class ExecutionCache {
  constructor(private pathToCache: string) {}

  hash(capsule: Capsule) {
    // const component = capsule.component.toLegacyConsumerComponent

    // for some reason in this point i get consumerComponent and not a component
    const consumerComponent = (capsule.component as any) as ConsumerComponent;

    const { files, packageJsonFile } = consumerComponent;
    const content = `${capsule.wrkDir}\n${[...files, packageJsonFile!.toVinylFile()]
      .map(file => (file.contents || '').toString())
      .join('\n')}`;
    const md5 = createHash('md5', { encoding: 'utf8' })
      .update(content)
      .digest('base64')
      .toString();
    return md5;
  }

  async saveHashValue(capsule: Capsule, name: string): Promise<void> {
    const release = await lock(this.pathToCache, { realpath: false });
    const file = await safeReadFile(this.pathToCache);
    const content = file ? JSON.parse(file) : {};
    const hash = this.hash(capsule);
    content[capsule.wrkDir] = content[capsule.wrkDir] || {};
    content[capsule.wrkDir][name] = hash;
    await fs.writeFile(this.pathToCache, JSON.stringify(content, null, 2));
    return release();
  }

  async getCacheValue(wrkDir: string, name: string): Promise<string | undefined> {
    const release = await lock(this.pathToCache, {
      realpath: false
    });
    const file = await safeReadFile(this.pathToCache);
    const content = file ? JSON.parse(file) : {};
    const cacheValue = path([wrkDir, name], content);
    await release();
    return cacheValue;
  }

  async compareToCache(capsule: Capsule, name: string): Promise<boolean> {
    const inCache = await this.getCacheValue(capsule.wrkDir, name);
    const hashValue = this.hash(capsule);
    return equals(inCache, hashValue);
  }
}

export function getExecutionCache() {
  const pathToCache = join(CACHE_ROOT, 'cache-flow.json');
  return new ExecutionCache(pathToCache);
}

async function safeReadFile(filePath: string) {
  let content: string | null = null;
  try {
    content = await fs.readFile(filePath, { encoding: 'utf8' });
    // eslint-disable-next-line no-empty
  } catch (e) {}
  return content;
}
