import { expect } from 'chai';
import sinon from 'sinon';
import ConsumerComponent from '../../../src/consumer/component/consumer-component';
import ConsumerBitJson from '../../../src/consumer/bit-json/consumer-bit-json';
import BitId from '../../../src/bit-id/bit-id';
import Scope from '../../../src/scope/scope';
import Impl from '../../../src/consumer/component/sources/impl';

describe('ConsumerComponent', () => {
  describe('build', () => {
    let consumerComponent;
    before(() => {
      const bitId = new BitId({ scope: 'scope', box: 'box', name: 'name', version: 2 });
      consumerComponent = new ConsumerComponent(
        { name: 'component-name',
          box: 'box',
          version: 1,
          scope: 'myScope',
          implFile: '',
          specsFile: '',
          compilerId: bitId,
          testerId: bitId,
          dependencies: {},
          packageDependencies: {},
          impl: 'impl',
          specs: 'specs'
        });
      sinon.stub(Impl, ['load']).returns('impl');
    });

    it('should throw an error for a mismatch compiler interface', () => {
      const scope = { loadEnvironment: () => { return {}; } };
      const result = consumerComponent.build({ scope });
      expect(result).to.be.a('Promise');
      return result
        .then(() => {
          throw new Error('Promise should fail');
        })
        .catch((err) => {
          expect(err).to.eql('"scope/box/name::2" does not have a valid compiler interface, it has to return a build method');
        });
    });

    xit('should NOT throw an error for a correct compiler interface', () => {
      const scope = { loadEnvironment: () => { return { compile: () => '' }; } };
      const result = consumerComponent.build({ scope });
      expect(result).to.be.a('Promise');
      return result
        .then()
        .catch(() => {
          throw new Error('Promise should succeed');
        });
    });
  });
});
