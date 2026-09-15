import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import type { BitMap } from '@teambit/legacy.bit-map';
import { ExtensionDataList } from '@teambit/legacy.extension-data';
import { findWorkspaceRootMap, readWorkspaceRoot, writeWorkspaceRoot } from './workspace-root-data';

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
