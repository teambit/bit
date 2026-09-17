import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { ComponentID } from '@teambit/component-id';
import { ensureEmptyDir, resolveClonePath, resolveComponentDir } from './clone';
import { WorkspaceRootMain } from './workspace-root.main.runtime';

describe('resolveClonePath', () => {
  const rootId = ComponentID.fromString('my-org.my-scope/my-root');
  it('should default the directory to the component name, as git names a working tree', () => {
    expect(resolveClonePath(undefined, rootId)).to.equal(path.resolve('my-root'));
  });
  it('should take the directory given, relative to the cwd', () => {
    expect(resolveClonePath('some-dir', rootId)).to.equal(path.resolve('some-dir'));
  });
  it('should keep an absolute directory as given', () => {
    const absolute = path.resolve(os.tmpdir(), 'elsewhere');
    expect(resolveClonePath(absolute, rootId)).to.equal(absolute);
  });
});

describe('resolveComponentDir', () => {
  const workspacePath = path.resolve(os.tmpdir(), 'ws');
  it('should resolve a root-dir inside the workspace', () => {
    expect(resolveComponentDir(workspacePath, { id: 'a', rootDir: 'comps/a' })).to.equal(
      path.join(workspacePath, 'comps', 'a')
    );
  });
  it('should refuse a root-dir that climbs out of the workspace, the list comes from a remote', () => {
    const resolve = () => resolveComponentDir(workspacePath, { id: 'a', rootDir: '../a' });
    expect(resolve).to.throw('not a directory inside the workspace');
  });
  it('should refuse an absolute root-dir', () => {
    const resolve = () =>
      resolveComponentDir(workspacePath, { id: 'a', rootDir: path.resolve(os.tmpdir(), 'elsewhere') });
    expect(resolve).to.throw('not a directory inside the workspace');
  });
  it('should refuse an absolute root-dir that points inside the workspace too', () => {
    // it resolves to a directory of this workspace, so every check but the absolute one lets it
    // through - and it is still the path of the machine the root was snapped on
    const resolve = () =>
      resolveComponentDir(workspacePath, { id: 'a', rootDir: path.join(workspacePath, 'comps', 'a') });
    expect(resolve).to.throw('not a directory inside the workspace');
  });
  it('should refuse the workspace root itself, only the root component owns it', () => {
    const resolve = () => resolveComponentDir(workspacePath, { id: 'a', rootDir: '.' });
    expect(resolve).to.throw('not a directory inside the workspace');
  });
  it('should refuse an entry without a root-dir rather than fail on it later', () => {
    const resolve = () => resolveComponentDir(workspacePath, { id: 'a' });
    expect(resolve).to.throw('not a directory inside the workspace');
  });
  it('should accept a directory whose name starts with dots, it is not a way out', () => {
    expect(resolveComponentDir(workspacePath, { id: 'a', rootDir: '..cache' })).to.equal(
      path.join(workspacePath, '..cache')
    );
  });
});

describe('ensureEmptyDir', () => {
  const expectToReject = async (dir: string, message: string) => {
    try {
      await ensureEmptyDir(dir);
    } catch (err: any) {
      expect(err.message).to.have.string(message);
      return;
    }
    throw new Error(`expected ensureEmptyDir("${dir}") to throw "${message}"`);
  };
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-clone-'));
  });
  afterEach(async () => {
    await fs.remove(tmpDir);
  });
  it('should create a directory that does not exist and say so, a failed clone removes it', async () => {
    const dirPath = path.join(tmpDir, 'new-ws');
    expect(await ensureEmptyDir(dirPath)).to.be.true;
    expect(await fs.pathExists(dirPath)).to.be.true;
  });
  it('should accept an existing empty directory without claiming it created it', async () => {
    expect(await ensureEmptyDir(tmpDir)).to.be.false;
  });
  it('should refuse a directory that is not empty', async () => {
    await fs.outputFile(path.join(tmpDir, 'file.txt'), 'x');
    await expectToReject(tmpDir, 'the directory is not empty');
  });
  it('should refuse a file', async () => {
    const filePath = path.join(tmpDir, 'file.txt');
    await fs.outputFile(filePath, 'x');
    await expectToReject(filePath, 'it is not a directory');
  });
  it('should refuse a symbolic link to an empty directory, the workspace would be written through it', async () => {
    // and the cleanup of a failed clone would then empty whatever it points at
    const target = path.join(tmpDir, 'elsewhere');
    const link = path.join(tmpDir, 'link');
    await fs.ensureDir(target);
    await fs.symlink(target, link);
    await expectToReject(link, 'it is a symbolic link');
  });
});

describe('clone from a workspace', () => {
  it('should refuse, a clone is a new workspace and this one is already loaded', async () => {
    // the check comes before anything is fetched or written, so no workspace is needed to reach it
    const workspaceRoot = new WorkspaceRootMain({ path: '/ws' } as any);
    try {
      await workspaceRoot.clone('my-scope/ws-root', undefined, {});
    } catch (err: any) {
      expect(err.message).to.have.string('unable to clone inside the workspace at "/ws"');
      return;
    }
    throw new Error('expected clone to throw');
  });
});
