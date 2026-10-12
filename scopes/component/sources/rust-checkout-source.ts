import { createHash } from 'crypto';
import path from 'path';
import { types } from 'util';
import {
  Ref,
  registerRustSnapshotFunctionReference,
  hasRustSnapshotTransactionClassFields,
  hasRustSnapshotFunctionReference,
  type Repository,
  type Source,
  type SourceFileModel,
} from '@teambit/objects';
import SourceFile, { canReadWorkspaceFilesNatively } from './source-file';
import type AbstractVinyl from './abstract-vinyl';
import { defaultVinylWrite } from './abstract-vinyl';
import { withWorkspaceSession } from './rust-workspace-persistence';

export type RustCheckoutSourceDescriptor = { objectsDirectory: string; hash: string };
type Provenance = {
  repository: Repository;
  reference: Ref;
  descriptor: RustCheckoutSourceDescriptor;
  contents?: PropertyDescriptor;
  hydrated?: { body: Buffer; snapshot: Buffer; source: Source };
};
const sources = new WeakMap<AbstractVinyl, Provenance>();
const bufferEquals = Buffer.prototype.equals;
const bufferFrom = Buffer.from;
const sourceCreateHash = createHash;
// Resolve package exports once while still observing live CommonJS exports on every guard.
const historyQueryModule = require.resolve('@teambit/objects/dist/objects/rust-history-query.js');
const mergeTransactionModule = require.resolve('@teambit/objects/dist/objects/rust-merge-transaction.js');
const historySourcesModule = require.resolve('@teambit/objects/dist/objects/rust-history-query-sources.js');

function hasOwnedRepositorySourceOperation(): boolean {
  if (process.env.BIT_RUST_CLIENT_VCS !== 'on') return false;
  const query = require(historyQueryModule);
  const queryActive = Object.getOwnPropertyDescriptor(query, 'isRustHistoryQueryOperation')?.value;
  if (hasRustSnapshotFunctionReference('HistoryQueryOperationActive', queryActive) && queryActive()) return true;
  const merge = require(mergeTransactionModule);
  const mergeActive = Object.getOwnPropertyDescriptor(merge, 'isRustMergeTransactionOperation')?.value;
  return hasRustSnapshotFunctionReference('MergeTransactionOperationActive', mergeActive) && mergeActive();
}

function canRetainSourceBody(source: Source, body: unknown, hash: string): body is Buffer {
  if (!hasOwnedRepositorySourceOperation()) return false;
  if (
    types.isProxy(source) ||
    (body && typeof body === 'object' && types.isProxy(body)) ||
    !hasRustSnapshotTransactionClassFields(source, 'Source', ['contents']) ||
    !Buffer.isBuffer(body) ||
    Object.getPrototypeOf(body) !== Buffer.prototype ||
    Object.getOwnPropertyDescriptor(source, 'contents')?.value !== body ||
    Object.getOwnPropertyDescriptor(Buffer, 'from')?.value !== bufferFrom ||
    Object.getOwnPropertyDescriptor(require('crypto'), 'createHash')?.value !== sourceCreateHash
  )
    return false;
  return sourceCreateHash('sha1').update(body).digest('hex') === hash;
}
const vinylContents = Object.getOwnPropertyDescriptor(require('vinyl').prototype, 'contents');
function retainedFileBody(file: AbstractVinyl): Buffer | undefined {
  if (types.isProxy(file)) return undefined;
  const own = Object.getOwnPropertyDescriptor(file, 'contents');
  if (own) return 'value' in own && Buffer.isBuffer(own.value) ? own.value : undefined;
  let prototype = Object.getPrototypeOf(file);
  while (prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'contents');
    if (descriptor) {
      if (
        !vinylContents ||
        descriptor.get !== vinylContents.get ||
        descriptor.set !== vinylContents.set ||
        descriptor.enumerable !== vinylContents.enumerable ||
        descriptor.configurable !== vinylContents.configurable
      )
        return undefined;
      const contents = Object.getOwnPropertyDescriptor(file, '_contents');
      return contents && 'value' in contents && Buffer.isBuffer(contents.value) ? contents.value : undefined;
    }
    prototype = Object.getPrototypeOf(prototype);
  }
  return undefined;
}

const refDefaults = { load: Ref.prototype.load, toString: Ref.prototype.toString };
function ordinarySourceRef(reference: Ref): boolean {
  const hash = reference && Object.getOwnPropertyDescriptor(reference, 'hash')?.value;
  return Boolean(
    reference &&
      Object.getPrototypeOf(reference) === Ref.prototype &&
      typeof hash === 'string' &&
      /^[0-9a-f]{40}$/.test(hash) &&
      Object.entries(refDefaults).every(([name, method]) => {
        const descriptor =
          Object.getOwnPropertyDescriptor(reference, name) || Object.getOwnPropertyDescriptor(Ref.prototype, name);
        return descriptor?.value === method;
      })
  );
}

/** Only call after the native read-only plan has validated every referenced Source. */
export function createRustCheckoutSourceFile(
  model: SourceFileModel,
  repository: Repository,
  validated = false
): SourceFile | undefined {
  if (!validated || !ordinarySourceRef(model.file) || !repository.canReadCheckoutSourcesNatively([model.file]))
    return undefined;
  const hash = model.file.toString();
  if (!/^[0-9a-f]{40}$/.test(hash)) return undefined;
  const snapshotReference = new Ref(hash);
  const file = new SourceFile({ base: '.', path: model.relativePath, contents: Buffer.alloc(0), test: model.test });
  const provenance: Provenance = {
    repository,
    reference: model.file,
    descriptor: { objectsDirectory: path.resolve(repository.getPath()), hash },
  };
  sources.set(file, provenance);
  Object.defineProperty(file, 'contents', {
    configurable: true,
    enumerable: false,
    get() {
      // Preserve live in-memory object precedence if it changed since the native plan.
      const content = (repository.objects[hash] ||
        repository.getCache(snapshotReference) ||
        repository.loadSync(snapshotReference)) as Source;
      sources.delete(file);
      Reflect.deleteProperty(file, 'contents');
      file.contents = content.contents;
      const body = retainedFileBody(file);
      if (canRetainSourceBody(content, body, hash)) {
        provenance.hydrated = { body, snapshot: bufferFrom(body), source: content };
        sources.set(file, provenance);
      }
      return file.contents;
    },
    set(contents: Buffer) {
      sources.delete(file);
      Reflect.deleteProperty(file, 'contents');
      // Restore Vinyl's own validation and storage rather than replacing its semantics.
      file.contents = contents;
    },
  });
  provenance.contents = Object.getOwnPropertyDescriptor(file, 'contents');
  return file;
}

/** Validate the complete source set before checkout can remove any old workspace files. */
export async function prepareRustCheckoutSources(
  models: SourceFileModel[],
  repository: Repository
): Promise<SourceFile[] | undefined> {
  if (
    process.env.BIT_RUST_CLIENT_VCS !== 'on' ||
    !canReadWorkspaceFilesNatively() ||
    !models.every((model) => ordinarySourceRef(model.file)) ||
    !repository.canReadCheckoutSourcesNatively(models.map((model) => model.file))
  )
    return undefined;
  if (!models.length) return [];
  const manifest = models.map((model) => ({
    model,
    hash: model.file.toString(),
    relativePath: model.relativePath,
    name: model.name,
    test: model.test,
  }));
  const objectsDirectory = path.resolve(repository.getPath());
  if (
    !validPath(objectsDirectory) ||
    !models.every(
      (model) =>
        /^[0-9a-f]{40}$/.test(model.file.toString()) &&
        typeof model.relativePath === 'string' &&
        !path.isAbsolute(model.relativePath) &&
        !model.relativePath.split(/[\\/]/).includes('..') &&
        validPath(path.resolve(objectsDirectory, model.relativePath))
    )
  )
    return undefined;
  try {
    return await withWorkspaceSession(async (session) => {
      for (let offset = 0; offset < manifest.length; offset += 64) {
        const batch = manifest.slice(offset, offset + 64);
        const completed = await session.request(
          (id) =>
            checkoutSourceFrame(
              'BWC0',
              id,
              objectsDirectory,
              batch.map((entry) => ({
                hash: entry.hash,
                destination: path.resolve(objectsDirectory, entry.relativePath),
              }))
            ),
          batch.length
        );
        if (completed !== batch.length) return undefined;
      }
      if (
        models.length !== manifest.length ||
        !manifest.every(
          (entry, index) =>
            models[index] === entry.model &&
            entry.model.file.toString() === entry.hash &&
            entry.model.relativePath === entry.relativePath &&
            entry.model.name === entry.name &&
            entry.model.test === entry.test
        )
      )
        return undefined;
      const files = models.map((model) => createRustCheckoutSourceFile(model, repository, true));
      return files.every((file): file is SourceFile => Boolean(file)) ? files : undefined;
    });
  } catch {
    return undefined;
  }
}

function validPath(filename: string): boolean {
  return (
    path.isAbsolute(filename) &&
    !filename.includes('\0') &&
    Buffer.byteLength(filename) <= 32768 &&
    Buffer.from(filename).toString() === filename
  );
}

export function checkoutSourceFrame(
  magic: 'BWC0' | 'BWC1',
  id: number,
  objectsDirectory: string,
  files: { hash: string; destination: string }[]
): Buffer {
  const header = Buffer.alloc(12);
  header.write(magic);
  header.writeUInt32BE(id, 4);
  header.writeUInt32BE(files.length, 8);
  const parts: Buffer[] = [header];
  const writePath = (filename: string) => {
    const bytes = Buffer.from(filename);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    parts.push(length, bytes);
  };
  writePath(objectsDirectory);
  for (const file of files) {
    parts.push(Buffer.from(file.hash, 'hex'));
    writePath(file.destination);
    const flags = Buffer.alloc(8);
    flags.writeUInt32BE(1, 0);
    flags.writeUInt32BE(1, 4);
    parts.push(flags);
  }
  return Buffer.concat(parts);
}

/** Inspect provenance without touching the lazy contents getter. */
export function getRustCheckoutSourceDescriptor(file: AbstractVinyl): RustCheckoutSourceDescriptor | undefined {
  const provenance = sources.get(file);
  const contents = Object.getOwnPropertyDescriptor(file, 'contents');
  if (
    !provenance ||
    !ordinarySourceRef(provenance.reference) ||
    provenance.reference.toString() !== provenance.descriptor.hash ||
    !contents?.get ||
    contents.get !== provenance.contents?.get ||
    contents.set !== provenance.contents?.set ||
    file.write !== defaultVinylWrite ||
    !provenance.repository.canReadCheckoutSourcesNatively([provenance.reference]) ||
    path.resolve(provenance.repository.getPath()) !== provenance.descriptor.objectsDirectory
  )
    return undefined;
  return { ...provenance.descriptor };
}

function historySourceMetadata(file: AbstractVinyl): boolean {
  const descriptors = Object.getOwnPropertyDescriptors(file);
  Reflect.deleteProperty(descriptors, 'contents');
  const metadata = Object.create(Object.getPrototypeOf(file), descriptors);
  if (
    !hasRustSnapshotTransactionClassFields(metadata, 'SourceFile', [
      'history',
      '_base',
      '_cwd',
      'base',
      'path',
      'relative',
    ])
  )
    return false;
  const history = descriptors.history?.value;
  if (!Array.isArray(history) || !hasRustSnapshotTransactionClassFields(history, 'Array', [])) return false;
  const fields = Object.getOwnPropertyDescriptors(history);
  if (Reflect.ownKeys(fields).length !== history.length + 1 || history.length > 4096) return false;
  for (let index = 0; index < history.length; index++) {
    if (!fields[index] || !('value' in fields[index]) || typeof fields[index].value !== 'string') return false;
  }
  return true;
}

function ownedHistorySourceAlias(repository: Repository, hash: string): boolean {
  const querySources = require(historySourcesModule);
  const aliasGuard = Object.getOwnPropertyDescriptor(querySources, 'hasRustHistoryQuerySourceAlias')?.value;
  return hasRustSnapshotFunctionReference('HistoryQuerySourceAlias', aliasGuard) && aliasGuard(repository, hash);
}

function hydratedSourceAuthority(provenance: Provenance): boolean {
  const hydrated = provenance.hydrated;
  if (!hydrated) return false;
  const query = require(historyQueryModule);
  const capture = Object.getOwnPropertyDescriptor(query, 'lookupRustHistoryQueryObject')?.value;
  if (!hasRustSnapshotFunctionReference('HistoryQueryObjectLookup', capture)) return false;
  const objects = capture(provenance.repository, provenance.descriptor.hash) as { value?: object } | undefined;
  if (!objects || path.resolve(provenance.repository.getPath()) !== provenance.descriptor.objectsDirectory)
    return false;
  const cached = objects.value;
  return (
    (!cached ||
      cached === hydrated.source ||
      ownedHistorySourceAlias(provenance.repository, provenance.descriptor.hash)) &&
    !types.isProxy(hydrated.source) &&
    hasRustSnapshotTransactionClassFields(hydrated.source, 'Source', ['contents']) &&
    Object.getOwnPropertyDescriptor(hydrated.source, 'contents')?.value === hydrated.body
  );
}

/** History reads retain the actual public loader's repository authority. */
export function getRustHistorySourceDescriptor(
  file: AbstractVinyl,
  repository: Repository
): RustCheckoutSourceDescriptor | undefined {
  const provenance = sources.get(file);
  if (
    types.isProxy(file) ||
    provenance?.repository !== repository ||
    !historySourceMetadata(file) ||
    !ordinarySourceRef(provenance.reference) ||
    Object.getOwnPropertyDescriptor(provenance.reference, 'hash')?.value !== provenance.descriptor.hash
  )
    return undefined;
  const hydrated = provenance.hydrated;
  if (hydrated) {
    if (
      retainedFileBody(file) !== hydrated.body ||
      Object.getPrototypeOf(hydrated.body) !== Buffer.prototype ||
      Object.getOwnPropertyDescriptor(Buffer.prototype, 'equals')?.value !== bufferEquals ||
      !bufferEquals.call(hydrated.body, hydrated.snapshot) ||
      !hydratedSourceAuthority(provenance)
    )
      return undefined;
    return { ...provenance.descriptor };
  }
  const contents = Object.getOwnPropertyDescriptor(file, 'contents');
  if (!contents || contents.get !== provenance.contents?.get || contents.set !== provenance.contents?.set)
    return undefined;
  const direct = getRustCheckoutSourceDescriptor(file);
  if (direct) return direct;
  if (
    !repository.canReadCheckoutSourcesNatively([]) ||
    !ownedHistorySourceAlias(repository, provenance.descriptor.hash)
  )
    return undefined;
  return { ...provenance.descriptor };
}
registerRustSnapshotFunctionReference('HistoryQuerySourceDescriptor', getRustHistorySourceDescriptor);

/** The canonical clone has already observed contents; retain only its exact immutable body alias. */
export function inheritRustHistorySourceSnapshot(original: SourceFile, clone: SourceFile): void {
  if (types.isProxy(original) || types.isProxy(clone)) return;
  const provenance = sources.get(original);
  const body = provenance?.hydrated?.body;
  if (
    !body ||
    retainedFileBody(clone) !== body ||
    !hasRustSnapshotTransactionClassFields(clone, 'SourceFile', [
      'history',
      '_base',
      '_cwd',
      'base',
      'path',
      'relative',
    ])
  )
    return;
  sources.set(clone, provenance!);
}

/** Source identities are SHA-1 of the original bytes, before workspace EOL conversion. */
export function compareRustCheckoutSource(file: SourceFile, current?: SourceFile): boolean | undefined {
  const descriptor = getRustCheckoutSourceDescriptor(file);
  if (!descriptor) return undefined;
  if (!current) return false;
  return createHash('sha1').update(current.contents).digest('hex') === descriptor.hash;
}
