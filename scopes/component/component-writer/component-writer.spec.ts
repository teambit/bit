import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { WORKSPACE_ROOT_DIR } from '@teambit/legacy.bit-map';
import { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy.extension-data';
import { WorkspaceRootAspect } from '@teambit/workspace-root';
import ComponentWriter, { isOwnedByNestedComponent } from './component-writer';
import { ComponentWriterMain } from './component-writer.main.runtime';

describe('isOwnedByNestedComponent', () => {
  const nested = ['packages/comp1', 'packages/comp2'];
  it('should claim a file inside a nested component', () => {
    expect(isOwnedByNestedComponent('packages/comp1/index.js', nested)).to.be.true;
  });
  it('should claim a file deeper inside a nested component', () => {
    expect(isOwnedByNestedComponent('packages/comp1/src/util.js', nested)).to.be.true;
  });
  it('should leave a file the root owns', () => {
    expect(isOwnedByNestedComponent('packages/readme.md', nested)).to.be.false;
    expect(isOwnedByNestedComponent('workspace.jsonc', nested)).to.be.false;
  });
  it('should not claim a directory that merely shares a prefix with a nested one', () => {
    expect(isOwnedByNestedComponent('packages/comp10/index.js', nested)).to.be.false;
  });
  it('should not claim the nested root-dir itself, only what is under it', () => {
    expect(isOwnedByNestedComponent('packages/comp1', nested)).to.be.false;
  });
  it('should claim nothing when no component is nested, the ordinary case', () => {
    expect(isOwnedByNestedComponent('packages/comp1/index.js', [])).to.be.false;
  });
});

describe('populateFilesToWriteToComponentDir', () => {
  /**
   * the method only reads these fields off the writer. building it through the constructor would
   * need a consumer and a scope, which say nothing about the file-set it produces.
   */
  function writerFor(files: string[], nestedRootDirs: string[], writeToPath = '.') {
    const written: string[] = [];
    const writer = Object.create(ComponentWriter.prototype);
    Object.assign(writer, {
      writeToPath,
      override: true,
      writeConfig: false,
      deleteBitDirContent: false,
      bitMap: { getNestedRootDirs: () => nestedRootDirs },
      component: {
        files: files.map((relative) => ({ relative })),
        dataToPersist: { addFile: (file: any) => written.push(file.relative) },
        license: undefined,
      },
    });
    return { writer, written };
  }

  it('should not write over the source of a component nested in the root, an old version still carries it', async () => {
    // the root was snapped before comp1 was extracted out of it, so that version holds comp1's files
    const { writer, written } = writerFor(
      ['workspace.jsonc', 'packages/comp1/index.js', 'readme.md'],
      ['packages/comp1']
    );
    await writer.populateFilesToWriteToComponentDir();
    expect(written).to.deep.equal(['workspace.jsonc', 'readme.md']);
  });

  it('should write every file when nothing is nested', async () => {
    const { writer, written } = writerFor(['workspace.jsonc', 'packages/comp1/index.js'], []);
    await writer.populateFilesToWriteToComponentDir();
    expect(written).to.deep.equal(['workspace.jsonc', 'packages/comp1/index.js']);
  });

  it('should keep skipping the live .bitmap, which is never written from a versioned copy', async () => {
    const { writer, written } = writerFor(['.bitmap', 'workspace.jsonc'], []);
    await writer.populateFilesToWriteToComponentDir();
    expect(written).to.deep.equal(['workspace.jsonc']);
  });

  it('should skip it for an ordinary component too, no component but the root ever tracks one', async () => {
    // the scan drops a `.bitmap` at any other component's root (see getScanIgnorePatterns), so what a
    // component versions is what a write lands
    const { writer, written } = writerFor(['.bitmap', 'index.js'], [], 'comp1');
    await writer.populateFilesToWriteToComponentDir();
    expect(written).to.deep.equal(['index.js']);
  });
});

describe('the workspace-root import preflight checks', () => {
  /**
   * the checks read the incoming files, the nested root-dirs and the paths on disk. going through
   * writeMany would need a workspace and a scope, which say nothing about which paths they look at.
   */
  function runtimeFor(nestedRootDirs: string[], workspacePath: string) {
    const main = Object.create(ComponentWriterMain.prototype);
    // `consumer` is a getter on the class, so it is defined rather than assigned
    Object.defineProperty(main, 'consumer', {
      value: {
        bitMap: { getNestedRootDirs: () => nestedRootDirs, components: [] },
        toAbsolutePath: (relativePath: string) => path.join(workspacePath, relativePath),
      },
    });
    return main;
  }
  const componentFor = (files: string[]) =>
    ({ id: { toString: () => 'my-scope/ws-root' }, files: files.map((relative) => ({ relative })) }) as any;

  let workspacePath: string;
  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-preflight-'));
  });
  afterEach(async () => {
    await fs.remove(workspacePath);
  });

  it('should ignore a symlink inside a nested component, the write never goes through it', async () => {
    // an older root version still carries comp1's files, but the writer leaves that directory alone
    await fs.ensureDir(path.join(workspacePath, 'packages'));
    await fs.symlink(os.tmpdir(), path.join(workspacePath, 'packages/comp1'));
    const main = runtimeFor(['packages/comp1'], workspacePath);
    expect(() => main.throwForSymlinksInTheWay(componentFor(['packages/comp1/index.js']))).to.not.throw();
  });

  it('should ignore the live .bitmap, which the write does not land either', async () => {
    // a workspace whose own .bitmap is a symbolic link must not fail an import over a file the writer
    // skips anyway (see isWorkspaceMapFile)
    const target = path.join(workspacePath, 'elsewhere');
    await fs.ensureDir(target);
    await fs.symlink(target, path.join(workspacePath, '.bitmap'));
    const main = runtimeFor([], workspacePath);
    expect(() => main.throwForSymlinksInTheWay(componentFor(['.bitmap', 'README.md']))).to.not.throw();
  });

  it('should refuse a symlinked component.json when the config file is written', async () => {
    // it is generated rather than versioned, so it is not among the component's files - it still
    // lands at the root, and the writer forces override on it
    const target = path.join(workspacePath, 'elsewhere');
    await fs.ensureDir(target);
    await fs.symlink(target, path.join(workspacePath, 'component.json'));
    const main = runtimeFor([], workspacePath);
    expect(() => main.throwForSymlinksInTheWay(componentFor(['README.md']), true)).to.throw('is a symbolic link');
  });

  it('should refuse it even when the caller asked for no config file, the writer turns it on itself', async () => {
    // a config file already at the rootDir makes the writer write one whatever the caller passed
    // (see populateComponentsFilesToWrite), and a symlink pointing at an existing file is read as
    // one. so the flag does not settle whether a write lands here.
    const target = path.join(workspacePath, 'elsewhere');
    await fs.ensureDir(target);
    await fs.symlink(target, path.join(workspacePath, 'component.json'));
    const main = runtimeFor([], workspacePath);
    expect(() => main.throwForSymlinksInTheWay(componentFor(['README.md']), false)).to.throw('is a symbolic link');
  });

  it('should leave a broken symlink alone, the writer does not write through it either', async () => {
    // it resolves to nothing, so the writer does not read it as an existing config file and no
    // config is written. failing the whole import over it would be for nothing.
    await fs.symlink(path.join(workspacePath, 'missing'), path.join(workspacePath, 'component.json'));
    const main = runtimeFor([], workspacePath);
    expect(() => main.throwForSymlinksInTheWay(componentFor(['README.md']), false)).to.not.throw();
  });

  it('should still refuse a symlink on the way to a file the root does own', async () => {
    await fs.symlink(os.tmpdir(), path.join(workspacePath, 'docs'));
    const main = runtimeFor(['packages/comp1'], workspacePath);
    expect(() => main.throwForSymlinksInTheWay(componentFor(['docs/readme.md']))).to.throw('is a symbolic link');
  });

  it('should refuse a symlink at the file itself, not only above it', async () => {
    const outsideFile = path.join(workspacePath, 'theirs.md');
    await fs.writeFile(outsideFile, 'theirs\n');
    await fs.symlink(outsideFile, path.join(workspacePath, 'README.md'));
    const main = runtimeFor([], workspacePath);
    expect(() => main.throwForSymlinksInTheWay(componentFor(['README.md']))).to.throw('is a symbolic link');
  });

  it('should refuse a dangling symlink, whose target does not exist, rather than write through it', async () => {
    // a stat would say there is nothing there and let the write create the target; the check lstats
    await fs.symlink(path.join(workspacePath, 'missing-target'), path.join(workspacePath, 'README.md'));
    const main = runtimeFor([], workspacePath);
    expect(() => main.throwForSymlinksInTheWay(componentFor(['README.md']))).to.throw('is a symbolic link');
  });
});

describe('the guard on what may be written to the workspace root', () => {
  /**
   * it runs in the same branch as the symlink preflight, which an e2e case covers on the real
   * "--path ." path - so what is left to check is the rule itself, on the marker a version carries.
   */
  const componentWith = (extensions: ExtensionDataList) =>
    ({ id: { toString: () => 'my-scope/comp1' }, extensions }) as any;

  it('should refuse an ordinary component, only a workspace-root component may own "."', () => {
    const main = Object.create(ComponentWriterMain.prototype);
    expect(() => main.throwForNonWorkspaceRootComponent(componentWith(ExtensionDataList.fromArray([])))).to.throw(
      'not a workspace-root component'
    );
  });

  it('should accept a component whose version carries the root marker', () => {
    const extensions = ExtensionDataList.fromArray([
      new ExtensionDataEntry(undefined, undefined, WorkspaceRootAspect.id, undefined, { isRoot: true }),
    ]);
    const main = Object.create(ComponentWriterMain.prototype);
    expect(() => main.throwForNonWorkspaceRootComponent(componentWith(extensions))).to.not.throw();
  });

  it('should refuse a member, which points at its root rather than being one', () => {
    const extensions = ExtensionDataList.fromArray([
      new ExtensionDataEntry(undefined, undefined, WorkspaceRootAspect.id, undefined, {
        root: 'my-scope/ws-root@0.0.1',
      }),
    ]);
    const main = Object.create(ComponentWriterMain.prototype);
    expect(() => main.throwForNonWorkspaceRootComponent(componentWith(extensions))).to.throw(
      'not a workspace-root component'
    );
  });
});

describe('writing the workspace-root component in the same batch as a component nested in it', () => {
  /**
   * the batch goes through fixDirsIfNested, which moves a component aside when another one is to be
   * written inside it. the root must come out of it untouched: it owns "." by definition, and the
   * components below it are the normal case rather than a collision.
   */
  function runFixDirs(writeToPaths: string[], existingRootDirs: string[] = []) {
    const main = Object.create(ComponentWriterMain.prototype);
    Object.defineProperty(main, 'workspace', { value: { bitMap: { getAllRootDirs: () => existingRootDirs } } });
    const writers = writeToPaths.map((writeToPath) => ({
      writeToPath,
      component: { id: { scope: 'my-org.my-scope' } },
    }));
    main.fixDirsIfNested(writers);
    return writers.map((writer) => writer.writeToPath);
  }

  it('should leave both where they were asked to go', () => {
    expect(runFixDirs([WORKSPACE_ROOT_DIR, 'packages/comp1'])).to.deep.equal([WORKSPACE_ROOT_DIR, 'packages/comp1']);
  });

  it('should leave the root alone when the workspace already tracks a component inside it', () => {
    expect(runFixDirs([WORKSPACE_ROOT_DIR], ['packages/comp1'])).to.deep.equal([WORKSPACE_ROOT_DIR]);
  });

  it('should leave a component alone when the workspace already tracks the root', () => {
    expect(runFixDirs(['packages/comp1'], [WORKSPACE_ROOT_DIR])).to.deep.equal(['packages/comp1']);
  });

  it('should still move an ordinary component that another one is written inside of', () => {
    // the rule the root is untouched by, so the cases above are not passing on an inert branch
    expect(runFixDirs(['bar', 'bar/foo'])).to.deep.equal(['bar_1', 'bar/foo']);
  });
});

describe('deciding whether the directory-conflict check applies to a component', () => {
  /**
   * the decision turns on whether *this* component was asked to go somewhere, which is not the same
   * question as the directory it ends up at: without --path that directory is the default one, and
   * with --path-per-id the batch-level path answers for the wrong component. so it is resolved the
   * same way the write itself resolves it.
   */
  function shouldSkip(opts: Record<string, any>, rootDir?: string, dir = 'some-dir') {
    const main = Object.create(ComponentWriterMain.prototype);
    const component = { id: { toStringWithoutVersion: () => 'my-scope/comp1' } };
    return main.shouldSkipDirConflictCheck(component, dir, rootDir === undefined ? undefined : { rootDir }, opts);
  }

  it('should check a component asked for a directory it does not already own', () => {
    expect(shouldSkip({ writeToPath: 'some-dir' }, 'other-dir')).to.be.false;
  });

  it('should skip a component asked for the directory it holds today, it overrides itself in place', () => {
    expect(shouldSkip({ writeToPath: 'some-dir' }, 'some-dir')).to.be.true;
  });

  it('should skip a tracked component that was asked for nothing, it goes to its default directory', () => {
    expect(shouldSkip({}, 'other-dir')).to.be.true;
  });

  it('should take the path asked for this component, not the one asked for the batch', () => {
    expect(shouldSkip({ writeToPathPerId: { 'my-scope/comp1': 'some-dir' } }, 'other-dir')).to.be.false;
  });

  it('should check a component that is not tracked yet, whatever was asked for it', () => {
    expect(shouldSkip({})).to.be.false;
  });

  it('should skip everything when nothing is written to the filesystem at all', () => {
    expect(shouldSkip({ skipWritingToFs: true, writeToPath: 'some-dir' }, 'other-dir')).to.be.true;
  });
});

describe('the destination of an already tracked workspace-root component', () => {
  it('should be the workspace root, whatever path the caller derived without --path', async () => {
    const writer = Object.create(ComponentWriter.prototype);
    Object.assign(writer, {
      // what composeRelativeComponentPath returns when no --path is given
      writeToPath: 'my-scope/ws-root',
      override: true,
      writeConfig: false,
      skipUpdatingBitMap: true,
      existingComponentMap: { rootDir: WORKSPACE_ROOT_DIR, getRootDir: () => WORKSPACE_ROOT_DIR },
      bitMap: { getNestedRootDirs: () => [] },
      consumer: undefined,
      component: {
        id: { toString: () => 'my-scope/ws-root' },
        isLegacy: false,
        files: [{ relative: 'README.md', basename: 'README.md', path: 'README.md', updatePaths: () => {} }],
      },
    });
    await writer.populateComponentsFilesToWrite();
    expect(writer.writeToPath).to.equal(WORKSPACE_ROOT_DIR);
  });
});
