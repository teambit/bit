import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { WORKSPACE_ROOT_DIR } from '@teambit/legacy.bit-map';
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

  it('should still refuse a symlink on the way to a file the root does own', async () => {
    await fs.symlink(os.tmpdir(), path.join(workspacePath, 'docs'));
    const main = runtimeFor(['packages/comp1'], workspacePath);
    expect(() => main.throwForSymlinksInTheWay(componentFor(['docs/readme.md']))).to.throw('is a symbolic link');
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
