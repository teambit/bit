import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { ScopeJson } from '@teambit/legacy.scope';
import { ModelComponent, Source } from '../models';
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
