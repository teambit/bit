import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { BitMap } from '@teambit/legacy.bit-map';
import { Extensions } from '@teambit/legacy.constants';
import { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy.extension-data';
import {
  findWorkspaceRootMap,
  isWorkspaceRootComponent,
  readWorkspaceRoot,
  writeWorkspaceRoot,
} from './workspace-root-data';
import { WorkspaceRootAspect } from './workspace-root.aspect';

const rootId = ComponentID.fromString('my-scope/my-root@0.0.7');

describe('workspace-root data', () => {
  describe('findWorkspaceRootMap', () => {
    // a real BitMap rather than a stand-in: the rule lives on it (getWorkspaceRootMap), and a mock
    // that answers isRemoved() itself would only be testing the mock
    const bitMapWith = async (entries: Record<string, any>) => {
      const bitMap = await BitMap.load(__dirname, '');
      bitMap.loadComponents(entries, 'my-scope');
      return bitMap;
    };
    const rootEntry = { name: 'my-root', scope: 'my-scope', version: '0.0.7', mainFile: 'README.md', rootDir: '.' };
    const nestedEntry = { name: 'comp1', scope: 'my-scope', version: '0.0.1', mainFile: 'index.js', rootDir: 'comp1' };
    it('should return the entry tracked at the workspace root', async () => {
      const bitMap = await bitMapWith({ 'my-scope/comp1': nestedEntry, 'my-scope/my-root': rootEntry });
      expect(findWorkspaceRootMap(bitMap)?.id.toString()).to.equal(rootId.toString());
    });
    it('should return undefined when no component owns the workspace root', async () => {
      const bitMap = await bitMapWith({ 'my-scope/comp1': nestedEntry });
      expect(findWorkspaceRootMap(bitMap)).to.be.undefined;
    });
    it('should ignore a root of another lane, this lane is rootless', async () => {
      // it stays in .bitmap so a switch back can restore it. snapping here would otherwise tag it along
      const bitMap = await bitMapWith({ 'my-scope/my-root': rootEntry });
      bitMap.components[0].isAvailableOnCurrentLane = false;
      expect(findWorkspaceRootMap(bitMap)).to.be.undefined;
    });
    it('should ignore a removed root', async () => {
      const bitMap = await bitMapWith({ 'my-scope/my-root': rootEntry });
      bitMap.components[0].config = { [Extensions.remove]: { removed: true } };
      expect(findWorkspaceRootMap(bitMap)).to.be.undefined;
    });
  });
  describe('isWorkspaceRootComponent', () => {
    const withData = (data: Record<string, any>) =>
      ExtensionDataList.fromArray([
        new ExtensionDataEntry(undefined, undefined, WorkspaceRootAspect.id, undefined, data),
      ]);
    it('should recognize the marker the root carries', () => {
      expect(isWorkspaceRootComponent(withData({ isRoot: true }))).to.be.true;
    });
    it('should not take a member, which carries the pointer to its root, for a root', () => {
      expect(isWorkspaceRootComponent(withData({ root: rootId.toString() }))).to.be.false;
    });
    it('should be false for a component with no data of this aspect', () => {
      expect(isWorkspaceRootComponent(ExtensionDataList.fromArray([]))).to.be.false;
    });
  });
  describe('writeWorkspaceRoot and readWorkspaceRoot', () => {
    it('should round-trip the root id with its version', () => {
      const extensions = ExtensionDataList.fromArray([]);
      writeWorkspaceRoot(extensions, rootId);
      expect(readWorkspaceRoot(extensions)?.toString()).to.equal('my-scope/my-root@0.0.7');
    });
    it('should replace an existing pointer rather than add a second entry', () => {
      const extensions = ExtensionDataList.fromArray([]);
      writeWorkspaceRoot(extensions, rootId);
      writeWorkspaceRoot(extensions, rootId.changeVersion('0.0.8'));
      expect(extensions).to.have.lengthOf(1);
      expect(readWorkspaceRoot(extensions)?.version).to.equal('0.0.8');
    });
    it('should keep a root that was never snapped without a version', () => {
      const extensions = ExtensionDataList.fromArray([]);
      writeWorkspaceRoot(extensions, ComponentID.fromString('my-scope/my-root'));
      expect(readWorkspaceRoot(extensions)?.hasVersion()).to.be.false;
    });
    it('should return undefined for a component with no pointer', () => {
      expect(readWorkspaceRoot(ExtensionDataList.fromArray([]))).to.be.undefined;
    });
    it('should replace the data rather than merge into it, so a former root is not both', () => {
      // a root moved out of "." into a directory of its own becomes an ordinary member. merging would
      // leave the isRoot marker behind and the version would claim both roles at once
      const extensions = ExtensionDataList.fromArray([
        new ExtensionDataEntry(undefined, undefined, WorkspaceRootAspect.id, undefined, { isRoot: true }),
      ]);
      writeWorkspaceRoot(extensions, rootId);
      expect(isWorkspaceRootComponent(extensions)).to.be.false;
      expect(readWorkspaceRoot(extensions)?.toString()).to.equal(rootId.toString());
    });
  });
});
