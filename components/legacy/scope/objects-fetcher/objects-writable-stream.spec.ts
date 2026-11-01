import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ObjectItem } from '@teambit/objects';
import { Lane, ModelComponent, Ref, Source, Version } from '@teambit/objects';
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
  it('should store many objects streamed at once, each loadable afterwards', async () => {
    const sources = Array.from({ length: 300 }, (_, i) => Source.from(Buffer.from(`export const n = ${i};\n`)));
    const items = await Promise.all(
      sources.map(async (src) => ({ ref: src.hash(), buffer: await src.compress(), type: src.getType() }))
    );
    await write(items);
    scope.objects.clearCache();
    const loaded = await Promise.all(sources.map((src) => scope.objects.load(src.hash(), true) as Promise<Source>));
    expect(loaded.map((src) => src.contents.toString())).to.deep.equal(sources.map((src) => src.contents.toString()));
  });
  it('should fail the stream when an object cannot be written, without waiting for the remote stream', async () => {
    const lane = new Lane({ name: 'dev', scope: 'writable-spec', hash: 'f'.repeat(40), log: { date: '0' } } as any);
    // the remote stream stays open: it does not send another object and does not end.
    const fromRemote = new Readable({ objectMode: true, read() {} });
    fromRemote.push({ ref: lane.hash(), buffer: await lane.compress(), type: lane.getType() });
    const writable = new ObjectsWritable(scope.objects, 'writable-spec', new WriteObjectsQueue(), componentsPerRemote);
    const error = await pipeline(fromRemote, writable).catch((err) => err);
    expect(error.message).to.include('does not support lanes');
  });
  it('should finish the writes in flight before the stream fails', async () => {
    const sources = Array.from({ length: 300 }, (_, i) => Source.from(Buffer.from(`export const failing = ${i};\n`)));
    const items = await Promise.all(
      sources.map(async (src) => ({ ref: src.hash(), buffer: await src.compress(), type: src.getType() }))
    );
    async function* fromRemote() {
      yield* items;
      throw new Error('the remote stream failed');
    }
    const storedRefs = async () => (await scope.objects.listRefs()).map((ref) => ref.toString()).sort();
    const writable = new ObjectsWritable(scope.objects, 'writable-spec', new WriteObjectsQueue(), componentsPerRemote);
    const error = await pipeline(Readable.from(fromRemote()), writable).catch((err) => err);
    const refsWhenFailed = await storedRefs();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(error.message).to.equal('the remote stream failed');
    expect(await storedRefs()).to.deep.equal(refsWhenFailed);
  });
  it('should store a Source whose ref does not match its content under the hash of the content', async () => {
    const underWrongRef = await scope.objects.load(mismatchedRef, false);
    expect(underWrongRef).to.not.exist;
    const loaded = (await scope.objects.load(source.hash(), true)) as Source;
    expect(loaded.contents.toString()).to.equal(source.contents.toString());
  });
});
