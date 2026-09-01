import os from 'os';
import { join, sep } from 'path';
import fs from 'fs-extra';
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

  // a symlink inside publicDir must not be allowed to redirect the served file outside it. these
  // use a real temp tree because symlink resolution needs files on disk.
  describe('symlink handling', () => {
    let root: string;
    let realPublicDir: string;

    beforeEach(async () => {
      root = await fs.mkdtemp(join(os.tmpdir(), 'preview-symlink-'));
      realPublicDir = join(root, 'public');
      await fs.ensureDir(join(realPublicDir, 'assets'));
      await fs.writeFile(join(realPublicDir, 'assets', 'main.js'), 'ok');
      await fs.writeFile(join(root, 'secret.txt'), 'SECRET'); // sibling of public, outside it
    });

    afterEach(async () => {
      await fs.remove(root);
    });

    it('allows a real nested file', () => {
      expect(resolvePreviewFilePath(realPublicDir, 'assets/main.js')).to.equal(
        join(realPublicDir, 'assets', 'main.js')
      );
    });

    it('rejects a symlink inside publicDir that points outside', async () => {
      await fs.symlink(join(root, 'secret.txt'), join(realPublicDir, 'evil')); // public/evil -> ../secret.txt
      expect(resolvePreviewFilePath(realPublicDir, 'evil')).to.equal(undefined);
    });

    it('allows a symlink inside publicDir that points to another file inside it', async () => {
      await fs.symlink(join(realPublicDir, 'assets', 'main.js'), join(realPublicDir, 'link.js'));
      expect(resolvePreviewFilePath(realPublicDir, 'link.js')).to.equal(join(realPublicDir, 'link.js'));
    });
  });
});
