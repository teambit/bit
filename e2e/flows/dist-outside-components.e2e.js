import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../e2e-helper';

chai.use(require('chai-fs'));

describe('dists file are written outside the components dir', function () {
  this.timeout(0);
  const helper = new Helper();
  const appJsFixture = `const barFoo = require('${helper.getRequireBitPath(
    'bar',
    'foo'
  )}'); console.log(barFoo.default());`;
  let scopeWithCompiler;
  before(() => {
    helper.setNewLocalAndRemoteScopes();
    helper.importCompiler();
    scopeWithCompiler = helper.cloneLocalScope();
  });
  after(() => {
    helper.destroyEnv();
  });
  describe('when using absolute import syntax', () => {
    /**
     * bar/foo depends on utils/is-string.
     * utils/is-string depends on utils/is-type
     *
     * Expected structure after importing bar/foo in another project
     ./components/bar/foo/index.js
     ./components/bar/foo/package.json
     ./components/bar/foo/foo.js
     ./components/.dependencies/utils/is-type/remote-scope/0.0.1/bit.json
     ./components/.dependencies/utils/is-type/remote-scope/0.0.1/index.js
     ./components/.dependencies/utils/is-type/remote-scope/0.0.1/utils/is-type.js
     ./components/.dependencies/utils/is-type/remote-scope/0.0.1/package.json
     ./components/.dependencies/utils/is-string/remote-scope/0.0.1/bit.json
     ./components/.dependencies/utils/is-string/remote-scope/0.0.1/index.js
     ./components/.dependencies/utils/is-string/remote-scope/0.0.1/utils/is-string.js
     ./components/.dependencies/utils/is-string/remote-scope/0.0.1/package.json
     ./dist/components/bar/foo/index.js
     ./dist/components/bar/foo/foo.js
     ./dist/components/bar/foo/foo.js.map
     ./dist/components/.dependencies/utils/is-type/remote-scope/0.0.1/index.js
     ./dist/components/.dependencies/utils/is-type/remote-scope/0.0.1/utils/is-type.js.map
     ./dist/components/.dependencies/utils/is-type/remote-scope/0.0.1/utils/is-type.js
     ./dist/components/.dependencies/utils/is-string/remote-scope/0.0.1/index.js
     ./dist/components/.dependencies/utils/is-string/remote-scope/0.0.1/utils/is-string.js.map
     ./dist/components/.dependencies/utils/is-string/remote-scope/0.0.1/utils/is-string.js
     */
    before(() => {
      helper.getClonedLocalScope(scopeWithCompiler);
      const isTypeFixture = "export default function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      helper.commitAllComponents();
      helper.exportAllComponents();

      helper.getClonedLocalScope(scopeWithCompiler);
      helper.importComponent('utils/is-type --dist');

      const isStringFixture = `import isType from '${helper.getRequireBitPath('utils', 'is-type')}';
 export default function isString() { return isType() +  ' and got is-string'; };`;
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.getClonedLocalScope(scopeWithCompiler);
      helper.importComponent('utils/is-string --dist');

      const fooBarFixture = `import isString from '${helper.getRequireBitPath('utils', 'is-string')}';
export default function foo() { return isString() + ' and got foo'; };`;
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.modifyFieldInBitJson('dist', { target: 'dist' });
      helper.importComponent('bar/foo --dist');
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    describe('"bit build" after updating the imported component', () => {
      before(() => {
        const fooBarFixtureV2 = `import isString from '${helper.getRequireBitPath('utils', 'is-string')}';
export default function foo() { return isString() + ' and got foo v2'; };`;
        helper.createComponent('components/bar/foo', 'foo.js', fooBarFixtureV2); // update component
        helper.addRemoteEnvironment();
        helper.build();
      });
      it('should save the dists file in the same place "bit import" saved them', () => {
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo v2');
      });
    });
  });
  /**
   * Directory structure of the author
   * bar/foo.js
   * utils/is-string.js
   * utils/is-type.js
   *
   * bar/foo depends on utils/is-string.
   * utils/is-string depends on utils/is-type
   */
  describe('when using relative import syntax', () => {
    before(() => {
      helper.getClonedLocalScope(scopeWithCompiler);
      helper.reInitRemoteScope();
      const isTypeFixture = "export default function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture =
        "import isType from './is-type.js'; export default function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      const fooBarFixture =
        "import isString from '../utils/is-string.js'; export default function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.modifyFieldInBitJson('dist', { target: 'dist' });
      helper.importComponent('bar/foo --dist');
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
  describe('bit build', () => {
    let localConsumerFiles;
    let clonedScope;
    before(() => {
      helper.getClonedLocalScope(scopeWithCompiler);
      helper.reInitRemoteScope();
      helper.createComponent(path.normalize('src/bar'), 'foo.js');
      helper.addComponent(path.normalize('src/bar/foo.js'));
      clonedScope = helper.cloneLocalScope();
    });
    describe('as author', () => {
      describe('with dist.entry populated', () => {
        before(() => {
          helper.modifyFieldInBitJson('dist', { entry: 'src' });
          helper.build();
          localConsumerFiles = helper.getConsumerFiles('*.{js,ts}', false);
        });
        it('should write the dists files without the dist.entry part', () => {
          expect(localConsumerFiles).to.include(path.join('dist', 'bar', 'foo.js'));
          expect(localConsumerFiles).to.not.include(path.join('dist', 'src', 'bar', 'foo.js'));
        });
      });
      describe('with dist.entry and dist.target populated', () => {
        before(() => {
          helper.getClonedLocalScope(clonedScope);
          helper.modifyFieldInBitJson('dist', { entry: 'src', target: 'my-dist' });
          helper.build();
          localConsumerFiles = helper.getConsumerFiles('*.{js,ts}', false);
        });
        it('should write the dists files inside dist.target dir and without the dist.entry part', () => {
          expect(localConsumerFiles).to.include(path.join('my-dist', 'bar', 'foo.js'));
          expect(localConsumerFiles).to.not.include(path.join('my-dist', 'src', 'bar', 'foo.js'));
          expect(localConsumerFiles).to.not.include(path.join('dist', 'src', 'bar', 'foo.js'));
          expect(localConsumerFiles).to.not.include(path.join('dist', 'bar', 'foo.js'));
        });
      });
    });
    describe('as imported', () => {
      before(() => {
        helper.getClonedLocalScope(clonedScope);
        helper.commitAllComponents();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
        clonedScope = helper.cloneLocalScope();
      });
      describe('with dist.entry populated', () => {
        before(() => {
          helper.modifyFieldInBitJson('dist', { entry: 'src' });
          helper.build('bar/foo');
          localConsumerFiles = helper.getConsumerFiles('*.{js,ts}', false);
        });
        it('should write the dists files without the dist.entry part and without the originallySharedDirectory part', () => {
          expect(localConsumerFiles).to.include(path.join('dist', 'components', 'bar', 'foo', 'foo.js'));
          expect(localConsumerFiles).to.not.include(path.join('dist', 'components', 'bar', 'foo', 'src', 'foo.js')); // dist.entry
          expect(localConsumerFiles).to.not.include(path.join('dist', 'components', 'bar', 'foo', 'bar', 'foo.js')); // originallyShared
          expect(localConsumerFiles).to.not.include(
            path.join('dist', 'components', 'bar', 'foo', 'bar', 'src', 'foo.js')
          ); // both
        });
      });
      describe('with dist.entry and dist.target populated', () => {
        before(() => {
          helper.getClonedLocalScope(clonedScope);
          helper.modifyFieldInBitJson('dist', { entry: 'src', target: 'my-dist' });
          helper.build('bar/foo');
          localConsumerFiles = helper.getConsumerFiles('*.{js,ts}', false);
        });
        it('should write the dists files inside dist.target dir and without the dist.entry part', () => {
          expect(localConsumerFiles).to.include(path.join('my-dist', 'components', 'bar', 'foo', 'foo.js'));
          expect(localConsumerFiles).to.not.include(path.join('dist', 'components', 'bar', 'foo', 'foo.js')); // default dist.target
          expect(localConsumerFiles).to.not.include(path.join('my-dist', 'components', 'bar', 'foo', 'src', 'foo.js')); // dist.entry
          expect(localConsumerFiles).to.not.include(path.join('my-dist', 'components', 'bar', 'foo', 'bar', 'foo.js')); // originallyShared
          expect(localConsumerFiles).to.not.include(
            path.join('my-dist', 'components', 'bar', 'foo', 'bar', 'src', 'foo.js')
          ); // both
        });
      });
    });
  });
  describe('when some dependencies have dists and some do not have', () => {
    /**
     * utils/is-type has dists
     * utils/is-string doesn't have dists
     * bar/foo has dists
     */
    before(() => {
      helper.getClonedLocalScope(scopeWithCompiler);
      const isTypeFixture = "export default function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      helper.commitAllComponents();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-type --dist');

      const isStringFixture = `const isType = require('${helper.getRequireBitPath(
        'utils',
        'is-type'
      )}'); module.exports = function isString() { return isType.default() +  ' and got is-string'; };`;
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.getClonedLocalScope(scopeWithCompiler);
      helper.importComponent('utils/is-string --dist');

      const fooBarFixture = `import isString from '${helper.getRequireBitPath('utils', 'is-string')}';
export default function foo() { return isString() + ' and got foo'; };`;
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.modifyFieldInBitJson('dist', { target: 'dist' });
      helper.importComponent('bar/foo --dist');
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    describe('"bit build" of a component with no compiler-id (when dists are outside the components dir)', () => {
      before(() => {
        fs.removeSync(path.join(helper.localScopePath, 'dist'));
        helper.build('utils/is-string');
      });
      it('should save the source files as dists files', () => {
        expect(
          path.join(helper.localScopePath, 'dist', 'components', '.dependencies', 'utils', 'is-string')
        ).to.be.a.path();
      });
    });
  });
});
