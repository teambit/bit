import { createHash } from 'crypto';
import path from 'path';
import { Ref, type Repository, type Source, type SourceFileModel } from '@teambit/objects';
import SourceFile from './source-file';
import type AbstractVinyl from './abstract-vinyl';
import { defaultVinylWrite } from './abstract-vinyl';
import { acquireWorkspaceSession } from './rust-workspace-materializer';

export type RustCheckoutSourceDescriptor = { objectsDirectory: string; hash: string };
type Provenance = {
  repository: Repository;
  reference: Ref;
  descriptor: RustCheckoutSourceDescriptor;
  contents?: PropertyDescriptor;
};
const sources = new WeakMap<AbstractVinyl, Provenance>();

/** Only call after the native read-only plan has validated every referenced Source. */
export function createRustCheckoutSourceFile(
  model: SourceFileModel,
  repository: Repository,
  validated = false
): SourceFile | undefined {
  if (!validated || model.file.load !== Ref.prototype.load || !repository.canReadCheckoutSourcesNatively([model.file]))
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
    !models.every((model) => model.file.load === Ref.prototype.load) ||
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
  const lease = acquireWorkspaceSession();
  if (!lease) return undefined;
  try {
    for (let offset = 0; offset < manifest.length; offset += 64) {
      const batch = manifest.slice(offset, offset + 64);
      const completed = await lease.session.request(
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
  } catch {
    return undefined;
  } finally {
    await lease.release();
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
    provenance.reference.toString() !== provenance.descriptor.hash ||
    !contents?.get ||
    contents.get !== provenance.contents?.get ||
    contents.set !== provenance.contents?.set ||
    provenance.reference.load !== Ref.prototype.load ||
    file.write !== defaultVinylWrite ||
    !provenance.repository.canReadCheckoutSourcesNatively([provenance.reference]) ||
    path.resolve(provenance.repository.getPath()) !== provenance.descriptor.objectsDirectory
  )
    return undefined;
  return { ...provenance.descriptor };
}

/** Source identities are SHA-1 of the original bytes, before workspace EOL conversion. */
export function compareRustCheckoutSource(file: SourceFile, current?: SourceFile): boolean | undefined {
  const descriptor = getRustCheckoutSourceDescriptor(file);
  if (!descriptor) return undefined;
  if (!current) return false;
  return createHash('sha1').update(current.contents).digest('hex') === descriptor.hash;
}
