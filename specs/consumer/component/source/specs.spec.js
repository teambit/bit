import fs from 'fs';
import { expect } from 'chai';
import sinon from 'sinon';
import Specs from '../../../../src/consumer/component/sources/specs';

describe('Specs', () => {
  describe('create', () => {
    it('should use a default template when failed to get a custom one', () => {
      const specs = Specs.create('my-component');
      expect(specs).to.be.an.instanceof(Specs);
      expect(specs.src).to.contain('myComponent');
    });
  });
});
