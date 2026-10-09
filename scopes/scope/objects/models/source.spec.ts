import { expect } from 'chai';
import { deflateSync } from 'zlib';
import { BitObject } from '../objects';
import Source from './source';

describe('Source', () => {
  it('should not keep the whole inflated buffer when the file is small', async () => {
    const file = Source.from(Buffer.from('const a = 1;'));
    const parsed = (await BitObject.parseObject(deflateSync(file.serialize()))) as Source;
    expect(parsed.contents.toString()).to.equal('const a = 1;');
    expect(parsed.hash().toString()).to.equal(file.hash().toString());
    expect(parsed.contents.buffer.byteLength).to.be.below(16 * 1024);
  });
});
