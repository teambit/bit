import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import * as path from 'path';
import { removeFilesAndEmptyDirsRecursively } from './remove-files-and-empty-dirs-recursively';

describe('removeFilesAndEmptyDirsRecursively', function () {
  // the first call is slow on CI (cold fs/logger init), exceeding mocha's default 2s
  this.timeout(10000);
  let workspacePath: string;
  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-remove-empty-dirs-'));
    await fs.outputFile(path.join(workspacePath, 'ui/buttons/button/index.ts'), '');
  });
  afterEach(async () => {
    await fs.remove(workspacePath);
  });
  const componentDir = () => path.join(workspacePath, 'ui/buttons/button');

  it('should remove only the immediate empty parent dir when no stop dir is given', async () => {
    await removeFilesAndEmptyDirsRecursively([componentDir()]);
    expect(await fs.pathExists(path.join(workspacePath, 'ui/buttons'))).to.be.false;
    expect(await fs.pathExists(path.join(workspacePath, 'ui'))).to.be.true;
  });
  it('should remove all the empty parent dirs up to the stop dir, and keep the stop dir', async () => {
    await removeFilesAndEmptyDirsRecursively([componentDir()], workspacePath);
    expect(await fs.pathExists(path.join(workspacePath, 'ui'))).to.be.false;
    expect(await fs.pathExists(workspacePath)).to.be.true;
  });
  it('should stop at the first parent dir that is not empty', async () => {
    await fs.outputFile(path.join(workspacePath, 'ui/other.ts'), '');
    await removeFilesAndEmptyDirsRecursively([componentDir()], workspacePath);
    expect(await fs.pathExists(path.join(workspacePath, 'ui/buttons'))).to.be.false;
    expect(await fs.pathExists(path.join(workspacePath, 'ui/other.ts'))).to.be.true;
  });
  it('should remove the shared empty parent dirs when removing sibling dirs', async () => {
    const siblingDir = path.join(workspacePath, 'ui/buttons/icon-button');
    await fs.outputFile(path.join(siblingDir, 'index.ts'), '');
    await removeFilesAndEmptyDirsRecursively([componentDir(), siblingDir], workspacePath);
    expect(await fs.pathExists(path.join(workspacePath, 'ui'))).to.be.false;
  });
  it('should treat a dir whose name starts with two dots as inside the stop dir', async () => {
    const componentInTwoDotsDir = path.join(workspacePath, '..cache/ui/button');
    await fs.outputFile(path.join(componentInTwoDotsDir, 'index.ts'), '');
    await removeFilesAndEmptyDirsRecursively([componentInTwoDotsDir], workspacePath);
    expect(await fs.pathExists(path.join(workspacePath, '..cache'))).to.be.false;
    expect(await fs.pathExists(workspacePath)).to.be.true;
  });
});
