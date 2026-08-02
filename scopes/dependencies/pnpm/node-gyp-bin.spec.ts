import { expect } from 'chai';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
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
    process.env.PATH = originalPath;
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
