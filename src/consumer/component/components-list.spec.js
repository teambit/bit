import { expect } from 'chai';
import ComponentsList from './components-list';
import { ModelComponent } from '../../scope/models';
import { BitId, BitIds } from '../../bit-id';

describe('ComponentList', () => {
  const getModelComponent = () => ModelComponent.fromBitId({ name: 'myName', scope: 'scope' });
  describe('listLocalScope', () => {
    let modelComponent;
    before(() => {
      modelComponent = getModelComponent();
    });
    it('should return an empty array when there are no components in the scope', async () => {
      const scope = { listLocal: () => [] };
      const results = await ComponentsList.listLocalScope(scope);
      expect(results).to.deep.equal([]);
    });
    it('should return results with the correct id', async () => {
      const scope = {
        listLocal: () => [modelComponent]
      };
      const results = await ComponentsList.listLocalScope(scope);
      const result = results[0];
      expect(result).to.have.property('id');
      expect(result.id).to.be.an.instanceOf(BitId);
    });
    it('should return results with the correct deprecated status', async () => {
      modelComponent.deprecated = true;
      const scope = {
        listLocal: () => [modelComponent]
      };
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
      const bitMap = { getAllBitIds: () => new BitIds() };
      const consumer = { scope, bitMap };
      componentList = new ComponentsList(consumer);
    });
    it('should return results with the correct id', async () => {
      const modelComponent = getModelComponent();
      scope.list = async () => [modelComponent];
      const results = await componentList.listScope(false, true);
      const result = results[0];
      expect(result).to.have.property('id');
      expect(result.id).to.be.an.instanceOf(BitId);
    });
  });
});
