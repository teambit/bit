import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ObjectItem } from '@teambit/objects';
import { ModelComponent, Ref, Source, Version } from '@teambit/objects';
import Scope from '../scope';
import { ObjectsWritable } from './objects-writable-stream';
import { WriteObjectsQueue } from './write-objects-queue';
import type { ComponentsPerRemote } from '../component-ops/multiple-component-merger';

const hash = (name: string) => Buffer.from(name.padEnd(20, '-')).toString('hex');

describe('ObjectsWritable', () => {
  let scope: Scope;
  let scopePath: string;
  let componentsPerRemote: ComponentsPerRemote;
  const source = Source.from(Buffer.from('export const a = 1;\n'));
  const version = new Version({
    mainFile: 'index.ts',
    files: [{ file: source.hash(), relativePath: 'index.ts', name: 'index.ts', test: false }],
    log: { message: '', date: '0', username: 'u', email: 'e' },
    hash: hash('v1'),
    parents: [],
  } as any);
  const component = ModelComponent.from({ name: 'comp', scope: 'writable-spec' } as any);
  const mismatchedRef = Ref.from(hash('not-the-content'));

  const write = async (items: ObjectItem[]) => {
    const queue = new WriteObjectsQueue();
    const writable = new ObjectsWritable(scope.objects, 'writable-spec', queue, componentsPerRemote);
    await pipeline(Readable.from(items), writable);
    await queue.onIdle();
  };

  before(async () => {
    scopePath = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-writable-spec-'));
    scope = await Scope.ensure(scopePath, 'writable-spec');
    componentsPerRemote = {};
    const item = async (obj: Source | Version | ModelComponent, ref = obj.hash()): Promise<ObjectItem> => ({
      ref,
      buffer: await obj.compress(),
      type: obj.getType(),
    });
    await write([await item(source), await item(version), await item(component), await item(source, mismatchedRef)]);
    scope.objects.clearCache();
  });
  after(async () => {
    await fs.remove(scopePath);
  });

  it('should store a Source so that it is loaded back with the same content and hash', async () => {
    const loaded = (await scope.objects.load(source.hash(), true)) as Source;
    expect(loaded.contents.toString()).to.equal(source.contents.toString());
    expect(loaded.hash().toString()).to.equal(source.hash().toString());
  });
  it('should store a Version so that it is loaded back with the same hash and files', async () => {
    const loaded = (await scope.objects.load(version.hash(), true)) as Version;
    expect(loaded.hash().toString()).to.equal(hash('v1'));
    expect(loaded.files.map((file) => file.file.toString())).to.deep.equal([source.hash().toString()]);
  });
  it('should collect a ModelComponent for the merge instead of writing it', async () => {
    expect(componentsPerRemote['writable-spec'].map((comp) => comp.name)).to.deep.equal(['comp']);
  });
  it('should store a Source whose ref does not match its content under the hash of the content', async () => {
    const underWrongRef = await scope.objects.load(mismatchedRef, false);
    expect(underWrongRef).to.not.exist;
    const loaded = (await scope.objects.load(source.hash(), true)) as Source;
    expect(loaded.contents.toString()).to.equal(source.contents.toString());
  });
});
