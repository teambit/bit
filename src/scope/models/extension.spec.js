import { expect } from 'chai';
import Extension from './extension';

const fixtureA = { name: 'A', value: 1, type: 'numeric' };
const fixtureB = { name: 'B', value: 'b', type: 'string' };
const fixtureC = { name: 'C', value: { key: 'myValue' }, type: 'object' };

describe.only('extension', () => {
  describe('sort', () => {
    let extension;
    before(() => {
      const fields = [fixtureB, fixtureA, fixtureC];
      extension = new Extension(fields);
      extension.sort();
    });
    it('should sort the extension fields by their names', () => {
      const fields = extension.data;
      expect(fields[0]).to.deep.equal(fixtureA);
      expect(fields[1]).to.deep.equal(fixtureB);
      expect(fields[2]).to.deep.equal(fixtureC);
    });
  });
  describe('validate', () => {
    let extension;
    it('should throw an error when the name field is missing', () => {
      extension = new Extension([{ value: 'A', type: 'string' }]);
      expect(extension.validate).to.throw();
    });
    it('should throw an error when the value field is missing', () => {
      extension = new Extension([{ name: 'A', type: 'string' }]);
      expect(extension.validate).to.throw();
    });
    it('should throw an error when the type field is missing', () => {
      extension = new Extension([{ name: 'A', value: 'A' }]);
      expect(extension.validate).to.throw();
    });
  });
});
