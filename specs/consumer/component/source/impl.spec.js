import fs from 'fs';
import { expect } from 'chai';
import sinon from 'sinon';
import Impl from '../../../../src/consumer/component/sources/impl';

describe('Impl', () => {
  describe('create', () => {
    it('should use a default template when failed to get a custom one', () => {
      const impl = Impl.create('my-component');
      expect(impl).to.be.an.instanceof(Impl);
      expect(impl.src).to.contain('myComponent');
    });
  });
});
