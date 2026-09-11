import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { getFilesByDir, getGitIgnoreHarmony, getIgnoreListHarmony } from './component-map';

describe('trackAllFiles', function () {
  this.timeout(0);
  let workspacePath: string;
  before(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-track-all-files-'));
    await fs.outputFile(path.join(workspacePath, '.gitignore'), 'dist/\n');
    const componentDir = path.join(workspacePath, 'comp');
    const files = [
      'index.ts',
      'package.json',
      'tsconfig.json',
      'package-lock.json',
      'dist/index.js',
      'node_modules/dep/index.js',
    ];
    await Promise.all(files.map((file) => fs.outputFile(path.join(componentDir, file), '')));
  });
  after(() => fs.remove(workspacePath));

  const filesOf = async (trackAllFiles: boolean): Promise<string[]> => {
    const gitIgnore = await getGitIgnoreHarmony(workspacePath, undefined, trackAllFiles);
    const files = await getFilesByDir('comp', workspacePath, gitIgnore, [], trackAllFiles);
    return files.map((file) => file.relativePath).sort();
  };

  it('should skip the files bit generates, and the lockfiles, by default', async () => {
    expect(await filesOf(false)).to.deep.equal(['index.ts']);
  });
  it('should track them with the flag on, while still honoring .gitignore and skipping node_modules', async () => {
    expect(await filesOf(true)).to.deep.equal(['index.ts', 'package-lock.json', 'package.json', 'tsconfig.json']);
  });
  it('should keep the user ignore patterns and the hard exclusions with the flag on', async () => {
    const ignoreList = await getIgnoreListHarmony(workspacePath, ['*.bak'], true);
    expect(ignoreList).to.include('*.bak');
    expect(ignoreList).to.include('**/node_modules/**');
    expect(ignoreList).to.not.include('package.json');
  });
});
