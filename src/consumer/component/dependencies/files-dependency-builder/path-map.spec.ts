import { expect } from 'chai';

import pathMapFixture from '../../../../../fixtures/path-map.json';
import { getPathMapWithLinkFilesData } from './path-map';

describe('path-map', () => {
  describe('updatePathMapWithLinkFilesData', () => {
    it('should return an empty array for an empty pathMap', () => {
      const results = getPathMapWithLinkFilesData([]);
      expect(results).to.have.lengthOf(0);
    });
    it('should throw TypeError for a non array input', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(() => getPathMapWithLinkFilesData()).to.throw(TypeError);
    });
    it('should return the same pathMap when there are no link-files involved', () => {
      const fixture = [{ file: 'bar/foo.js', dependencies: [] }];
      const results = getPathMapWithLinkFilesData(fixture);
      expect(results).to.deep.equal(fixture);
    });
    describe('a file bar/foo require dependencies isString and isArray through two levels of link files', () => {
      let results;
      let barFooDependency;
      before(() => {
        results = getPathMapWithLinkFilesData(pathMapFixture);
        const barFoo = results.find((f) => f.file === 'bar/foo.js');
        barFooDependency = barFoo.dependencies[0];
      });
      it('should mark the dependency as a linkFile', () => {
        expect(barFooDependency).to.have.property('linkFile');
        expect(barFooDependency.linkFile).to.be.true;
      });
      it('should add a new attribute realDependencies to the dependency', () => {
        expect(barFooDependency).to.have.property('realDependencies');
      });
      it('realDependencies should include the final dependencies skipping multiple links in between', () => {
        expect(barFooDependency.realDependencies).to.have.lengthOf(2);
        // ensures that it skips both: utils/index.js and utils/is-string/index.js
        expect(barFooDependency.realDependencies[0].file).to.equal('utils/is-string/is-string.js');
        // ensures that it skips both: utils/index.js and utils/is-array/index.js
        expect(barFooDependency.realDependencies[1].file).to.equal('utils/is-array/is-array.js');
      });
      it('realDependencies should have the importSpecifiers.mainFile same as the original file', () => {
        const isStringSpecifier = barFooDependency.importSpecifiers.find((i) => i.name === 'isString');
        const realDepIsStringSpecifier = barFooDependency.realDependencies[0].importSpecifiers[0];
        expect(realDepIsStringSpecifier.mainFile.name).to.equal(isStringSpecifier.name);
        expect(realDepIsStringSpecifier.mainFile.isDefault).to.equal(isStringSpecifier.isDefault);
      });
      it('realDependencies should have the importSpecifiers.linkFile same as the last link file', () => {
        const lastLinkFile = 'utils/is-string/index.js';
        const lastLink = results.find((f) => f.file === lastLinkFile);
        const lastLinkSpecifier = lastLink.dependencies[0].importSpecifiers[0];
        const realDepIsStringSpecifier = barFooDependency.realDependencies[0].importSpecifiers[0];
        expect(realDepIsStringSpecifier.linkFile.name).to.equal(lastLinkSpecifier.name);
        expect(realDepIsStringSpecifier.linkFile.isDefault).to.equal(lastLinkSpecifier.isDefault);
      });
    });
  });
});
