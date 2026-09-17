import { expect } from 'chai';
import ComponentWriter, { isOwnedByNestedComponent } from './component-writer';

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
  function writerFor(files: string[], nestedRootDirs: string[]) {
    const written: string[] = [];
    const writer = Object.create(ComponentWriter.prototype);
    Object.assign(writer, {
      writeToPath: '.',
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
});
