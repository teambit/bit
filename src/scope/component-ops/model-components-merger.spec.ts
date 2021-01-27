import { expect } from 'chai';

import Sources from '../../scope/repositories/sources';
import Component from '../models/model-component';
import { ModelComponentMerger } from './model-components-merger';

describe('ModelComponentMerger', () => {
  describe('merge', () => {
    let sources: Sources;
    before(() => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      sources = new Sources();
    });
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
        [],
        [],
        false,
        true,
        false
      ).merge();
      expect(mergedComponent.versions).to.have.property('0.0.2');
      expect(mergedComponent.versions['0.0.2'].toString()).to.equal('c471678f719783b044ac6d933ccb1da7132dc93d');
      expect(mergedVersions).to.deep.equal([]);
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
        [],
        [],
        true,
        true,
        false
      ).merge();
      expect(mergedComponent.versions).to.not.have.property('0.0.2');
      expect(mergedComponent.orphanedVersions).to.have.property('0.0.2');
      expect(mergedComponent.orphanedVersions['0.0.2'].toString()).to.equal('c471678f719783b044ac6d933ccb1da7132dc93d');
      expect(mergedVersions).to.deep.equal([]);
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
        [],
        [],
        true,
        true,
        false
      ).merge();
      expect(mergedComponent.versions).to.have.property('0.0.1');
      expect(mergedComponent.orphanedVersions).to.not.have.property('0.0.1');
      expect(mergedVersions).to.deep.equal(['0.0.1']);
    });
    // @todo: needs to decide what should be done here.
    it.skip('should move a version to orphanedVersions if the incoming came via export and it does not have the version', async () => {
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
        [],
        [],
        true,
        true,
        false
      ).merge();
      expect(mergedComponent.versions).to.not.have.property('0.0.2');
      expect(mergedComponent.orphanedVersions).to.have.property('0.0.2');
      expect(mergedComponent.orphanedVersions['0.0.2'].toString()).to.equal('c471678f719783b044ac6d933ccb1da7132dc93d');
      expect(mergedVersions).to.deep.equal([]);
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
        [],
        [],
        true,
        true,
        false
      ).merge();
      expect(mergedComponent.versions['0.0.1'].toString()).to.equal('c471678f719783b044ac6d933ccb1da7132dc93d');
      expect(mergedVersions).to.deep.equal(['0.0.1']);
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
        [],
        [],
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
    });
  });
});
