import { HookNotFound } from '../exceptions';
import { ExtensionManifest } from './extension-manifest';
// :TODO refactor this file asap

export type ExtensionOptions = {
  dependencies?: ExtensionManifest[];
  name?: string;
};

const map: any = {};

/**
 * decorator for an Harmony extension.
 */
export function ExtensionDecorator({ name, dependencies }: ExtensionOptions = {}) {
  function classDecorator<T extends { new (...args: any[]): {} }>(constructor: T) {
    Reflect.defineMetadata('harmony:name', name || constructor.name, constructor);
    Reflect.defineMetadata('harmony:dependencies', calculateDependnecies(constructor, dependencies), constructor);
  }

  return classDecorator;
}

export function provider() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const keys = Reflect.getMetadata('design:paramtypes', descriptor);
  };
}

// @hack todo: must be defined and assigned from a single location
function providerFn(classExtension: any) {
  return classExtension.provide ? classExtension.provide : classExtension.provider;
}

function calculateDependnecies(classExtension: any, deps?: ExtensionManifest[]): ExtensionManifest[] {
  function fromMetadata() {
    const provider = providerFn(classExtension);
    if (provider) {
      //   // TODO: check why Reflect.getMetadataKeys(provider) is empty and how to access method param types.
      //   console.log(Reflect.getMetadataKeys(classExtension.provide))
      return [];
    }

    return Reflect.getMetadata('design:paramtypes', classExtension);
  }

  const dependnecies = deps ? deps : fromMetadata() || [];
  const hookDeps = classExtension.__hookDeps ? classExtension.__hookDeps : [];
  return dependnecies.concat(hookDeps) || [];
}

// :TODO refactor this asap to handle harmony objects properly
export function register(extension: ExtensionManifest, name?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    // if (!target.constructor.__hookDeps) Reflect.defineMetadata('harmony:subscriptions', [extension], target.constructor);
    // else target.constructor.__hookDeps.push(extension);

    const extensionName = Reflect.getMetadata('harmony:name', extension);
    if (!map[extensionName]) {
      map[extensionName] = {};
    }

    const hook = map[extensionName][name || propertyKey];
    // if (!hook) throw new HookNotFound();
    if (!hook) return;
    hook.register(target[propertyKey]);
  };
}

export function createHook() {
  const randomId = Math.random().toString(36).substring(2);
  map[randomId] = HookRegistry.create();
  const decorator = function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const registry = map[randomId];
    registry.register(descriptor.value);
  };

  decorator.hash = randomId;

  return decorator;
}

export function hook(name?: string) {
  return function (target: any, propertyKey: string) {
    let instance = HookRegistry.create();
    const extensionName = Reflect.getMetadata('harmony:name', target.constructor);
    const hookName = name || propertyKey;

    if (!map[extensionName]) map[extensionName] = { [hookName]: instance };
    else map[extensionName][hookName] = instance;

    Object.defineProperty(target, propertyKey, {
      get: () => {
        return instance;
      },
      set: (value) => {
        instance = value;
      },
    });
  };
}

export class HookRegistry<T> {
  constructor(private fillers: T[], readonly hash?: string) {}

  register(filler: T) {
    this.fillers.push(filler);
  }

  list() {
    // return map[this.name][name] || [];
    return this.fillers;
  }

  static of<T>(hook: any): HookRegistry<T> {
    return map[hook.hash];
  }

  // hack due to https://github.com/microsoft/TypeScript/issues/4881
  static create<T>() {
    return new HookRegistry<T>([]);
  }
}
