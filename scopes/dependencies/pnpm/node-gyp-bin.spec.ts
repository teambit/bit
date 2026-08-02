import { expect } from 'chai';
import { execFileSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { delimiter, join } from 'path';
import { addNodeGypToPath } from './node-gyp-bin';

describe('addNodeGypToPath()', () => {
  let originalPath: string | undefined;
  let addedDirs: string[];

  before(() => {
    originalPath = process.env.PATH;
    addNodeGypToPath();
    const before = (originalPath ?? '').split(delimiter);
    addedDirs = (process.env.PATH ?? '').split(delimiter).filter((dir) => !before.includes(dir));
  });

  after(() => {
    // Assigning `undefined` would leave the literal string "undefined" for
    // every spec that runs after this one in the same process.
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    // The wrapper lands in the real Bit cache — writing it there is the
    // behavior under test, so it cannot be redirected without stubbing out the
    // thing being asserted. Take it back out; an install that wants it writes
    // it again, and a script already running one keeps the inode it opened.
    addedDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  });

  it('appends exactly one directory to PATH', () => {
    expect(addedDirs).to.have.lengthOf(1);
    expect(process.env.PATH?.startsWith(originalPath ?? '')).to.equal(true);
  });

  it('the appended directory holds a node-gyp that runs', function () {
    if (process.platform === 'win32') this.skip();
    const shim = join(addedDirs[0], 'node-gyp');
    expect(existsSync(shim)).to.equal(true);
    expect(execFileSync(shim, ['--version'], { encoding: 'utf8' }).trim()).to.match(/^v\d+\./);
  });

  it('is idempotent', () => {
    const pathAfterFirstCall = process.env.PATH;
    addNodeGypToPath();
    expect(process.env.PATH).to.equal(pathAfterFirstCall);
  });
});
