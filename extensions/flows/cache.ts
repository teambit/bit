/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { createHash } from 'crypto';
import { path, equals } from 'ramda';
import { promises as fs } from 'fs';
import { lock, unlock } from 'proper-lockfile';
import { join } from 'path';
import { CACHE_ROOT } from '../../constants';
import { Capsule } from '../isolator/capsule';
import ConsumerComponent from '../../consumer/component';
import { AbstractVinyl } from '../../consumer/component/sources';

export class ExecutionCache {
  constructor(private pathToCache: string) {}

  hash(capsule: Capsule, name: string) {
    // const component = capsule.component.toLegacyConsumerComponent
    const configString = JSON.stringify(path(['component', 'extensions'], capsule));
    // for some reason in this point i get consumerComponent and not a component
    const consumerComponent = (capsule.component as any) as ConsumerComponent;
    // capsule.component..extensions.flows
    const { files, packageJsonFile } = consumerComponent;
    const vinylFiles: AbstractVinyl[] = [...files];
    if (packageJsonFile) vinylFiles.push(packageJsonFile.toVinylFile());
    const content = `${configString}\n${capsule.wrkDir}\n${vinylFiles
      .map(file => (file.contents || '').toString())
      .join('\n')}`;
    const md5 = createHash('md5', { encoding: 'utf8' })
      .update(content)
      .digest('base64')
      .toString();
    return md5;
  }

  async saveHashValue(capsule: Capsule, name: string): Promise<void> {
    // const release = await lock(this.pathToCache, { realpath: false });
    await safeGetLock(this.pathToCache);
    const file = await safeReadFile(this.pathToCache);
    const content = file ? JSON.parse(file) : {};
    const hash = this.hash(capsule, name);
    content[capsule.wrkDir] = content[capsule.wrkDir] || {};
    content[capsule.wrkDir][name] = hash;
    await fs.writeFile(this.pathToCache, JSON.stringify(content, null, 2));
    return unlock(this.pathToCache);
  }

  async getCacheValue(wrkDir: string, name: string): Promise<string | undefined> {
    // const release = await lock(this.pathToCache, {
    //   realpath: false
    // });
    await safeGetLock(this.pathToCache);
    const file = await safeReadFile(this.pathToCache);
    const content = file ? JSON.parse(file) : {};
    const cacheValue = path([wrkDir, name], content);
    await unlock(this.pathToCache);
    return cacheValue;
  }

  async compareToCache(capsule: Capsule, name: string): Promise<boolean> {
    const inCache = await this.getCacheValue(capsule.wrkDir, name);
    const hashValue = this.hash(capsule, name);
    return equals(inCache, hashValue);
  }
}

export function getExecutionCache() {
  const pathToCache = join(CACHE_ROOT, 'capsules', 'cache-flow.json');
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

async function safeGetLock(
  cachePath: string,
  options: {
    init: (somePath: string) => Promise<void>;
    timeout: number;
  } = {
    init: (somePath: string) => fs.writeFile(somePath, '{}', 'utf8'),
    timeout: 100
  }
) {
  let lockState: 'UNLOCK' | 'LOCK' | 'UNLOCKERROR' = 'UNLOCK';
  try {
    await lock(cachePath, { retries: 5, update: options.timeout });
    lockState = 'LOCK';
  } catch (e) {
    if (e.code === 'ENOENT') {
      await options.init(cachePath);
    } else {
      lockState = 'UNLOCKERROR';
      // console.log('something else: ', e.code) should log this
    }
  }
  return lockState === 'UNLOCK'
    ? safeGetLock(cachePath)
    : lockState === 'UNLOCKERROR'
    ? new Promise(function(resolve) {
        setTimeout(function() {
          return safeGetLock(cachePath).then(() => resolve());
        }, options.timeout);
      })
    : undefined;
}
