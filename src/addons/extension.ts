import path from 'path';
import { ExtensionAPI } from './extension-api';
import { BitId, BitIds } from '../bit-id';
import { CACHE_ROOT } from '../constants';
import { loadConsumer, Consumer } from '../consumer';
import { BitCapsule } from '../capsule';
import { default as CapsuleBuilder, Options } from '../environment/capsule-builder';
import logger from '../logger/logger';
import { PipeElementConfig } from './pipe-element';

export type UserExtension = {
  run: (api: ExtensionAPI, config: PipeElementConfig) => Promise<void>;
  show?: (api: ExtensionAPI) => Promise<void>;
  defineDependencies?: (api: ExtensionAPI) => Promise<void>;
};

export type UserExtensionFactory = () => UserExtension;

export async function importExtensionObject(id: BitId) {
  const module = await loadComponent(id);
  const factory = typeof module === 'function' ? module : (module as any).default;
  return factory();
}

export async function installComponents(ids: BitId[]): Promise<any[]> {
  const consumer = await loadConsumer();
  const invalidComponents = (await consumer.componentLoader.loadMany(new BitIds(...ids), false)).invalidComponents;
  const components = await Promise.all(invalidComponents.map(component => installComponent(component.id)));
  return components;
}

export async function installComponent(id: BitId) {
  const capsule = await createComponentCapsule(id);
  const isInstalled = await isComponentInstalled(capsule);
  console.log('after bit install', isInstalled);
  if (!isInstalled) {
    try {
      await capsule.exec({ command: 'npm init --yes'.split(' ') });
      const npmId = `@bit/${id
        .toString()
        .split('/')
        .join('.')}`;
      console.log('work directory', capsule.wrkDir);
      const command = `npm i ${npmId}`.split(' ');
      console.log('command', '"', command.join(' '), '"');
      await capsule.exec({ command });
      await capsule.fs.promises.writeFile(
        path.join(capsule.wrkDir, 'index.js'),
        `module.exports = require('${npmId}');`
      );
    } catch (e) {
      logger.error(`extensions.ts-installComponent failed to setup capsule`);
    }
  }
  console.log('work directory', capsule.wrkDir);
  return capsule;
}

export async function createComponentCapsule(id: BitId) {
  const componentDir = path.join(CACHE_ROOT, 'components');
  const builder = new CapsuleBuilder(componentDir);
  return builder.createCapsule(id);
}

export async function isComponentInstalled(id: BitId | BitCapsule): Promise<boolean> {
  const capsule = id instanceof BitId ? await createComponentCapsule(id) : id;
  const packageJsonPath = path.join(capsule.wrkDir, 'package.json');
  return canBeRequired(packageJsonPath);
}

export async function loadComponent(id: BitId) {
  // const capsule = await loadComponentFromScope(id) || await installComponent(id);
  const capsule = await installComponent(id);
  let component = null;
  try {
    component = require(capsule.wrkDir);
  } catch (e) {
    logger.error(`extension.ts-loadComponent failed to load(require) capsule`);
  }
  return component!;
}

export function canBeRequired(id: string) {
  let canRequire = true;
  try {
    require.resolve(id);
  } catch (e) {
    canRequire = false;
  }
  return canRequire;
}

export async function loadComponentFromScope(id: BitId) {
  const consumer = await loadConsumer();
  const loadResult = await consumer.loadComponents(new BitIds(id));
  if (loadResult.invalidComponents.length) {
    return null;
  }
  console.log('loading from scope');
  const builder = new CapsuleBuilder(consumer.getPath());
  return builder.createCapsule(id);
}
