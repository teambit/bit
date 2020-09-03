import { expect } from 'chai';

import { BitId, BitIds } from '../../bit-id';
import { ModelComponent } from '../../scope/models';
import ComponentsList from './components-list';

describe('ComponentList', function () {
  this.timeout(0);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const getModelComponent = () => ModelComponent.fromBitId({ name: 'myName', scope: 'scope' });
  const getScope = (modelComponent) => ({
    listLocal: () => {
      return modelComponent ? Promise.resolve([modelComponent]) : Promise.resolve([]);
    },
  });
  describe('listLocalScope', function () {
    let modelComponent;
    before(() => {
      this.timeout(0);
      modelComponent = getModelComponent();
    });
    it('should return an empty array when there are no components in the scope', async () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const scope = getScope();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const results = await ComponentsList.listLocalScope(scope);
      expect(results).to.deep.equal([]);
    });
    it('should return results with the correct id', async () => {
      const scope = getScope(modelComponent);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const results = await ComponentsList.listLocalScope(scope);
      const result = results[0];
      expect(result).to.have.property('id');
      expect(result.id).to.be.an.instanceOf(BitId);
    });
    it('should return results with the correct deprecated status', async () => {
      modelComponent.deprecated = true;
      const scope = getScope(modelComponent);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const results = await ComponentsList.listLocalScope(scope);
      const result = results[0];
      expect(result).to.have.property('deprecated');
      expect(result.deprecated).to.be.true;
    });
  });
  describe('listScope', () => {
    let componentList;
    const scope = {};
    before(() => {
      const bitMap = { getAuthoredAndImportedBitIds: () => new BitIds() };
      const consumer = { scope, bitMap, getCurrentLaneId: () => {} };
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      componentList = new ComponentsList(consumer);
    });
    it('should return results with the correct id', async () => {
      const modelComponent = getModelComponent();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      scope.listIncludeRemoteHead = async () => [modelComponent];
      const results = await componentList.listScope(false, true);
      const result = results[0];
      expect(result).to.have.property('id');
      expect(result.id).to.be.an.instanceOf(BitId);
    });
  });
  describe('filterComponentsByWildcard', () => {
    describe('passing bit ids', () => {
      let bitIds;
      before(() => {
        bitIds = [
          BitId.parse('utils/is/string'),
          BitId.parse('utils/is/type'),
          BitId.parse('utils/fs/read'),
          BitId.parse('utils/fs/write'),
          BitId.parse('bar/foo'),
          BitId.parse('vuz/vuz'),
        ];
      });
      const expectToMatch = (idWithWildCard, expectedResults) => {
        const results = ComponentsList.filterComponentsByWildcard(bitIds, idWithWildCard);
        const resultsStr = results.map((result) => result.toString());
        expectedResults.forEach((expectedResult) => expect(resultsStr).to.include(expectedResult));
        expect(results.length).to.equal(expectedResults.length);
      };
      it('should match utils/is/*', () => {
        expectToMatch('utils/is/*', ['utils/is/string', 'utils/is/type']);
      });
      it('should match utils/*', () => {
        expectToMatch('utils/*', ['utils/is/string', 'utils/is/type', 'utils/fs/read', 'utils/fs/write']);
      });
      it('should match *', () => {
        expectToMatch('*', [
          'utils/is/string',
          'utils/is/type',
          'utils/fs/read',
          'utils/fs/write',
          'bar/foo',
          'vuz/vuz',
        ]);
      });
      it('should match */fs/*', () => {
        expectToMatch('*/fs/*', ['utils/fs/read', 'utils/fs/write']);
      });
      it('should match utils/*/read', () => {
        expectToMatch('utils/*/read', ['utils/fs/read']);
      });
      it('should match v*', () => {
        expectToMatch('v*', ['vuz/vuz']);
      });
      it('should not match non-exist*', () => {
        expectToMatch('non-exist*', []);
      });
      it('should match bit ids also without the scope name', () => {
        expectToMatch('fs*', ['utils/fs/read', 'utils/fs/write']);
      });
      it('should not match s* as non of the ids starts with "s" (with and without scope names)', () => {
        expectToMatch('s*', []);
      });
      it('when no wildcard is specified, it should match an exact id with a scope name', () => {
        expectToMatch('utils/fs/read', ['utils/fs/read']);
      });
      it('when no wildcard is specified, it should match an exact id without a scope name', () => {
        expectToMatch('fs/read', ['utils/fs/read']);
      });
      it('should match multiple different ids when using an array of ids with wildcard', () => {
        expectToMatch(['vuz/*', 'utils/fs/*'], ['vuz/vuz', 'utils/fs/read', 'utils/fs/write']);
      });
    });
  });
});
