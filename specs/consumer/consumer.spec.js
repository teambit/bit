import { expect } from 'chai';
import sinon from 'sinon';
import Consumer from '../../src/consumer/consumer';
import ConsumerComponent from '../../src/consumer/component/consumer-component';

// Skipping this, should be deleted after writing appropriate tests for the virtualizaion
describe.skip('Consumer', () => {
  describe('runAllInlineSpecs', () => {
    let sandbox;
    beforeEach(() => {
      sandbox = sinon.sandbox.create();
    });
    afterEach(() => {
      sandbox.restore();
    });
    it('should return an empty array if there are no inline components', () => {
      sandbox.stub(Consumer.prototype, 'listInline').returns(Promise.resolve([]));
      const consumer = new Consumer({ projectPath: '' });
      const result = consumer.runAllInlineSpecs();
      return result.then((data) => {
        expect(data).to.be.an('Array');
        expect(data.length).to.be.equal(0);
      });
    });
    it('should return an array with results for all inline components', () => {
      const consumerComponent1 = new ConsumerComponent({ name: 'component-name1', box: 'box' });
      const consumerComponent2 = new ConsumerComponent({ name: 'component-name2', box: 'box' });
      sandbox.stub(Consumer.prototype, 'listInline').returns(Promise.resolve([consumerComponent1, consumerComponent2]));

      const consumer = new Consumer({ projectPath: '' });
      const result = consumer.runAllInlineSpecs();
      expect(result).to.be.a('Promise');
      return result.then((data) => {
        expect(data).to.be.an('Array');
        expect(data.length).to.be.equal(2);
        data.map(resultData => expect(resultData).to.have.all.keys('specs', 'component'));
      });
    });
  });
});
