import { expect } from 'chai';
import R from 'ramda';

// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import dependenciesFixture from '../../../../fixtures/dependencies-fixture.json';
import { BitId } from '../../../bit-id';
import { Dependencies } from './';

describe('Dependencies', () => {
  describe('validate()', () => {
    let dependencies;
    let validateFunc;
    beforeEach(() => {
      const dependenciesFixtureCloned = R.clone(dependenciesFixture);
      dependenciesFixtureCloned.forEach((d) => (d.id = BitId.parse(d.id)));
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
    it('should throw when a dependency is missing relativePaths', () => {
      delete dependencies.dependencies[0].relativePaths;
      expect(validateFunc).to.throw('is missing relativePaths');
    });
    it('should throw when a dependency has an extra attribute other than id and relativePaths', () => {
      dependencies.dependencies[0].extra = 'should not be there!';
      expect(validateFunc).to.throw('has an undetected property "extra"');
    });
    it('should throw when relativePaths is not an array', () => {
      dependencies.dependencies[0].relativePaths = {};
      expect(validateFunc).to.throw('to be array, got object');
    });
    it('should throw when relativePaths.sourceRelativePath is missing', () => {
      delete dependencies.dependencies[0].relativePaths[0].sourceRelativePath;
      expect(validateFunc).to.throw('relativePaths.sourceRelativePath is missing');
    });
    it('should throw when relativePaths.destinationRelativePath is missing', () => {
      delete dependencies.dependencies[0].relativePaths[0].destinationRelativePath;
      expect(validateFunc).to.throw('relativePaths.destinationRelativePath is missing');
    });
    it('should throw when a relativePaths has an extra attribute', () => {
      dependencies.dependencies[0].relativePaths[0].extra = 'should not be there!';
      expect(validateFunc).to.throw('undetected property of relativePaths "extra"');
    });
    it('should throw when relativePaths.isCustomResolveUsed is true but importSource is missing', () => {
      delete dependencies.dependencies[0].relativePaths[0].importSource;
      expect(validateFunc).to.throw('missing relativePath.importSource');
    });
    it('should not throw when both relativePaths.isCustomResolveUsed and relativePaths.importSource are missing', () => {
      delete dependencies.dependencies[0].relativePaths[0].isCustomResolveUsed;
      delete dependencies.dependencies[0].relativePaths[0].importSource;
      expect(validateFunc).to.not.throw();
    });
    it('should throw when relativePaths.importSpecifiers is not an array', () => {
      dependencies.dependencies[0].relativePaths[0].importSpecifiers = {};
      expect(validateFunc).to.throw('to be array, got object');
    });
    it('should throw when importSpecifier is not an object', () => {
      dependencies.dependencies[0].relativePaths[0].importSpecifiers[0] = [];
      expect(validateFunc).to.throw('to be object, got array');
    });
    it('should throw when relativePaths.importSpecifiers has extra attributes', () => {
      dependencies.dependencies[0].relativePaths[0].importSpecifiers[0].extra = 'should not be there!';
      expect(validateFunc).to.throw('undetected property of importSpecifier "extra"');
    });
    it('should throw when importSpecifier.mainFile is missing', () => {
      delete dependencies.dependencies[0].relativePaths[0].importSpecifiers[0].mainFile;
      expect(validateFunc).to.throw('mainFile property is missing');
    });
    it('should throw when importSpecifier.mainFile.isDefault is missing', () => {
      delete dependencies.dependencies[0].relativePaths[0].importSpecifiers[0].mainFile.isDefault;
      expect(validateFunc).to.throw('expected properties of importSpecifier.mainFile "isDefault,name", got "name"');
    });
    it('should throw when importSpecifier.mainFile.name is missing', () => {
      delete dependencies.dependencies[0].relativePaths[0].importSpecifiers[0].mainFile.isDefault;
      expect(validateFunc).to.throw('expected properties of importSpecifier.mainFile "isDefault,name", got "name"');
    });
    it('should throw when importSpecifier.mainFile has an extra attribute', () => {
      dependencies.dependencies[0].relativePaths[0].importSpecifiers[0].mainFile.extra = 'invalid';
      expect(validateFunc).to.throw(
        'expected properties of importSpecifier.mainFile "isDefault,name", got "extra,isDefault,name"'
      );
    });
  });
});
