import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import type { BitMap } from '@teambit/legacy.bit-map';
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
    it('should return the entry tracked at the workspace root', () => {
      const bitMap = {
        components: [
          { id: ComponentID.fromString('my-scope/comp1'), rootDir: 'comp1' },
          { id: rootId, rootDir: '.' },
        ],
      } as unknown as BitMap;
      expect(findWorkspaceRootMap(bitMap)?.id.toString()).to.equal(rootId.toString());
    });
    it('should return undefined when no component owns the workspace root', () => {
      const bitMap = {
        components: [{ id: ComponentID.fromString('my-scope/comp1'), rootDir: 'comp1' }],
      } as unknown as BitMap;
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
  });
});
