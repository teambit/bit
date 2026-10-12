import { createHash } from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '@teambit/legacy.logger';
import * as eol from '@teambit/toolbox.string.eol';
import SourceFile, { canReadWorkspaceFilesNatively } from './source-file';
import { defaultVinylWrite } from './abstract-vinyl';
import { getRustCheckoutSourceDescriptor } from './rust-checkout-source';
import type AbstractVinyl from './abstract-vinyl';
import {
  isRustWorkspaceEngine,
  registerRustWorkspaceEngineCleanup,
  workspaceEngineSession,
  workspaceEngineIdentity,
} from './rust-workspace-engine';

export type RustCheckoutPlanSourceDescriptor = {
  token: string;
  planIndex: number;
  snapshotPath: string;
  snapshotHash: string;
  bytes: number;
};
type Capsule = {
  owner: object;
  descriptor: RustCheckoutPlanSourceDescriptor;
  body?: Buffer;
  files: Set<SourceFile>;
};
type Provenance = { capsule: Capsule; contents?: PropertyDescriptor };
const files = new WeakMap<AbstractVinyl, Provenance>();
const readSnapshot = fs.readFileSync;
const outputFile = fs.outputFile;
const autoDescriptor = Object.getOwnPropertyDescriptor(eol, 'auto');
const captureAuto = eol.captureDefaultEolAuto;
const captureAutoDescriptor = Object.getOwnPropertyDescriptor(eol, 'captureDefaultEolAuto');
const debug = logger.debug;
const consoleLog = console.log; // eslint-disable-line no-console
// Registration runs after the defining SourceFile class is initialized, including cyclic imports.
// eslint-disable-next-line no-var
var defaults: { clone: unknown; getters: Map<string, PropertyDescriptor | undefined> } | undefined;

function inherited(object: object, name: string): PropertyDescriptor | undefined {
  for (let current: object | null = object; current; current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor) return descriptor;
  }
  return undefined;
}

export function registerRustCheckoutPlanSourceClass(constructor: { prototype: object }): void {
  if (defaults) return;
  defaults = {
    clone: inherited(constructor.prototype, 'clone')?.value,
    getters: new Map(
      ['path', 'relative', 'base', 'cwd', 'contents'].map((name) => [name, inherited(constructor.prototype, name)])
    ),
  };
}

function ordinary(file: AbstractVinyl): file is SourceFile {
  if (
    !defaults ||
    !canReadWorkspaceFilesNatively() ||
    !Object.isExtensible(file) ||
    Object.getOwnPropertyDescriptor(file, '_contents')?.writable !== true ||
    Object.getPrototypeOf(file) !== SourceFile.prototype ||
    inherited(file, 'clone')?.value !== defaults.clone ||
    inherited(file, 'write')?.value !== defaultVinylWrite
  )
    return false;
  const prototypeContents = inherited(SourceFile.prototype, 'contents');
  const expectedContents = defaults.getters.get('contents');
  if (
    prototypeContents?.get !== expectedContents?.get ||
    prototypeContents?.set !== expectedContents?.set ||
    prototypeContents?.value !== expectedContents?.value
  )
    return false;
  const history = Object.getOwnPropertyDescriptor(file, 'history')?.value;
  if (!Array.isArray(history) || Object.getPrototypeOf(history) !== Array.prototype || history.length > 4096)
    return false;
  const historyFields = Object.getOwnPropertyDescriptors(history);
  if (Reflect.ownKeys(historyFields).length !== history.length + 1) return false;
  for (let index = 0; index < history.length; index++) {
    const field = historyFields[index];
    if (!field || !('value' in field) || typeof field.value !== 'string') return false;
  }
  const provenance = files.get(file);
  const repositorySource = getRustCheckoutSourceDescriptor(file);
  return ordinaryMetadata(file, defaults.getters, provenance, Boolean(repositorySource));
}

function ordinaryMetadata(
  file: AbstractVinyl,
  getters: Map<string, PropertyDescriptor | undefined>,
  provenance: Provenance | undefined,
  repositorySource: boolean
): boolean {
  for (const [name, expected] of getters) {
    const actual = inherited(file, name);
    if (name === 'contents' && provenance?.contents?.get === actual?.get && provenance?.contents?.set === actual?.set)
      continue;
    if (name === 'contents' && repositorySource) continue;
    if (actual?.get !== expected?.get || actual?.set !== expected?.set || actual?.value !== expected?.value)
      return false;
  }
  for (const key of Reflect.ownKeys(file)) {
    const descriptor = Object.getOwnPropertyDescriptor(file, key)!;
    if (key === 'contents' && provenance && descriptor.get === provenance.contents?.get) continue;
    if (key === 'contents' && repositorySource) continue;
    if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return false;
  }
  return true;
}

function validDescriptor(descriptor: RustCheckoutPlanSourceDescriptor): boolean {
  return (
    /^[a-f0-9]{40}$/.test(descriptor.token) &&
    Number.isSafeInteger(descriptor.planIndex) &&
    descriptor.planIndex >= 0 &&
    descriptor.planIndex < 4096 &&
    path.isAbsolute(descriptor.snapshotPath) &&
    !descriptor.snapshotPath.includes('\0') &&
    Buffer.from(descriptor.snapshotPath).toString() === descriptor.snapshotPath &&
    /^[a-f0-9]{40}$/.test(descriptor.snapshotHash) &&
    Number.isSafeInteger(descriptor.bytes) &&
    descriptor.bytes >= 0 &&
    descriptor.bytes <= 32 * 1024 * 1024
  );
}

function body(capsule: Capsule): Buffer {
  if (capsule.body) return capsule.body;
  const contents = readSnapshot(capsule.descriptor.snapshotPath);
  if (
    contents.length !== capsule.descriptor.bytes ||
    createHash('sha1').update(contents).digest('hex') !== capsule.descriptor.snapshotHash
  )
    throw new Error('checkout compatibility snapshot changed');
  capsule.body = contents;
  return contents;
}

function hydrate(file: SourceFile, provenance: Provenance): Buffer | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(file, 'contents');
  if (!descriptor || descriptor.get !== provenance.contents?.get || descriptor.set !== provenance.contents?.set) return;
  const contents = body(provenance.capsule);
  if (!descriptor.configurable || Object.getOwnPropertyDescriptor(file, '_contents')?.writable !== true)
    return contents;
  Reflect.deleteProperty(file, 'contents');
  const setter = defaults?.getters.get('contents')?.set;
  if (!setter) throw new Error('checkout compatibility contents setter unavailable');
  setter.call(file, contents);
  return contents;
}

function attach(file: SourceFile, capsule: Capsule): SourceFile {
  const provenance: Provenance = { capsule };
  files.set(file, provenance);
  capsule.files.add(file);
  Object.defineProperty(file, 'contents', {
    configurable: true,
    enumerable: false,
    get() {
      if (files.get(file) !== provenance) return defaults?.getters.get('contents')?.get?.call(file);
      const contents = hydrate(file, provenance);
      if (Object.getOwnPropertyDescriptor(file, 'contents')?.get === provenance.contents?.get) return contents;
      return file.contents;
    },
    set(contents: Buffer) {
      if (Object.getOwnPropertyDescriptor(file, 'contents')?.configurable === false) {
        const setter = defaults?.getters.get('contents')?.set;
        if (!setter) throw new Error('checkout compatibility contents setter unavailable');
        setter.call(file, contents);
        files.delete(file);
        return;
      }
      files.delete(file);
      Reflect.deleteProperty(file, 'contents');
      file.contents = contents;
    },
  });
  provenance.contents = Object.getOwnPropertyDescriptor(file, 'contents');
  return file;
}

/** Clone ordinary metadata without hydrating a retained body merely to send it back to Rust. */
function metadataClone(template: SourceFile): SourceFile {
  const options = Object.fromEntries(
    Object.keys(template).map((name) => [name, Object.getOwnPropertyDescriptor(template, name)!.value])
  );
  const history: string[] = [];
  for (let index = 0; index < template.history.length; index++) history[index] = template.history[index];
  return new SourceFile({
    ...options,
    stat: template.stat || undefined,
    history,
    path: template.path,
    cwd: template.cwd,
    base: template.base,
    contents: Buffer.alloc(0),
  });
}

/** Plan files remain ordinary public SourceFiles; all escaped instances are eager before private cleanup. */
export function createRustCheckoutPlanSourceFile(
  template: SourceFile,
  descriptor: RustCheckoutPlanSourceDescriptor,
  contentsAlias?: Buffer
): SourceFile | undefined {
  if (!isRustWorkspaceEngine() || !ordinary(template) || !validDescriptor(descriptor)) return undefined;
  const file = metadataClone(template);
  return installRustCheckoutPlanSourceContents(file, descriptor, contentsAlias) ? file : undefined;
}

/** Preserve the exact public clone identity when an apply prefix replaces only its body. */
export function installRustCheckoutPlanSourceContents(
  file: SourceFile,
  descriptor: RustCheckoutPlanSourceDescriptor,
  contentsAlias?: Buffer
): boolean {
  if (!workspaceEngineSession().owned || !ordinary(file) || !validDescriptor(descriptor)) return false;
  if (
    contentsAlias !== undefined &&
    (!Buffer.isBuffer(contentsAlias) ||
      contentsAlias.length !== descriptor.bytes ||
      createHash('sha1').update(contentsAlias).digest('hex') !== descriptor.snapshotHash)
  )
    return false;
  const owner = workspaceEngineIdentity();
  if (!owner) return false;
  const capsule: Capsule = { owner, descriptor: { ...descriptor }, body: contentsAlias, files: new Set() };
  if (
    !registerRustWorkspaceEngineCleanup(() => {
      for (const retainedFile of capsule.files) {
        const provenance = files.get(retainedFile);
        if (provenance?.capsule === capsule) hydrate(retainedFile, provenance);
      }
    })
  )
    return false;
  attach(file, capsule);
  return true;
}

/** The default clone shares the same eventual Buffer alias, matching new SourceFile(original). */
export function cloneRustCheckoutPlanSourceFile(template: SourceFile): SourceFile | undefined {
  const descriptor = getRustCheckoutPlanSourceDescriptor(template);
  const provenance = files.get(template);
  if (!descriptor || !provenance || !ordinary(template)) return undefined;
  return attach(metadataClone(template), provenance.capsule);
}

export function getRustCheckoutPlanSourceDescriptor(file: AbstractVinyl): RustCheckoutPlanSourceDescriptor | undefined {
  const provenance = files.get(file);
  if (
    !isRustWorkspaceEngine() ||
    !provenance ||
    provenance.capsule.owner !== workspaceEngineIdentity() ||
    !ordinary(file)
  )
    return undefined;
  const alias = provenance.capsule.body;
  if (
    alias &&
    (alias.length !== provenance.capsule.descriptor.bytes ||
      createHash('sha1').update(alias).digest('hex') !== provenance.capsule.descriptor.snapshotHash)
  )
    return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(file, 'contents');
  if (descriptor?.get !== provenance.contents?.get || descriptor?.set !== provenance.contents?.set) {
    const contents = Object.getOwnPropertyDescriptor(file, '_contents')?.value;
    if (
      !Buffer.isBuffer(contents) ||
      contents !== provenance.capsule.body ||
      contents.length !== provenance.capsule.descriptor.bytes ||
      createHash('sha1').update(contents).digest('hex') !== provenance.capsule.descriptor.snapshotHash
    )
      return undefined;
  }
  return { ...provenance.capsule.descriptor };
}

export function isRustCheckoutPlanSourceFile(file: AbstractVinyl): boolean {
  return files.has(file);
}

export type RustCheckoutPlanWriteContinuation = {
  descriptor: RustCheckoutPlanSourceDescriptor;
  path: string;
  log(): void;
  persist(): Promise<void>;
};

/** Capture the default write's synchronous prefix before a helper request can run user callbacks. */
export function captureRustCheckoutPlanWriteContinuation(
  file: AbstractVinyl
): RustCheckoutPlanWriteContinuation | undefined {
  const descriptor = getRustCheckoutPlanSourceDescriptor(file);
  const currentAuto = Object.getOwnPropertyDescriptor(eol, 'auto');
  const currentCapture = Object.getOwnPropertyDescriptor(eol, 'captureDefaultEolAuto');
  if (
    !descriptor ||
    file.override !== true ||
    typeof file.verbose !== 'boolean' ||
    Object.getOwnPropertyDescriptor(fs, 'outputFile')?.value !== outputFile ||
    inherited(logger, 'debug')?.value !== debug ||
    Object.getOwnPropertyDescriptor(console, 'log')?.value !== consoleLog ||
    currentAuto?.value !== autoDescriptor?.value ||
    currentAuto?.get !== autoDescriptor?.get ||
    currentAuto?.set !== autoDescriptor?.set ||
    currentCapture?.value !== captureAutoDescriptor?.value ||
    currentCapture?.get !== captureAutoDescriptor?.get ||
    currentCapture?.set !== captureAutoDescriptor?.set ||
    typeof captureAuto !== 'function'
  )
    return undefined;
  const autoEol = captureAuto();
  if (!autoEol) return undefined;
  const destination = file.path;
  if (!path.isAbsolute(destination) || destination.includes('\0') || Buffer.byteLength(destination) > 32768)
    return undefined;
  const verbose = file.verbose;
  const message = `writing a file to the file-system at ${destination}, force: true`;
  let logged = false;
  return {
    descriptor,
    path: destination,
    log() {
      if (logged) return;
      logged = true;
      if (verbose) consoleLog.call(console, message);
      debug.call(logger, message);
    },
    async persist() {
      this.log();
      // A hydrated public Buffer may have changed after dispatch. The captured write owns the spool bytes.
      const contents = readSnapshot(descriptor.snapshotPath);
      if (
        contents.length !== descriptor.bytes ||
        createHash('sha1').update(contents).digest('hex') !== descriptor.snapshotHash
      )
        throw new Error('checkout compatibility snapshot changed');
      await outputFile(destination, autoEol(contents));
    },
  };
}
