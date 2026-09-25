import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { MissingHandler } from './missing-handler';

describe('MissingHandler', () => {
  let workspaceDir: string;
  let componentDir: string;
  beforeEach(async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'missing-handler-'));
    componentDir = path.join(workspaceDir, 'packages/app');
    await fs.outputFile(path.join(componentDir, 'index.js'), "require('@acme/math');");
  });
  afterEach(async () => {
    await fs.remove(workspaceDir);
  });
  const findPackages = () =>
    new MissingHandler(
      { [path.join(componentDir, 'index.js')]: ['@acme/math'] },
      componentDir,
      workspaceDir
    ).groupAndFindMissing().foundPackages.packages;

  it('should take the version of a found package from its package.json', async () => {
    await fs.outputJson(path.join(componentDir, 'node_modules/@acme/math/package.json'), {
      name: '@acme/math',
      version: '1.0.0',
    });
    expect(findPackages()).to.deep.equal({ '@acme/math': '1.0.0' });
  });
  it('should take any version of a found package that has none, e.g. a private package of a pnpm workspace', async () => {
    await fs.outputJson(path.join(componentDir, 'node_modules/@acme/math/package.json'), { name: '@acme/math' });
    expect(findPackages()).to.deep.equal({ '@acme/math': '*' });
  });
});
