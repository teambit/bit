import path from 'path';
import { expect } from 'chai';
import * as buildTree from './build-tree';

const fixtures = `${__dirname}/../../fixtures`;
const precinctFixtures = path.join(fixtures, 'precinct');
const buildTreeFixtures = path.join(fixtures, 'build-tree');

describe('buildTree', () => {
  describe('getDependencyTree', () => {
    const dependencyTreeParams = {
      baseDir: '.',
      consumerPath: __dirname,
      filePaths: [],
      bindingPrefix: '@bit',
      resolveModulesConfig: undefined
    };
    it('when no files are passed should return an empty tree', async () => {
      const results = await buildTree.getDependencyTree(dependencyTreeParams);
      expect(results).to.deep.equal({ tree: {} });
    });
    it('when unsupported files are passed should return them with no dependencies', async () => {
      dependencyTreeParams.filePaths = [`${fixtures}/unsupported-file.pdf`];
      const results = await buildTree.getDependencyTree(dependencyTreeParams);
      expect(results.tree).to.deep.equal({ 'fixtures/unsupported-file.pdf': {} });
    });
    it('when supported and unsupported files are passed should return them all', async () => {
      dependencyTreeParams.filePaths = [`${fixtures}/unsupported-file.pdf`, `${precinctFixtures}/es6.js`];
      const results = await buildTree.getDependencyTree(dependencyTreeParams);
      expect(results.tree).to.have.property('fixtures/unsupported-file.pdf');
      expect(results.tree).to.have.property('fixtures/precinct/es6.js');
    });
    it('when a file has parsing error it should add the file to the tree with the error instance', async () => {
      dependencyTreeParams.filePaths = [`${precinctFixtures}/unparseable.js`];
      const results = await buildTree.getDependencyTree(dependencyTreeParams);
      const unParsedFile = 'fixtures/precinct/unparseable.js';
      expect(results.tree).to.have.property(unParsedFile);
      expect(results.tree[unParsedFile]).to.have.property('error');
      expect(results.tree[unParsedFile].error).to.be.instanceof(Error);
    });
    describe('when a dependency of dependency has parsing error', () => {
      let results;
      before(async () => {
        dependencyTreeParams.filePaths = [`${buildTreeFixtures}/a.js`, `${buildTreeFixtures}/b.js`];
        results = await buildTree.getDependencyTree(dependencyTreeParams);
      });
      it('should add all the files to the tree', async () => {
        expect(results.tree).to.have.property('fixtures/build-tree/a.js');
        expect(results.tree).to.have.property('fixtures/build-tree/b.js');
        expect(results.tree).to.have.property('fixtures/build-tree/unparsed.js');
      });
      it('should not add the error to the files without parsing error', () => {
        expect(results.tree['fixtures/build-tree/a.js']).to.not.have.property('error');
        expect(results.tree['fixtures/build-tree/b.js']).to.not.have.property('error');
      });
      it('should add the parsing error to the un-parsed file', () => {
        expect(results.tree['fixtures/build-tree/unparsed.js']).to.have.property('error');
        expect(results.tree['fixtures/build-tree/unparsed.js'].error).to.be.instanceof(Error);
      });
    });
    describe('missing dependencies', () => {
      let results;
      const missingDepsFile = 'fixtures/missing-deps.js';
      before(async () => {
        dependencyTreeParams.filePaths = [`${fixtures}/missing-deps.js`];
        results = await buildTree.getDependencyTree(dependencyTreeParams);
        expect(results.tree).to.have.property(missingDepsFile);
        expect(results.tree[missingDepsFile]).to.have.property('missing');
      });
      it('it should add the missing dependency to the missing section in the tree', async () => {
        expect(results.tree[missingDepsFile].missing).to.have.property('files');
        expect(results.tree[missingDepsFile].missing.files[0]).to.equal('../non-exist-dep');
      });
      it('it should add the missing package to the missing section in the tree', async () => {
        expect(results.tree[missingDepsFile].missing).to.have.property('packages');
        expect(results.tree[missingDepsFile].missing.packages[0]).to.equal('non-exist-package');
      });
    });
  });
});
