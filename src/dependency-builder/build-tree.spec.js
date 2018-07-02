import path from 'path';
import { expect } from 'chai';
import * as buildTree from './build-tree';

const fixtures = `${__dirname}/../../fixtures`;
const precinctFixtures = path.join(fixtures, 'precinct');

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
      dependencyTreeParams.filePaths = ['a.pdf'];
      const results = await buildTree.getDependencyTree(dependencyTreeParams);
      expect(results.tree).to.deep.equal({ 'a.pdf': {} });
    });
    it('when supported and unsupported files are passed should return them all', async () => {
      dependencyTreeParams.filePaths = ['a.pdf', `${precinctFixtures}/es6.js`];
      const results = await buildTree.getDependencyTree(dependencyTreeParams);
      expect(results.tree).to.have.property('a.pdf');
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
