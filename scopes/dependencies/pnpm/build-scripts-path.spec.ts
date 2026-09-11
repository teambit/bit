import { expect } from 'chai';
import { execFileSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { delimiter, dirname, join } from 'path';
import { prepareBuildScriptsPath } from './build-scripts-path';

describe('prepareBuildScriptsPath()', () => {
  const nodeDir = dirname(process.execPath);
  let originalPath: string | undefined;
  let pathBefore: string[];
  let entries: string[];
  let addedDirs: string[];

  before(() => {
    originalPath = process.env.PATH;
    // Whatever runs the specs may already have put this Node first. Push it
    // back so the prepend is exercised, not skipped as already done. The empty
    // component stands for the working directory and has to survive as is.
    process.env.PATH = ['/nonexistent-first', '', ...(originalPath ?? '').split(delimiter)].join(delimiter);
    pathBefore = process.env.PATH.split(delimiter);
    prepareBuildScriptsPath();
    entries = (process.env.PATH ?? '').split(delimiter);
    addedDirs = entries.filter((dir) => !pathBefore.includes(dir));
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
    addedDirs.filter((dir) => dir !== nodeDir).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  });

  it("puts the running node's directory first", () => {
    expect(entries[0]).to.equal(nodeDir);
  });

  it('keeps the rest of PATH as it was, between the node dir and the node-gyp wrapper', () => {
    expect(entries.slice(1, -1)).to.deep.equal(pathBefore);
  });

  it('appends exactly one directory, holding a node-gyp that runs', function () {
    const appended = addedDirs.filter((dir) => dir !== nodeDir);
    expect(appended).to.have.lengthOf(1);
    expect(entries[entries.length - 1]).to.equal(appended[0]);
    if (process.platform === 'win32') this.skip();
    const shim = join(appended[0], 'node-gyp');
    expect(existsSync(shim)).to.equal(true);
    expect(execFileSync(shim, ['--version'], { encoding: 'utf8' }).trim()).to.match(/^v\d+\./);
  });

  it('is idempotent', () => {
    const pathAfterFirstCall = process.env.PATH;
    prepareBuildScriptsPath();
    expect(process.env.PATH).to.equal(pathAfterFirstCall);
  });
});
