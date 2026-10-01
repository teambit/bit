import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { ComponentID } from '@teambit/component-id';
import { WORKSPACE_ROOT_DIR } from '@teambit/legacy.bit-map';
import {
  ensureEmptyDir,
  resolveClonePath,
  resolveComponentDir,
  resolveThroughExistingAncestors,
  resolveWriteToPathPerId,
  throwForOverlappingDirs,
  topmostAbsentDir,
} from './clone';
import type { CloneResult } from './clone';
import { formatCloneResult } from './clone.cmd';
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
  it('should refuse a root-dir that is not a string, the map came from a remote', () => {
    // the parser asserts the entry's shape, not its values, so this reaches here as it was written
    const resolve = () => resolveComponentDir(workspacePath, { id: 'a', rootDir: 42 as unknown as string });
    expect(resolve).to.throw('not a directory inside the workspace');
  });
  it('should refuse an entry without a root-dir rather than fail on it later', () => {
    const resolve = () => resolveComponentDir(workspacePath, { id: 'a' });
    expect(resolve).to.throw('not a directory inside the workspace');
  });
  it('should refuse a directory bit or git keeps for itself, the map came from a remote', () => {
    // .bit holds the objects this very clone is being read from
    ['.bit/evil', '.git/hooks', 'node_modules/evil', '.bitTmp/x'].forEach((rootDir) => {
      const resolve = () => resolveComponentDir(workspacePath, { id: 'a', rootDir });
      expect(resolve, rootDir).to.throw('not a directory inside the workspace');
    });
  });
  it('should refuse one of them at any depth, not only at the workspace root', () => {
    const resolve = () => resolveComponentDir(workspacePath, { id: 'a', rootDir: 'packages/node_modules/a' });
    expect(resolve).to.throw('not a directory inside the workspace');
  });
  it('should refuse one of them spelled in another case, a filesystem may read it as the same dir', () => {
    ['.BIT/objects', '.Git/hooks', 'NODE_MODULES/evil', '.bittmp/x'].forEach((rootDir) => {
      const resolve = () => resolveComponentDir(workspacePath, { id: 'a', rootDir });
      expect(resolve, rootDir).to.throw('not a directory inside the workspace');
    });
  });
  it('should accept a directory whose name starts with dots, it is not a way out', () => {
    expect(resolveComponentDir(workspacePath, { id: 'a', rootDir: '..cache' })).to.equal(
      path.join(workspacePath, '..cache')
    );
  });
});

describe('resolveThroughExistingAncestors', () => {
  let base: string;
  beforeEach(async () => {
    // realpath'd, so that the assertions below compare against what the resolve returns - on macOS
    // the temp directory is itself reached through a link
    base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bit-clone-anc-')));
  });
  afterEach(async () => {
    await fs.remove(base);
  });

  it('should resolve a symbolic link above an absent destination, the writes go through it', async () => {
    const real = path.join(base, 'real');
    await fs.ensureDir(real);
    await fs.symlink(real, path.join(base, 'link'));
    expect(await resolveThroughExistingAncestors(path.join(base, 'link', 'ws'))).to.equal(path.join(real, 'ws'));
  });

  it('should resolve it through several levels that do not exist yet', async () => {
    const real = path.join(base, 'real');
    await fs.ensureDir(real);
    await fs.symlink(real, path.join(base, 'link'));
    expect(await resolveThroughExistingAncestors(path.join(base, 'link', 'a', 'b'))).to.equal(
      path.join(real, 'a', 'b')
    );
  });

  it('should leave a destination with no link above it as it is, the ordinary case', async () => {
    expect(await resolveThroughExistingAncestors(path.join(base, 'ws'))).to.equal(path.join(base, 'ws'));
  });

  it('should not resolve a link at the destination itself, which is refused rather than followed', async () => {
    // ensureEmptyDir is what refuses it, and it only can while the last segment is left alone
    const real = path.join(base, 'real');
    await fs.ensureDir(real);
    const link = path.join(base, 'link');
    await fs.symlink(real, link);
    expect(await resolveThroughExistingAncestors(link)).to.equal(link);
  });
});

describe('topmostAbsentDir', () => {
  let base: string;
  beforeEach(async () => {
    base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bit-clone-top-')));
  });
  afterEach(async () => {
    await fs.remove(base);
  });

  it('should be undefined for a destination that is already there, nothing was made for it', async () => {
    expect(await topmostAbsentDir(base)).to.equal(undefined);
  });

  it('should be the destination itself when only it is missing', async () => {
    expect(await topmostAbsentDir(path.join(base, 'ws'))).to.equal(path.join(base, 'ws'));
  });

  it('should be the highest level made on the way to it, so removing that one takes the rest', async () => {
    // "clone into new-parent/ws": removing only "ws" would leave "new-parent" standing empty
    expect(await topmostAbsentDir(path.join(base, 'new-parent', 'ws'))).to.equal(path.join(base, 'new-parent'));
  });

  it('should reach up through several missing levels', async () => {
    expect(await topmostAbsentDir(path.join(base, 'a', 'b', 'c'))).to.equal(path.join(base, 'a'));
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

describe('formatCloneResult', () => {
  const resultWith = (missing: string[]): CloneResult => ({
    rootId: ComponentID.fromString('my-org.my-scope/my-root'),
    workspacePath: '/tmp/my-root',
    components: [ComponentID.fromString('my-org.my-scope/comp1')],
    missing,
  });

  it('should name the components the root lists that their remote does not have', () => {
    // the clone succeeded without them, so the summary still reports it - the missing ones are their
    // own section, and a user who reads only the summary would not know the workspace is short
    const output = formatCloneResult(resultWith(['my-org.my-scope/comp2']), 'my-root');
    expect(output).to.have.string('my-org.my-scope/comp2');
    expect(output).to.have.string('not on their remote');
    expect(output).to.have.string('cloned my-org.my-scope/my-root');
  });

  it('should leave the section out when the root got everything it lists', () => {
    const output = formatCloneResult(resultWith([]), 'my-root');
    expect(output).to.not.have.string('not on their remote');
  });
});

describe('throwForOverlappingDirs', () => {
  const ws = path.resolve(os.tmpdir(), 'ws');
  it('should accept members in directories of their own, the ordinary case', () => {
    const dirs = { a: path.join(ws, 'comps/a'), b: path.join(ws, 'comps/b') };
    expect(() => throwForOverlappingDirs(dirs)).to.not.throw();
  });
  it('should refuse two members sharing a directory, the later one would land on the earlier', () => {
    const dirs = { a: path.join(ws, 'comps/a'), b: path.join(ws, 'comps/a') };
    expect(() => throwForOverlappingDirs(dirs)).to.throw('overlaps the directory');
  });
  it('should refuse a member inside another member, whatever the depth', () => {
    const dirs = { a: path.join(ws, 'comps/a'), b: path.join(ws, 'comps/a/src/b') };
    expect(() => throwForOverlappingDirs(dirs)).to.throw('overlaps the directory');
  });
  it('should not read a shared prefix as containment', () => {
    const dirs = { a: path.join(ws, 'comps/a'), b: path.join(ws, 'comps/a-b') };
    expect(() => throwForOverlappingDirs(dirs)).to.not.throw();
  });
  it('should refuse two directories a case-insensitive filesystem reads as one', () => {
    const dirs = { a: path.join(ws, 'Packages/Foo'), b: path.join(ws, 'packages/foo') };
    expect(() => throwForOverlappingDirs(dirs)).to.throw('overlaps the directory');
  });
  it('should refuse containment that differs only by case at a level above', () => {
    const dirs = { a: path.join(ws, 'Comps/A'), b: path.join(ws, 'comps/a/src/b') };
    expect(() => throwForOverlappingDirs(dirs)).to.throw('overlaps the directory');
  });
});

describe('resolveWriteToPathPerId', () => {
  const ws = path.resolve(os.tmpdir(), 'ws');
  const rootId = ComponentID.fromString('my-org.my-scope/my-root');
  it('should place every member the root lists at the directory it recorded', () => {
    const entries = [
      { id: 'scope/a', rootDir: 'comps/a' },
      { id: 'scope/b', rootDir: 'comps/b' },
    ];
    expect(resolveWriteToPathPerId(ws, entries, rootId)).to.deep.equal({
      'scope/a': path.join(ws, 'comps/a'),
      'scope/b': path.join(ws, 'comps/b'),
    });
  });
  it('should leave out the root itself, it is written before the members', () => {
    const entries = [
      { id: 'my-org.my-scope/my-root', rootDir: WORKSPACE_ROOT_DIR },
      { id: 'scope/a', rootDir: 'comps/a' },
    ];
    expect(Object.keys(resolveWriteToPathPerId(ws, entries, rootId))).to.deep.equal(['scope/a']);
  });
  it('should leave out a root listed by another scope, an unexported root names its default one', () => {
    const entries = [{ id: 'some-other-scope/my-root', rootDir: WORKSPACE_ROOT_DIR }];
    expect(resolveWriteToPathPerId(ws, entries, rootId)).to.deep.equal({});
  });
  it('should refuse a member the map puts at the workspace root, only the root occupies it', () => {
    const entries = [
      { id: 'my-org.my-scope/my-root', rootDir: WORKSPACE_ROOT_DIR },
      { id: 'scope/a', rootDir: WORKSPACE_ROOT_DIR },
    ];
    expect(() => resolveWriteToPathPerId(ws, entries, rootId)).to.throw('at the workspace root');
  });
  it('should refuse a second entry at the workspace root even when it names the root again', () => {
    const entries = [
      { id: 'my-org.my-scope/my-root', rootDir: WORKSPACE_ROOT_DIR },
      { id: 'my-org.my-scope/my-root', rootDir: WORKSPACE_ROOT_DIR },
    ];
    expect(() => resolveWriteToPathPerId(ws, entries, rootId)).to.throw('at the workspace root');
  });
  it('should keep an id reading __proto__ rather than let it set the prototype and vanish', () => {
    // a remote map names it, so the id is not bit's to trust. assigned onto an object literal it
    // would leave no own property and the member would be dropped from the import, unreported
    const result = resolveWriteToPathPerId(ws, [{ id: '__proto__', rootDir: 'comps/a' }], rootId);
    expect(Object.keys(result)).to.deep.equal(['__proto__']);
    expect(Object.getPrototypeOf(result)).to.equal(Object.prototype);
  });
  it('should refuse two entries resolving to one id, the later would overwrite the earlier', () => {
    const entries = [
      { id: 'scope/a', rootDir: 'comps/a' },
      { id: 'scope/a', rootDir: 'comps/a-again' },
    ];
    expect(() => resolveWriteToPathPerId(ws, entries, rootId)).to.throw('more than once');
  });
});
