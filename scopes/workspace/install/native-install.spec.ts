import { expect } from 'chai';
import { parse } from 'comment-json';
import { hasPendingChanges, nativeOptions } from './native-install';

describe('native install options', () => {
  it('passes the copy-peers options, defaulting the components one to false', () => {
    expect(nativeOptions(undefined, {})).to.include({ copyPeerToRuntimeOnComponents: false });
    expect(nativeOptions(undefined, {}).copyPeerToRuntimeOnRoot).to.be.undefined;
    const options = nativeOptions(undefined, { copyPeerToRuntimeOnRoot: false, copyPeerToRuntimeOnComponents: true });
    expect(options).to.include({ copyPeerToRuntimeOnRoot: false, copyPeerToRuntimeOnComponents: true });
  });
  it('passes an explicit dependencies graph serialized', () => {
    const serialized = { schemaVersion: '2.0', packages: {}, edges: [] };
    const graph = { serialize: () => JSON.stringify(serialized) } as any;
    expect(nativeOptions(undefined, { dependenciesGraph: graph }).dependenciesGraph).to.deep.equal(serialized);
    expect(nativeOptions(undefined, {}).dependenciesGraph).to.be.undefined;
  });
  it('keeps addMissingPeers and the lifecycle as given', () => {
    expect(nativeOptions(undefined, { addMissingPeers: true })).to.include({ addMissingPeers: true });
    expect(nativeOptions(undefined, { addMissingPeers: true }).lifecycleType).to.be.undefined;
  });
});

describe('pending workspace config changes', () => {
  const text = `{
  // a comment
  "teambit.workspace/workspace": { "name": "ws" },
}`;
  it('ignores comments and formatting', () => {
    expect(hasPendingChanges(parse(text), { 'teambit.workspace/workspace': { name: 'ws' } })).to.be.false;
  });
  it('reports changed content', () => {
    const inMemory = parse(text) as any;
    inMemory['teambit.generator/generator'] = { envs: ['org.envs/react'] };
    expect(hasPendingChanges(parse(text), inMemory)).to.be.true;
  });
});
