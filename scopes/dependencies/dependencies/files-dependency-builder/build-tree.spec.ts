import { expect } from 'chai';
import path from 'path';

import * as buildTree from './build-tree';

const fixtures = `${__dirname}/fixtures`;
const precinctFixtures = path.join(fixtures, 'precinct');
const buildTreeFixtures = path.join(fixtures, 'build-tree');
const fixturesInExpect = `scopes/dependencies/dependencies/files-dependency-builder/fixtures`;

describe('buildTree', () => {
  describe('getDependencyTree', () => {
    const filePaths: string[] = [];
    let visited: any;
    const dependencyTreeParams = {
      componentDir: '.',
      workspacePath: __dirname,
      filePaths,
      visited,
    };
    it('when no files are passed should return an empty tree', async () => {
      const results = await buildTree.getDependencyTree(dependencyTreeParams);
      expect(results).to.deep.equal({ tree: {} });
    });
    it('when unsupported files are passed should return them with no dependencies', async () => {
      dependencyTreeParams.filePaths = [`${fixtures}/unsupported-file.pdf`];
      const results = await buildTree.getDependencyTree(dependencyTreeParams);
      expect(results.tree[`${fixturesInExpect}/unsupported-file.pdf`].isEmpty()).to.be.true;
    });
    it('when supported and unsupported files are passed should return them all', async () => {
      dependencyTreeParams.filePaths = [`${fixtures}/unsupported-file.pdf`, `${precinctFixtures}/es6.js`];
      const results = await buildTree.getDependencyTree(dependencyTreeParams);
      expect(results.tree).to.have.property(`${fixturesInExpect}/unsupported-file.pdf`);
      expect(results.tree).to.have.property(`${fixturesInExpect}/precinct/es6.js`);
    });
    // todo: fix this one and one below once we have a way to ignore some component files from compiling/parsing altogether
    // uncomment unparseable.js
    it.skip('when a js file has parsing error it should add the file to the tree with the error instance', async () => {
      dependencyTreeParams.filePaths = [`${precinctFixtures}/unparseable.js`];
      const results = await buildTree.getDependencyTree(dependencyTreeParams);
      const unParsedFile = `${fixturesInExpect}/precinct/unparseable.js`;
      expect(results.tree).to.have.property(unParsedFile);
      expect(results.tree[unParsedFile]).to.have.property('error');
      expect(results.tree[unParsedFile].error).to.be.instanceof(Error);
    });
    it.skip('when a js file has parsing error and it retrieved from the cache it should add the file to the tree with the error instance', async () => {
      dependencyTreeParams.filePaths = [`${precinctFixtures}/unparseable.js`];
      dependencyTreeParams.visited = {};
      const results = await buildTree.getDependencyTree(dependencyTreeParams);
      const unParsedFile = `${fixturesInExpect}/precinct/unparseable.js`;
      expect(results.tree).to.have.property(unParsedFile);
      expect(results.tree[unParsedFile]).to.have.property('error');
      expect(results.tree[unParsedFile].error).to.be.instanceof(Error);

      // second time, this time it fetches from the cache (visited object)
      const resultsCached = await buildTree.getDependencyTree(dependencyTreeParams);
      expect(resultsCached.tree).to.have.property(unParsedFile);
      expect(resultsCached.tree[unParsedFile]).to.have.property('error');
      expect(resultsCached.tree[unParsedFile].error).to.be.instanceof(Error);
    });
    // todo: fix this one once we have a way to ignore some component files from compiling/parsing altogether
    // uncomment fixtures/build-tree/unparsed.js file
    describe.skip('when a dependency of dependency has parsing error', () => {
      let results;
      before(async () => {
        dependencyTreeParams.filePaths = [`${buildTreeFixtures}/a.js`, `${buildTreeFixtures}/b.js`];
        results = await buildTree.getDependencyTree(dependencyTreeParams);
      });
      it('should add all the files to the tree', async () => {
        expect(results.tree).to.have.property(`${fixturesInExpect}/build-tree/a.js`);
        expect(results.tree).to.have.property(`${fixturesInExpect}/build-tree/b.js`);
        expect(results.tree).to.have.property(`${fixturesInExpect}/build-tree/unparsed.js`);
      });
      it('should not add the error to the files without parsing error', () => {
        expect(results.tree[`${fixturesInExpect}/build-tree/a.js`].error).to.be.undefined;
        expect(results.tree[`${fixturesInExpect}/build-tree/b.js`].error).to.be.undefined;
      });
      it('should add the parsing error to the un-parsed file', () => {
        expect(results.tree[`${fixturesInExpect}/build-tree/unparsed.js`]).to.have.property('error');
        expect(results.tree[`${fixturesInExpect}/build-tree/unparsed.js`].error).to.be.instanceof(Error);
      });
    });
    // skip temporarily
    describe.skip('missing dependencies', () => {
      let results;
      const missingDepsFile = 'fixtures/missing-deps.js';
      before(async () => {
        dependencyTreeParams.filePaths = [missingDepsFile];
        results = await buildTree.getDependencyTree(dependencyTreeParams);
        expect(results.tree).to.have.property(`${fixturesInExpect}/missing-deps.js`);
        expect(results.tree[`${fixturesInExpect}/missing-deps.js`]).to.have.property('missing');
      });
      it('it should add the missing dependency to the missing section in the tree', async () => {
        expect(results.tree[`${fixturesInExpect}/missing-deps.js`].missing).to.have.property('files');
        expect(results.tree[`${fixturesInExpect}/missing-deps.js`].missing.files[0]).to.equal('../non-exist-dep');
      });
      it('it should add the missing package to the missing section in the tree', async () => {
        expect(results.tree[`${fixturesInExpect}/missing-deps.js`].missing).to.have.property('packages');
        expect(results.tree[`${fixturesInExpect}/missing-deps.js`].missing.packages[0]).to.equal('non-exist-package');
      });
    });
    describe('tree shaking with cycle', () => {
      describe('when a file imports from itself', () => {
        let results;
        before(async () => {
          dependencyTreeParams.filePaths = [`${buildTreeFixtures}/tree-shaking-cycle/self-cycle.js`];
          results = await buildTree.getDependencyTree(dependencyTreeParams);
        });
        it('should not throw an error and should remove itself from the dependencies files', () => {
          const file = `${fixturesInExpect}/build-tree/tree-shaking-cycle/self-cycle.js`;
          expect(results.tree[file].files).to.be.an('array').and.empty;
        });
      });
      describe('cycle with multiple files', () => {
        let results;
        before(async () => {
          dependencyTreeParams.filePaths = [`${buildTreeFixtures}/tree-shaking-cycle/foo.js`];
          results = await buildTree.getDependencyTree(dependencyTreeParams);
        });
        it('should not recognize the cycle dependencies as link files', () => {
          const file = `${fixturesInExpect}/build-tree/tree-shaking-cycle/foo.js`;
          expect(results.tree[file].files).to.be.an('array').and.have.lengthOf(1);
          const indexDep = results.tree[file].files[0];
          expect(indexDep.file).to.equal(`${fixturesInExpect}/build-tree/tree-shaking-cycle/index.js`);
        });
      });
    });
    describe('fileA imports varX from fileB, fileB imports varX from fileC but not export it', () => {
      let results;
      before(async () => {
        dependencyTreeParams.filePaths = [`${buildTreeFixtures}/not-link-file/file-a.js`];
        results = await buildTree.getDependencyTree(dependencyTreeParams);
      });
      it('should not mark fileB as a link file', () => {
        const fileA = `${fixturesInExpect}/build-tree/not-link-file/file-a.js`;
        expect(results.tree[fileA].files).to.be.an('array').with.lengthOf(1);
        const fileBDep = results.tree[fileA].files[0];
        expect(fileBDep).to.not.have.property('isLink');
      });
    });
  });
});
