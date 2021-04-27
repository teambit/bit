import { expect } from 'chai';
import { MergeConflict } from '../exceptions';
import ComponentNeedsUpdate from '../exceptions/component-needs-update';
import Component from '../models/model-component';
import { ModelComponentMerger } from './model-components-merger';

describe('ModelComponentMerger', () => {
  describe('merge', () => {
    it('should not remove a version that exist locally but not in the incoming component if it came not from its origin', async () => {
      const existingComponent = Component.parse(
        JSON.stringify({
          name: 'foo',
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'c471678f719783b044ac6d933ccb1da7132dc93d',
          },
        })
      );
      const incomingComponent = Component.parse(
        JSON.stringify({
          name: 'foo',
          versions: { '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e' },
        })
      );
      const { mergedComponent, mergedVersions } = await new ModelComponentMerger(
        existingComponent,
        incomingComponent,
        false,
        true,
        false
      ).merge();
      expect(mergedComponent.versions).to.have.property('0.0.2');
      expect(mergedComponent.versions['0.0.2'].toString()).to.equal('c471678f719783b044ac6d933ccb1da7132dc93d');
      expect(mergedVersions).to.deep.equal([]);
      expect(() => mergedComponent.validate()).to.not.throw();
    });
    it('should move a version to orphanedVersions if the incoming came from its origin and it does not have the version', async () => {
      const existingComponent = Component.parse(
        JSON.stringify({
          name: 'foo',
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'c471678f719783b044ac6d933ccb1da7132dc93d',
          },
        })
      );
      const incomingComponent = Component.parse(
        JSON.stringify({
          name: 'foo',
          versions: { '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e' },
        })
      );
      const { mergedComponent, mergedVersions } = await new ModelComponentMerger(
        existingComponent,
        incomingComponent,
        true,
        true,
        false
      ).merge();
      expect(mergedComponent.versions).to.not.have.property('0.0.2');
      expect(mergedComponent.orphanedVersions).to.have.property('0.0.2');
      expect(mergedComponent.orphanedVersions['0.0.2'].toString()).to.equal('c471678f719783b044ac6d933ccb1da7132dc93d');
      expect(mergedVersions).to.deep.equal([]);
      expect(() => mergedComponent.validate()).to.not.throw();
    });
    it('should move a version from orphanedVersions to versions if the incoming came from its origin and it has this version', async () => {
      const existingComponent = Component.parse(
        JSON.stringify({
          name: 'foo',
          versions: {
            '0.0.2': 'c471678f719783b044ac6d933ccb1da7132dc93d',
          },
          orphanedVersions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
          },
        })
      );
      const incomingComponent = Component.parse(
        JSON.stringify({
          name: 'foo',
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'c471678f719783b044ac6d933ccb1da7132dc93d',
          },
        })
      );
      const { mergedComponent, mergedVersions } = await new ModelComponentMerger(
        existingComponent,
        incomingComponent,
        true,
        true,
        false
      ).merge();
      expect(mergedComponent.versions).to.have.property('0.0.1');
      expect(mergedComponent.orphanedVersions).to.not.have.property('0.0.1');
      expect(mergedVersions).to.deep.equal(['0.0.1']);
      expect(() => mergedComponent.validate()).to.not.throw();
    });
    it('should override a version from the incoming component in case of hash discrepancies', async () => {
      const existingComponent = Component.parse(
        JSON.stringify({
          name: 'foo',
          versions: { '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e' },
        })
      );
      const incomingComponent = Component.parse(
        JSON.stringify({
          name: 'foo',
          versions: { '0.0.1': 'c471678f719783b044ac6d933ccb1da7132dc93d' },
        })
      );
      const { mergedComponent, mergedVersions } = await new ModelComponentMerger(
        existingComponent,
        incomingComponent,
        true,
        true,
        false
      ).merge();
      expect(mergedComponent.versions['0.0.1'].toString()).to.equal('c471678f719783b044ac6d933ccb1da7132dc93d');
      expect(mergedVersions).to.deep.equal(['0.0.1']);
      expect(() => mergedComponent.validate()).to.not.throw();
    });
    it('should add versions that exist in the incoming component but not locally', async () => {
      const existingComponent = Component.parse(
        JSON.stringify({
          name: 'foo',
          versions: { '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e' },
        })
      );
      const incomingComponent = Component.parse(
        JSON.stringify({
          name: 'foo',
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'c471678f719783b044ac6d933ccb1da7132dc93d',
            '0.0.3': '56f2b008f43c20f6538ef27023759c3d9a44992c',
          },
        })
      );
      const { mergedComponent, mergedVersions } = await new ModelComponentMerger(
        existingComponent,
        incomingComponent,
        true,
        true,
        false
      ).merge();
      expect(mergedComponent.versions).to.have.property('0.0.1');
      expect(mergedComponent.versions).to.have.property('0.0.2');
      expect(mergedComponent.versions).to.have.property('0.0.3');
      expect(mergedComponent.versions['0.0.1'].toString()).to.equal('3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e');
      expect(mergedComponent.versions['0.0.2'].toString()).to.equal('c471678f719783b044ac6d933ccb1da7132dc93d');
      expect(mergedComponent.versions['0.0.3'].toString()).to.equal('56f2b008f43c20f6538ef27023759c3d9a44992c');
      expect(mergedVersions).to.deep.equal(['0.0.2', '0.0.3']);
      expect(() => mergedComponent.validate()).to.not.throw();
    });
    describe('importing from origin', () => {
      it('should update the head and move tags to orphanedVersions if needed', async () => {
        const existing = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'c471678f719783b044ac6d933ccb1da7132dc93d',
          },
          head: 'c471678f719783b044ac6d933ccb1da7132dc93d',
        });
        const incoming = getComponentObject({
          versions: { '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e' },
          head: '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
        });
        const { mergedComponent } = await merge(existing, incoming, true, true);

        expect(mergedComponent.head?.toString()).to.equal('3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e');
        expect(mergedComponent.versions).to.have.property('0.0.1');
        expect(mergedComponent.versions).to.not.have.property('0.0.2');
        expect(mergedComponent.orphanedVersions).to.have.property('0.0.2');
      });
      it('should not update the head if changed locally', async () => {
        const existing = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'c471678f719783b044ac6d933ccb1da7132dc93d',
          },
          state: {
            versions: {
              '0.0.2': {
                local: true,
              },
            },
          },
          head: 'c471678f719783b044ac6d933ccb1da7132dc93d',
        });
        const incoming = getComponentObject({
          versions: { '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e' },
          head: '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
        });
        const { mergedComponent } = await merge(existing, incoming, true, true);

        expect(mergedComponent.head?.toString()).to.equal('c471678f719783b044ac6d933ccb1da7132dc93d');
        expect(mergedComponent.versions).to.have.property('0.0.1');
        expect(mergedComponent.versions).to.have.property('0.0.2');
        expect(mergedComponent.orphanedVersions).to.not.have.property('0.0.2');
      });
      it('should throw MergeConflict if same versions have different hash and changed locally', async () => {
        const existing = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'c471678f719783b044ac6d933ccb1da7132dc93d',
          },
          state: {
            versions: {
              '0.0.2': {
                local: true,
              },
            },
          },
          head: 'c471678f719783b044ac6d933ccb1da7132dc93d',
        });
        const incoming = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'fa2ec220dbf817c07b2119c561ce8d3fe163f03d',
          },
          head: 'fa2ec220dbf817c07b2119c561ce8d3fe163f03d',
        });
        try {
          await merge(existing, incoming, true, true);
          expect.fail();
        } catch (err) {
          expect(err).to.be.instanceOf(MergeConflict);
        }
      });
      it('should not throw MergeConflict if same versions have different hash and not changed locally', async () => {
        const existing = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'c471678f719783b044ac6d933ccb1da7132dc93d',
          },
          head: 'c471678f719783b044ac6d933ccb1da7132dc93d',
        });
        const incoming = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'fa2ec220dbf817c07b2119c561ce8d3fe163f03d',
          },
          head: 'fa2ec220dbf817c07b2119c561ce8d3fe163f03d',
        });
        const { mergedComponent } = await merge(existing, incoming, true, true);

        expect(mergedComponent.head?.toString()).to.equal('fa2ec220dbf817c07b2119c561ce8d3fe163f03d');
        expect(mergedComponent.versions).to.have.property('0.0.1');
        expect(mergedComponent.versions).to.have.property('0.0.2');
        expect(mergedComponent.versions['0.0.2'].toString()).to.equal('fa2ec220dbf817c07b2119c561ce8d3fe163f03d');
      });
    });
    describe('importing from non-origin', () => {
      it('should not update the head and not move tags to orphanedVersions', async () => {
        const existing = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'c471678f719783b044ac6d933ccb1da7132dc93d',
          },
          head: 'c471678f719783b044ac6d933ccb1da7132dc93d',
        });
        const incoming = getComponentObject({
          versions: { '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e' },
          head: '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
        });
        const { mergedComponent } = await merge(existing, incoming, true, false);

        expect(mergedComponent.head?.toString()).to.equal('c471678f719783b044ac6d933ccb1da7132dc93d');
        expect(mergedComponent.versions).to.have.property('0.0.1');
        expect(mergedComponent.versions).to.have.property('0.0.2');
        expect(mergedComponent.orphanedVersions).to.not.have.property('0.0.2');
      });
      it('should not throw MergeConflict if same versions have different hash and not put it in orphaned', async () => {
        const existing = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'c471678f719783b044ac6d933ccb1da7132dc93d',
          },
          head: 'c471678f719783b044ac6d933ccb1da7132dc93d',
        });
        const incoming = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'fa2ec220dbf817c07b2119c561ce8d3fe163f03d',
          },
          head: 'fa2ec220dbf817c07b2119c561ce8d3fe163f03d',
        });
        const { mergedComponent } = await merge(existing, incoming, true, false);

        expect(mergedComponent.head?.toString()).to.equal('c471678f719783b044ac6d933ccb1da7132dc93d');
        expect(mergedComponent.versions).to.have.property('0.0.1');
        expect(mergedComponent.versions).to.have.property('0.0.2');
        expect(mergedComponent.versions['0.0.2'].toString()).to.equal('c471678f719783b044ac6d933ccb1da7132dc93d');
        // no need to put in orphaned because this version exists already in "versions" prop.
        expect(mergedComponent.orphanedVersions).to.not.have.property('0.0.2');
      });
      it('should copy orphanedVersions', async () => {
        const existing = getComponentObject({
          versions: { '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e' },
          head: '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
        });
        const incoming = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
          },
          orphanedVersions: {
            '0.0.2': 'c471678f719783b044ac6d933ccb1da7132dc93d',
          },
          head: '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
        });
        const { mergedComponent } = await merge(existing, incoming, true, false);
        expect(mergedComponent.orphanedVersions).to.have.property('0.0.2');
        expect(mergedComponent.orphanedVersions['0.0.2'].toString()).to.equal(
          'c471678f719783b044ac6d933ccb1da7132dc93d'
        );
        expect(mergedComponent.versions).to.have.property('0.0.1');
        expect(mergedComponent.versions).to.not.have.property('0.0.2');
        expect(mergedComponent.head?.toString()).to.equal('3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e');
      });
      it('should not copy orphanedVersion if exists in versions', async () => {
        const existing = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'c471678f719783b044ac6d933ccb1da7132dc93d',
          },
          head: 'c471678f719783b044ac6d933ccb1da7132dc93d',
        });
        const incoming = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
          },
          orphanedVersions: {
            '0.0.2': 'c471678f719783b044ac6d933ccb1da7132dc93d',
          },
          head: '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
        });
        const { mergedComponent } = await merge(existing, incoming, true, false);

        expect(mergedComponent.head?.toString()).to.equal('c471678f719783b044ac6d933ccb1da7132dc93d');
        expect(mergedComponent.versions).to.have.property('0.0.1');
        expect(mergedComponent.versions).to.have.property('0.0.2');
        expect(mergedComponent.orphanedVersions).to.not.have.property('0.0.2');
        expect(() => mergedComponent.validate()).not.to.throw();
      });
    });
    describe('exporting to origin', () => {
      it('should update the head', async () => {
        const existing = getComponentObject({
          versions: { '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e' },
          head: '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
        });
        const incoming = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'c471678f719783b044ac6d933ccb1da7132dc93d',
          },
          head: 'c471678f719783b044ac6d933ccb1da7132dc93d',
        });
        const { mergedComponent, mergedVersions } = await merge(existing, incoming, false, true);

        expect(mergedComponent.head?.toString()).to.equal('c471678f719783b044ac6d933ccb1da7132dc93d');
        expect(mergedComponent.versions).to.have.property('0.0.1');
        expect(mergedComponent.versions).to.have.property('0.0.2');
        expect(mergedVersions).to.deep.equal(['0.0.2']);
      });
      it('should throw MergeConflict if same versions have different hash', async () => {
        const existing = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'c471678f719783b044ac6d933ccb1da7132dc93d',
          },
          head: 'c471678f719783b044ac6d933ccb1da7132dc93d',
        });
        const incoming = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'fa2ec220dbf817c07b2119c561ce8d3fe163f03d',
          },
          head: 'fa2ec220dbf817c07b2119c561ce8d3fe163f03d',
        });
        try {
          await merge(existing, incoming, false, true);
          expect.fail();
        } catch (err) {
          expect(err).to.be.instanceOf(MergeConflict);
        }
      });
      it('when incoming is behind should throw ComponentNeedsUpdate', async () => {
        const existing = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.5': 'c471678f719783b044ac6d933ccb1da7132dc93d',
          },
          head: 'c471678f719783b044ac6d933ccb1da7132dc93d',
        });
        const incoming = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'fa2ec220dbf817c07b2119c561ce8d3fe163f03d',
          },
          head: 'fa2ec220dbf817c07b2119c561ce8d3fe163f03d',
        });
        try {
          await merge(existing, incoming, false, true, true);
          expect.fail();
        } catch (err) {
          expect(err).to.be.instanceOf(ComponentNeedsUpdate);
        }
      });
      it('when incoming is behind and the versions are conflicted, should throw MergeConflict', async () => {
        const existing = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'c471678f719783b044ac6d933ccb1da7132dc93d',
          },
          head: 'c471678f719783b044ac6d933ccb1da7132dc93d',
        });
        const incoming = getComponentObject({
          versions: {
            '0.0.1': '3d4f647fb943437b675e7163ed1e4d1f7c8a8c0e',
            '0.0.2': 'fa2ec220dbf817c07b2119c561ce8d3fe163f03d',
          },
          head: 'fa2ec220dbf817c07b2119c561ce8d3fe163f03d',
        });
        try {
          await merge(existing, incoming, false, true, true);
          expect.fail();
        } catch (err) {
          expect(err).to.be.instanceOf(MergeConflict);
        }
      });
    });
  });
});

function getComponentObject(componentObj: Record<string, any>): Component {
  return Component.parse(
    JSON.stringify({
      name: 'foo',
      ...componentObj,
    })
  );
}

async function merge(
  existingComponent: Component,
  incomingComponent: Component,
  isImport: boolean,
  isIncomingFromOrigin: boolean,
  existingHeadIsMissingInIncomingComponent = false
) {
  const modelComponentMerger = new ModelComponentMerger(
    existingComponent,
    incomingComponent,
    isImport,
    isIncomingFromOrigin,
    existingHeadIsMissingInIncomingComponent
  );
  return modelComponentMerger.merge();
}
