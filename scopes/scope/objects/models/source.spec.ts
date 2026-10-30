import { expect } from 'chai';
import Source from './source';

describe('Source', () => {
  it('should not keep the whole buffer it was parsed from when the file is small', () => {
    // a slice of a big buffer, like zlib returns for small results. built by hand since node 26, where zlib's small
    // results come from the shared Buffer pool (as does the copy), so they can't show whether the copy happened.
    const big = Buffer.alloc(16 * 1024);
    big.write('const a = 1;');
    const parsed = Source.parse(big.subarray(0, 12));
    expect(parsed.contents.toString()).to.equal('const a = 1;');
    expect(parsed.contents.buffer).to.not.equal(big.buffer);
  });
});
