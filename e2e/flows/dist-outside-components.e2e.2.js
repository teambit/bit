import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../e2e-helper';
import { statusFailureMsg } from '../../src/cli/commands/public-cmds/status-cmd';

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
  describe('when using "module path" import syntax', () => {
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
      helper.createFile('utils', 'is-type.js', isTypeFixture);
      helper.addComponentUtilsIsType();
      helper.tagAllComponents();
      helper.exportAllComponents();

      helper.getClonedLocalScope(scopeWithCompiler);
      helper.importComponent('utils/is-type');

      const isStringFixture = `import isType from '${helper.getRequireBitPath('utils', 'is-type')}';
 export default function isString() { return isType() +  ' and got is-string'; };`;
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.getClonedLocalScope(scopeWithCompiler);
      helper.importComponent('utils/is-string');

      const fooBarFixture = `import isString from '${helper.getRequireBitPath('utils', 'is-string')}';
export default function foo() { return isString() + ' and got foo'; };`;
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.modifyFieldInBitJson('dist', { target: 'dist' });
      helper.importComponent('bar/foo');
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
        helper.createFile('components/bar/foo', 'foo.js', fooBarFixtureV2); // update component
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
  describe('when using "relative path" import syntax', () => {
    let clonedScope;
    before(() => {
      helper.getClonedLocalScope(scopeWithCompiler);
      helper.reInitRemoteScope();
      const isTypeFixture = "export default function isType() { return 'got is-type'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixture);
      helper.addComponentUtilsIsType();
      const isStringFixture =
        "import isType from './is-type.js'; export default function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();
      const fooBarFixture =
        "import isString from '../utils/is-string.js'; export default function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();
      clonedScope = helper.cloneLocalScope();
    });
    describe('as author', () => {
      // this tests also the node_modules generated link for authored component. See similar test without dist in link.e2e file.
      before(() => {
        helper.modifyFieldInBitJson('dist', { target: 'dist', entry: 'src' });
        helper.build();
        helper.tagAllComponents();
        helper.exportAllComponents();
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
    describe('as imported', () => {
      let scopeAfterImport;
      before(() => {
        helper.getClonedLocalScope(clonedScope);
        helper.tagAllComponents();
        helper.reInitRemoteScope();
        helper.addRemoteScope();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.modifyFieldInBitJson('dist', { target: 'dist' });
        helper.importComponent('bar/foo');
        scopeAfterImport = helper.cloneLocalScope();
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
      describe('when adding an external package', () => {
        // the node-modules of the dist should handle both, symlinks to the external packages and actual links
        before(() => {
          helper.runCmd(
            'npm install --save lodash.isstring',
            path.join(helper.localScopePath, 'components', 'bar', 'foo')
          );
          helper.runCmd('bit link'); // after npm install, all @bit symlinks are deleted, we have to re-link them.
          const fooBarFixtureV2 = `import isString from '${helper.getRequireBitPath('utils', 'is-string')}';
import lodashIsString from 'lodash.isstring';
lodashIsString();
export default function foo() { return isString() + ' and got foo v2'; };`;
          helper.createFile('components/bar/foo/bar', 'foo.js', fooBarFixtureV2); // update component
          helper.addRemoteEnvironment();
          helper.build();
        });
        it('should symlink the external packages as well into dist', () => {
          expect(
            path.join(helper.localScopePath, 'dist', 'components', 'bar', 'foo', 'node_modules', 'lodash.isstring')
          ).to.be.a.path();
        });
        it('should be able to require its direct dependency and print results from all dependencies', () => {
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo v2');
        });
        describe('after importing a component with external packages', () => {
          before(() => {
            helper.tagAllComponents();
            helper.exportAllComponents();
            helper.reInitLocalScope();
            helper.addRemoteScope();
            helper.modifyFieldInBitJson('dist', { target: 'dist' });
            helper.importComponent('bar/foo');
          });
          it('should be able to require its direct dependency and print results from all dependencies', () => {
            fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
            const result = helper.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo v2');
          });
        });
      });
      describe('removing the component', () => {
        before(() => {
          helper.getClonedLocalScope(scopeAfterImport);
          helper.removeComponent('bar/foo', '-s');
        });
        it('should remove the dist directory as well', () => {
          expect(path.join(helper.localScopePath, 'dist/components/bar')).to.not.be.a.path();
        });
      });
      describe('importing all components and then deleting the dist directory', () => {
        before(() => {
          helper.getClonedLocalScope(scopeAfterImport);
          helper.importComponent('utils/is-string');
          helper.importComponent('utils/is-type');
          helper.addRemoteEnvironment();
          helper.deletePath('dist');
        });
        it('should be able to build with no errors', () => {
          // previously it was showing an error "unable to link remote/utils/is-type@0.0.1, the file /workspace/dist/components/utils/is-type is missing from the filesystem."
          const func = () => helper.build('--no-cache');
          expect(func).to.not.throw();
        });
      });
    });
  });
  describe('bit build', () => {
    let localConsumerFiles;
    let clonedScope;
    before(() => {
      helper.getClonedLocalScope(scopeWithCompiler);
      helper.reInitRemoteScope();
      helper.createFile(path.normalize('src/bar'), 'foo.js');
      helper.addComponent('src/bar/foo.js', { i: 'bar/foo' });
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
        helper.tagAllComponents();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.addRemoteEnvironment();
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
      helper.reInitRemoteScope();
      const isTypeFixture = "export default function isType() { return 'got is-type'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixture);
      helper.addComponentUtilsIsType();
      helper.tagAllComponents();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-type');

      const isStringFixture = `const isType = require('${helper.getRequireBitPath(
        'utils',
        'is-type'
      )}'); module.exports = function isString() { return isType.default() +  ' and got is-string'; };`;
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.getClonedLocalScope(scopeWithCompiler);
      helper.importComponent('utils/is-string');

      const fooBarFixture = `import isString from '${helper.getRequireBitPath('utils', 'is-string')}';
export default function foo() { return isString() + ' and got foo'; };`;
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.modifyFieldInBitJson('dist', { target: 'dist' });
      helper.importComponent('bar/foo');
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
  describe('when using custom-module-resolution syntax', () => {
    before(() => {
      helper.getClonedLocalScope(scopeWithCompiler);
      helper.reInitRemoteScope();
      const bitJson = helper.readBitJson();
      bitJson.resolveModules = { modulesDirectories: ['src'] };
      helper.writeBitJson(bitJson);

      const isTypeFixture = "export default function isType() { return 'got is-type'; };";
      helper.createFile('src/utils', 'is-type.js', isTypeFixture);
      helper.addComponent('src/utils/is-type.js', { i: 'utils/is-type' });
      const isStringFixture = `import isType from 'utils/is-type';
 export default function isString() { return isType() +  ' and got is-string'; };`;
      helper.createFile('src/utils', 'is-string.js', isStringFixture);
      helper.addComponent('src/utils/is-string.js', { i: 'utils/is-string' });
      const fooBarFixture = `import isString from 'utils/is-string';
export default function foo() { return isString() + ' and got foo'; };`;
      helper.createFile('src/bar', 'foo.js', fooBarFixture);
      helper.addComponent('src/bar/foo.js', { i: 'bar/foo' });

      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.modifyFieldInBitJson('dist', { target: 'dist' });
      helper.importComponent('bar/foo');
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    it('should not indicate that missing dependencies', () => {
      const status = helper.runCmd('bit status');
      expect(status).to.not.have.string(statusFailureMsg);
      expect(status).to.not.have.string('modified');
    });
    describe('"bit build" after updating the imported component', () => {
      before(() => {
        const fooBarFixtureV2 = `import isString from 'utils/is-string';
export default function foo() { return isString() + ' and got foo v2'; };`;
        helper.createFile('components/bar/foo', 'foo.js', fooBarFixtureV2); // update component
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
  describe('imported require authored component', () => {
    function importRequireAuthored(distIsOutside = true) {
      describe(`when distIsOutside ${distIsOutside.toString()}`, () => {
        before(() => {
          helper.getClonedLocalScope(scopeWithCompiler);
          helper.reInitRemoteScope();
          helper.createFile('utils', 'is-string.js', '');
          helper.addComponentUtilsIsString();
          helper.tagAllComponents();
          helper.exportAllComponents();
          helper.getClonedLocalScope(scopeWithCompiler);
          if (distIsOutside) {
            helper.modifyFieldInBitJson('dist', { target: 'dist', entry: 'src' });
          }
          helper.importComponent('utils/is-string');

          const isTypeFixture = "export default function isType() { return 'got is-type'; };";
          helper.createFile('utils', 'is-type.js', isTypeFixture);
          helper.addComponentUtilsIsType();
          helper.tagAllComponents();
          helper.exportAllComponents();

          const isStringFixture = `import isType from '${helper.getRequireBitPath('utils', 'is-type')}';
     export default function isString() { return isType() +  ' and got is-string'; };`;
          helper.createFile('components/utils/is-string', 'is-string.js', isStringFixture);
        });
        it('bit status should not show missing links', () => {
          // a previous bug showed "missing links" here because the package.json in node_modules
          // was pointing to a non-exist main file.
          const status = helper.status();
          expect(status).to.not.have.string(statusFailureMsg);
          expect(status).to.have.string('ok');
        });
        it('bit build should not throw an error', () => {
          expect(() => helper.build()).to.not.throw();
        });
        it('bit link should not throw an error', () => {
          expect(() => helper.runCmd('bit link')).to.not.throw();
        });
        it('bit link should not generate symlinks from an imported component to the workspace root dir', () => {
          const output = helper.runCmd('bit link');
          expect(output).to.not.have.string('original path: .,');
          expect(output).to.not.have.string('original path: dist,');
          const link = path.join(
            helper.localScopePath,
            `components/utils/is-string/node_modules/@bit/${helper.remoteScope}.utils.is-type`
          );
          expect(link).to.not.be.a.path();
        });
        it('bit link should not generate symlinks from an imported component to the root dist', () => {
          const output = helper.runCmd('bit link');
          expect(output).to.not.have.string('original path: dist,');
          const distLink = path.join(
            helper.localScopePath,
            `dist/components/utils/is-string/node_modules/@bit/${helper.remoteScope}.utils.is-type`
          );
          expect(distLink).to.not.be.a.path();
        });
        describe('running bit tag', () => {
          before(() => {
            helper.initNpm(); // so then it has package.json with version 1.0.0 (needed for #1698)
            helper.tagAllComponents();
          });
          it('bit status should not show modified', () => {
            const output = helper.status();
            expect(output).to.not.have.string('modified');
          });
          it('should tag with the correct version of the author component from .bitmap and not use the root package.json version', () => {
            const cmp = helper.catComponent(`${helper.remoteScope}/utils/is-string@latest`);
            expect(cmp.dependencies[0].id.version).to.equal('0.0.1');
            // a previous bug showed it as 1.0.0, see #1698
          });
        });
      });
    }
    importRequireAuthored(false);
    importRequireAuthored(true);
  });
});

describe('dist-outside-components when no compiler has been set up', function () {
  this.timeout(0);
  const helper = new Helper();
  before(() => {
    helper.reInitLocalScope();
    helper.modifyFieldInBitJson('dist', { target: 'dist' });
    helper.createComponentBarFoo();
    helper.addComponentBarFoo();
    helper.tagComponentBarFoo();
  });
  it('should not save the dists in the model', () => {
    const catComponent = helper.catComponent('bar/foo@latest');
    expect(catComponent).to.not.have.property('dists');
  });
  after(() => {
    helper.destroyEnv();
  });
});
