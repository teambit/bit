import { expect } from 'chai';

import searchFilesIgnoreExt from './search-files-ignore-ext';

describe('searchFilesIgnoreExt', () => {
  const getResults = (files) => searchFilesIgnoreExt(files, 'foo/bar.ts', 'relative');
  it('should find the same file with a different extension', () => {
    const files = [{ relative: 'foo/baz.js' }, { relative: 'foo/bar.js' }];
    const result = getResults(files);
    expect(result).to.equal('foo/bar.js');
  });
  it('should not return map.js files', () => {
    const files = [{ relative: 'foo/bar.map.js' }];
    const result = getResults(files);
    expect(result).to.be.null;
  });
  it('should accept .d.ts files', () => {
    const files = [{ relative: 'foo/bar.d.ts' }];
    const result = getResults(files);
    expect(result).to.equal('foo/bar.d.ts');
  });
  it('should prioritize .js over .d.ts files', () => {
    const files = [{ relative: 'foo/bar.d.ts' }, { relative: 'foo/bar.js' }];
    const result = getResults(files);
    expect(result).to.equal('foo/bar.js');
  });
  it('should prioritize .js over any other extension', () => {
    const files = [{ relative: 'foo/bar.gif' }, { relative: 'foo/bar.js' }];
    const result = getResults(files);
    expect(result).to.equal('foo/bar.js');
  });
  it('should prioritize any other extension over .d.ts files', () => {
    const files = [{ relative: 'foo/bar.d.ts' }, { relative: 'foo/bar.css' }];
    const result = getResults(files);
    expect(result).to.equal('foo/bar.css');
  });
});
