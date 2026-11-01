import { expect } from 'chai';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { ModelComponent } from '@teambit/objects';
import { ComponentsList } from './components-list';

type ListLocalScopeArg = Parameters<typeof ComponentsList.listLocalScope>[0];
type ComponentsListArg = ConstructorParameters<typeof ComponentsList>[0];

describe('ComponentList', function () {
  this.timeout(0);
  const getModelComponent = () => ModelComponent.fromBitId(ComponentID.fromObject({ name: 'myName', scope: 'scope' }));
  const getScope = (modelComponent?: ModelComponent) =>
    ({
      listLocal: () => {
        return modelComponent ? Promise.resolve([modelComponent]) : Promise.resolve([]);
      },
    }) as unknown as ListLocalScopeArg;
  describe('listLocalScope', function () {
    before(() => {
      this.timeout(0);
    });
    it('should return an empty array when there are no components in the scope', async () => {
      const scope = getScope();
      const results = await ComponentsList.listLocalScope(scope);
      expect(results).to.deep.equal([]);
    });
  });
  describe('listScope', () => {
    let componentList;
    const scope: { listIncludeRemoteHead?: () => Promise<ModelComponent[]> } = {};
    before(() => {
      const bitMap = { getAllBitIds: () => new ComponentIdList() };
      const workspace = { consumer: { scope, bitMap, getCurrentLaneId: () => {} } };
      componentList = new ComponentsList(workspace as unknown as ComponentsListArg);
    });
    it('should return results with the correct id', async () => {
      const modelComponent = getModelComponent();
      scope.listIncludeRemoteHead = async () => [modelComponent];
      const results = await componentList.listAll(false, true);
      const result = results[0];
      expect(result).to.have.property('id');
      expect(result.id.constructor.name).to.equal(ComponentID.name);
    });
  });
  describe('filterComponentsByWildcard', () => {
    describe('passing bit ids', () => {
      let bitIds;
      before(() => {
        bitIds = [
          ComponentID.fromString('utils/is/string'),
          ComponentID.fromString('utils/is/type'),
          ComponentID.fromString('utils/fs/read'),
          ComponentID.fromString('utils/fs/write'),
          ComponentID.fromString('bar/foo'),
          ComponentID.fromString('vuz/vuz'),
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
      it('should not match bit ids also without the scope name', () => {
        expectToMatch('fs*', []);
      });
      it('should not match s* as non of the ids starts with "s" (with and without scope names)', () => {
        expectToMatch('s*', []);
      });
      it('when no wildcard is specified, it should match an exact id with a scope name', () => {
        expectToMatch('utils/fs/read', ['utils/fs/read']);
      });
      it('when no wildcard is specified, it should not match an exact id without a scope name', () => {
        expectToMatch('fs/read', []);
      });
      it('should match multiple different ids when using an array of ids with wildcard', () => {
        expectToMatch(['vuz/*', 'utils/fs/*'], ['vuz/vuz', 'utils/fs/read', 'utils/fs/write']);
      });
    });
  });
});
