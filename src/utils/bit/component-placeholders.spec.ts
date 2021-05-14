import { expect } from 'chai';

import { replacePlaceHolderForPackageValue } from './component-placeholders';

describe('replacePlaceHolderForPackageValue', () => {
  it('should be able to replace the main file without an extension', () => {
    // @ts-ignore
    const result = replacePlaceHolderForPackageValue({ mainFile: 'index.ts' }, 'dist/{main}.js');
    expect(result).to.equal('dist/index.js');
  });
  it('should be able to replace the component name', () => {
    // @ts-ignore
    const result = replacePlaceHolderForPackageValue({ name: 'foo' }, 'bar/baz/{name}');
    expect(result).to.equal('bar/baz/foo');
  });
  it('should be able to replace the component scope', () => {
    // @ts-ignore
    const result = replacePlaceHolderForPackageValue({ scope: 'foo' }, 'bar/baz/{scope}');
    expect(result).to.equal('bar/baz/foo');
  });
  it('should return the same value if it is not string', () => {
    // @ts-ignore
    const result = replacePlaceHolderForPackageValue({ name: 'foo' }, false);
    expect(result).to.equal(false);
  });
});
