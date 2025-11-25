import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { cloneDeep } from 'lodash';
import { Dependencies } from './';

const dependenciesFixture = [
  {
    id: '81j4te29-remote/utils/is-string@0.0.1',
    relativePaths: [], // Always empty for Harmony components
  },
];

describe('Dependencies', () => {
  describe('validate()', () => {
    let dependencies;
    let validateFunc;
    beforeEach(() => {
      const dependenciesFixtureCloned = cloneDeep(dependenciesFixture);
      // @ts-expect-error we want to change the type here explicitly
      dependenciesFixtureCloned.forEach((d) => (d.id = ComponentID.fromString(d.id)));
      // @ts-expect-error that's good enough for testing
      dependencies = new Dependencies(dependenciesFixtureCloned);
      validateFunc = () => dependencies.validate();
    });
    it('should not throw when it has a valid dependencies array', () => {
      expect(validateFunc).to.not.throw();
    });
    it('should throw when dependencies are not array', () => {
      dependencies.dependencies = {};
      expect(validateFunc).to.throw('to be array, got object');
    });
    it('should throw when an individual dependency is not an object', () => {
      dependencies.dependencies[0] = 12;
      expect(validateFunc).to.throw('to be object, got number');
    });
    it('should throw when a dependency is missing id', () => {
      delete dependencies.dependencies[0].id;
      expect(validateFunc).to.throw('is missing ID');
    });
    // relativePaths validation tests removed - relativePaths is always empty for Harmony components
    // and validated at the Version level
    it('should throw when a dependency has an extra attribute other than id and relativePaths', () => {
      dependencies.dependencies[0].extra = 'should not be there!';
      expect(validateFunc).to.throw('has an undetected property "extra"');
    });
    it('should throw when a dependency has the same id as the component', () => {
      const id = ComponentID.fromString(dependenciesFixture[0].id);
      validateFunc = () => dependencies.validate(id);
      expect(validateFunc).to.throw('one of the dependencies has the same id as the component');
    });
  });
});
