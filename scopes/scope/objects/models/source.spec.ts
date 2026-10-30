import { expect } from 'chai';
import { deflateSync } from 'zlib';
import { BitObject } from '../objects';
import Source from './source';

describe('Source', () => {
  it('should not hold on to the buffer it was parsed from when the file is small', () => {
    // zlib hands back small results as a slice of its (much bigger) inflate buffer. `Source.parse`
    // must copy those bytes out, otherwise every small file loaded from the scope pins the whole
    // buffer for as long as the Source is alive.
    // the assertion is on the identity of the underlying ArrayBuffer rather than on its size: a
    // copy this small comes from node's shared buffer pool, whose size differs between node
    // versions (8KB up to node 24, 64KB on node 26), so a size check says nothing about pinning.
    const inflateBuffer = Buffer.alloc(16 * 1024);
    const contents = inflateBuffer.subarray(0, 12);
    const parsed = Source.parse(contents);
    expect(parsed.contents.buffer).to.not.equal(inflateBuffer.buffer);
  });

  it('should keep the contents intact through a serialize/parse round trip', async () => {
    const file = Source.from(Buffer.from('const a = 1;'));
    const parsed = (await BitObject.parseObject(deflateSync(file.serialize()))) as Source;
    expect(parsed.contents.toString()).to.equal('const a = 1;');
  });
});
