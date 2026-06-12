import { join, sep } from 'path';
import { expect } from 'chai';
import { resolvePreviewFilePath } from './resolve-preview-file-path';

describe('resolvePreviewFilePath', () => {
  // serve-preview builds the path from an untrusted URL segment; it must never escape publicDir.
  const publicDir = join(sep, 'tmp', 'env-preview', 'public');

  it('returns the joined path for a normal file', () => {
    expect(resolvePreviewFilePath(publicDir, 'index.html')).to.equal(join(publicDir, 'index.html'));
  });

  it('returns the joined path for a nested file', () => {
    expect(resolvePreviewFilePath(publicDir, 'assets/main.js')).to.equal(join(publicDir, 'assets', 'main.js'));
  });

  it('returns undefined for a parent-traversal path', () => {
    expect(resolvePreviewFilePath(publicDir, '../../../etc/passwd')).to.equal(undefined);
  });

  it('returns undefined for an embedded parent-traversal path', () => {
    expect(resolvePreviewFilePath(publicDir, 'assets/../../../../etc/passwd')).to.equal(undefined);
  });

  it('returns undefined for a percent-decoded-style traversal already containing ".."', () => {
    expect(resolvePreviewFilePath(publicDir, '..' + sep + '..' + sep + 'secret')).to.equal(undefined);
  });

  it('does not treat a sibling dir with the same prefix as inside publicDir', () => {
    // ".../public-evil" must not be considered within ".../public"
    expect(resolvePreviewFilePath(publicDir, join('..', 'public-evil', 'x'))).to.equal(undefined);
  });

  it('allows a file that resolves back to publicDir itself', () => {
    expect(resolvePreviewFilePath(publicDir, '.')).to.equal(publicDir);
  });
});
