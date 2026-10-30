import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import zlib from 'zlib';
import { ScopeJson } from '@teambit/legacy.scope';
import { ModelComponent, Source } from '../models';
import { ObjectList } from './object-list';
import Ref from './ref';
import Repository from './repository';
import { IndexType } from './scope-index';

const SCOPE_NAME = 'my-scope';
const SOURCES_COUNT = 5;

/**
 * `Repository.list(types)` is what rebuilds a missing `index.json`, and it's asked for a handful of
 * object types in a scope that is mostly file contents. the type is in each file's header, so the
 * rest of a file should only be read when its type is one that was asked for.
 */
describe('Repository.list', () => {
  let scopePath: string;
  let scopeJson: ScopeJson;
  let repository: Repository;
  let contentReads: number;
  const original = {
    onPostObjectRead: Repository.onPostObjectRead,
    hasPostObjectReadTransformer: Repository.hasPostObjectReadTransformer,
  };

  beforeEach(async () => {
    scopePath = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-repository-spec-'));
    scopeJson = new ScopeJson(
      { name: SCOPE_NAME, version: '1.0.0', groupName: null },
      path.join(scopePath, 'scope.json')
    );
    repository = await Repository.create({ scopePath, scopeJson });
    const modelComponent = ModelComponent.from({
      name: 'bar/foo',
      scope: SCOPE_NAME,
      lang: 'javascript',
      deprecated: false,
      bindingPrefix: '@bit',
      versions: {},
    });
    const sources = Array.from({ length: SOURCES_COUNT }, (_, i) => Source.from(Buffer.from(`file ${i}`)));
    const objects = [modelComponent, ...sources];
    objects.forEach((object) => {
      object.validateBeforePersist = false;
    });
    await repository.writeObjectsToTheFS(objects);

    contentReads = 0;
    // every full read of an object file goes through this hook, while a header read doesn't
    Repository.onPostObjectRead = (content) => {
      contentReads += 1;
      return content;
    };
  });

  afterEach(async () => {
    Repository.onPostObjectRead = original.onPostObjectRead;
    Repository.hasPostObjectReadTransformer = original.hasPostObjectReadTransformer;
    await fs.remove(scopePath);
  });

  it('should rebuild a missing index.json reading the contents of the wanted objects only', async () => {
    Repository.hasPostObjectReadTransformer = () => false;
    await Repository.reset(scopePath);
    const loaded = await Repository.load({ scopePath, scopeJson });
    expect(loaded.scopeIndex.getHashes(IndexType.components)).to.have.lengthOf(1);
    expect(contentReads).to.equal(1);
  });

  it('should read every object once when a transformer is registered, as the header is transformed too', async () => {
    Repository.hasPostObjectReadTransformer = () => true;
    const objects = await repository.list([ModelComponent]);
    expect(objects).to.have.lengthOf(1);
    expect(contentReads).to.equal(SOURCES_COUNT + 1);
  });

  it('should skip an object whose header names a type nothing is registered under, as the full read does', async () => {
    Repository.hasPostObjectReadTransformer = () => false;
    const hash = 'a'.repeat(40);
    const content = 'whatever';
    const unknownObject = zlib.deflateSync(Buffer.from(`NotARealType ${hash} ${content.length}\0${content}`));
    const objectPath = repository.objectPath(Ref.from(hash));
    await fs.outputFile(objectPath, unknownObject);
    const objects = await repository.list([ModelComponent]);
    expect(objects).to.have.lengthOf(1);
    expect(objects[0]).to.be.instanceOf(ModelComponent);
  });
});

/**
 * the export flow moves every object through these methods, so for components with thousands of files, the number of
 * fs operations and compressions per object is what makes an export fast or slow.
 */
describe('Repository writing objects for export', () => {
  let scopePath: string;
  let repository: Repository;

  beforeEach(async () => {
    scopePath = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-repository-spec-'));
    const scopeJson = new ScopeJson(
      { name: SCOPE_NAME, version: '1.0.0', groupName: null },
      path.join(scopePath, 'scope.json')
    );
    repository = await Repository.create({ scopePath, scopeJson });
  });

  afterEach(async () => {
    await fs.remove(scopePath);
  });

  const createObjectList = async (count: number) => {
    const sources = Array.from({ length: count }, (_, i) => Source.from(Buffer.from(`file ${i}`)));
    return ObjectList.fromBitObjects(sources);
  };

  it('should write a file per pending object and read them back', async () => {
    const objectList = await createObjectList(SOURCES_COUNT);
    const pendingDir = path.join(scopePath, 'pending-objects', 'client-1');
    await repository.writeObjectsToPendingDir(objectList, pendingDir);
    for (const objectItem of objectList.objects) {
      const hash = objectItem.ref.toString();
      const written = await fs.readFile(path.join(pendingDir, hash.slice(0, 2), hash.slice(2)));
      expect(written.equals(objectItem.buffer)).to.be.true;
    }
    const loaded = await repository.readObjectsFromPendingDir(pendingDir);
    expect(loaded.objects.map((o) => o.ref.toString()).sort()).to.deep.equal(
      objectList.objects.map((o) => o.ref.toString()).sort()
    );
  });

  it('should write the given raw buffers of sources without re-compressing them, and leave no tmp files', async () => {
    const objectList = await createObjectList(SOURCES_COUNT);
    const { bitObjectList, rawSources } = await objectList.toBitObjectsWithRawSources();
    expect(rawSources.size).to.equal(SOURCES_COUNT);
    bitObjectList.getAll().forEach((obj) => {
      obj.compressWithSize = async () => {
        throw new Error('should not re-compress');
      };
    });
    await repository.writeObjectsToTheFS(bitObjectList.getAll(), rawSources);
    for (const objectItem of objectList.objects) {
      const written = await fs.readFile(repository.objectPath(objectItem.ref));
      expect(written.equals(objectItem.buffer)).to.be.true;
    }
    const objectDirs = await fs.readdir(repository.getPath());
    const allFiles = (
      await Promise.all(objectDirs.map((dir) => fs.readdir(path.join(repository.getPath(), dir))))
    ).flat();
    expect(allFiles).to.have.lengthOf(SOURCES_COUNT);
    expect(allFiles.filter((fileName) => fileName.startsWith('.'))).to.have.lengthOf(0);
  });

  it('should not use a raw buffer of a source whose content does not match its ref', async () => {
    const [first, second] = (await createObjectList(2)).objects;
    const tampered = new ObjectList([{ ref: first.ref, buffer: second.buffer }]);
    const { rawSources } = await tampered.toBitObjectsWithRawSources();
    expect(rawSources.size).to.equal(0);
  });

  it('should re-create an object dir that was removed after it was written to', async () => {
    const source = Source.from(Buffer.from('some content'));
    await repository.writeObjectsToTheFS([source]);
    await fs.remove(path.dirname(repository.objectPath(source.hash())));
    await repository.writeObjectsToTheFS([source]);
    expect(await fs.pathExists(repository.objectPath(source.hash()))).to.be.true;
  });

  it('should keep the mode of an existing object file it overwrites, as write-file-atomic does', async () => {
    const source = Source.from(Buffer.from('some content'));
    await repository.writeObjectsToTheFS([source]);
    const objectPath = repository.objectPath(source.hash());
    await fs.chmod(objectPath, 0o640);
    await repository.writeObjectsToTheFS([source]);
    expect((await fs.stat(objectPath)).mode & 0o777).to.equal(0o640);
  });

  it('should reject reading a truncated tar of objects rather than hang', async () => {
    const objectList = await createObjectList(SOURCES_COUNT);
    const chunks: Buffer[] = [];
    for await (const chunk of objectList.toTar() as AsyncIterable<Buffer>) chunks.push(chunk);
    const truncated = Buffer.concat(chunks).subarray(0, 700);
    let error: Error | undefined;
    await ObjectList.fromTar(Readable.from([truncated])).catch((err) => {
      error = err;
    });
    expect(error).to.be.instanceOf(Error);
  });
});
