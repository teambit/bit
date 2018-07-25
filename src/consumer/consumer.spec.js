import { expect } from 'chai';
import sinon from 'sinon';
import Consumer from '../../src/consumer/consumer';
import ConsumerComponent from '../../src/consumer/component/consumer-component';

// Skipping this, should be deleted after writing appropriate tests for the virtualizaion
describe('Consumer', () => {
  describe.skip('runAllInlineSpecs', () => {
    let sandbox;
    beforeEach(() => {
      sandbox = sinon.createSandbox();
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
  describe('getComponentIdFromNodeModulesPath', () => {
    let sandbox;
    let consumer;
    before(() => {
      sandbox = sinon.createSandbox();
      sandbox.stub(Consumer.prototype, 'warnForMissingDriver').returns();
      consumer = new Consumer({ projectPath: '', bitJson: {} });
    });
    after(() => {
      sandbox.restore();
    });
    it('should parse the path correctly when a component is not in bitMap and has one dot', () => {
      const result = consumer.getComponentIdFromNodeModulesPath(
        '../../../node_modules/@bit/q207wrk9-remote.comp/file2.js',
        '@bit'
      );
      expect(result.scope).to.equal('q207wrk9-remote');
      expect(result.name).to.equal('comp');
    });
    it('should parse the path correctly when a component is not in bitMap and has two dots', () => {
      const result = consumer.getComponentIdFromNodeModulesPath(
        '../../../node_modules/@bit/q207wrk9-remote.comp.comp2/file2.js',
        '@bit'
      );
      expect(result.scope).to.equal('q207wrk9-remote.comp');
      expect(result.name).to.equal('comp2');
    });
    it('should parse the path correctly when a component is not in bitMap and has three dots', () => {
      const result = consumer.getComponentIdFromNodeModulesPath(
        '../../../node_modules/@bit/q207wrk9-remote.comp.comp2.comp3/file2.js',
        '@bit'
      );
      expect(result.scope).to.equal('q207wrk9-remote.comp');
      expect(result.name).to.equal('comp2/comp3');
    });
  });
});
