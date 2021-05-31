import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import { statusFailureMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

chai.use(require('chai-fs'));

describe('dists file are written outside the components dir', function () {
  this.timeout(0);
  let helper: Helper;
  let appJsFixture;
  let scopeWithCompiler;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
    appJsFixture = `const barFoo = require('${helper.general.getRequireBitPath(
      'bar',
      'foo'
    )}'); console.log(barFoo.default());`;
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.env.importCompiler();
    scopeWithCompiler = helper.scopeHelper.cloneLocalScope();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when using "module path" import syntax', () => {
    /**
     * bar/foo depends on utils/is-string.
     * utils/is-string depends on utils/is-type
     */
    before(() => {
      helper.scopeHelper.getClonedLocalScope(scopeWithCompiler);
      helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeES6);
      helper.fixtures.addComponentUtilsIsType();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.getClonedLocalScope(scopeWithCompiler);
      helper.command.importComponent('utils/is-type');

      const isStringFixture = `import isType from '${helper.general.getRequireBitPath('utils', 'is-type')}';
 export default function isString() { return isType() +  ' and got is-string'; };`;
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.getClonedLocalScope(scopeWithCompiler);
      helper.command.importComponent('utils/is-string');

      const fooBarFixture = `import isString from '${helper.general.getRequireBitPath('utils', 'is-string')}';
export default function foo() { return isString() + ' and got foo'; };`;
      helper.fixtures.createComponentBarFoo(fooBarFixture);
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      helper.bitJson.modifyField('dist', { target: 'dist' });
      helper.command.importComponent('bar/foo');
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    describe('"bit build" after updating the imported component', () => {
      before(() => {
        const fooBarFixtureV2 = `import isString from '${helper.general.getRequireBitPath('utils', 'is-string')}';
export default function foo() { return isString() + ' and got foo v2'; };`;
        helper.fs.createFile('components/bar/foo', 'foo.js', fooBarFixtureV2); // update component
        helper.scopeHelper.addRemoteEnvironment();
        helper.command.build();
      });
      it('should save the dists file in the same place "bit import" saved them', () => {
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
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
      helper.scopeHelper.getClonedLocalScope(scopeWithCompiler);
      helper.scopeHelper.reInitRemoteScope();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeES6);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isStringES6);
      helper.fixtures.addComponentUtilsIsString();
      helper.fixtures.createComponentBarFoo(fixtures.barFooES6);
      helper.fixtures.addComponentBarFoo();
      clonedScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('as author', () => {
      // this tests also the node_modules generated link for authored component. See similar test without dist in link.e2e file.
      before(() => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        helper.bitJson.modifyField('dist', { target: 'dist', entry: 'src' });
        helper.command.build();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
    describe('as imported', () => {
      let scopeAfterImport;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(clonedScope);
        helper.command.tagAllComponents();
        helper.scopeHelper.reInitRemoteScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.exportAllComponents();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        helper.bitJson.modifyField('dist', { target: 'dist' });
        helper.command.importComponent('bar/foo');
        scopeAfterImport = helper.scopeHelper.cloneLocalScope();
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
      describe('when adding an external package', () => {
        // the node-modules of the dist should handle both, symlinks to the external packages and actual links
        before(() => {
          helper.command.runCmd(
            'npm install --save lodash.isstring',
            path.join(helper.scopes.localPath, 'components', 'bar', 'foo')
          );
          helper.command.runCmd('bit link'); // after npm install, all @bit symlinks are deleted, we have to re-link them.
          const fooBarFixtureV2 = `import isString from '${helper.general.getRequireBitPath('utils', 'is-string')}';
import lodashIsString from 'lodash.isstring';
lodashIsString();
export default function foo() { return isString() + ' and got foo v2'; };`;
          helper.fs.createFile('components/bar/foo/bar', 'foo.js', fooBarFixtureV2); // update component
          helper.scopeHelper.addRemoteEnvironment();
          helper.command.build();
        });
        it('should symlink the external packages as well into dist', () => {
          expect(
            path.join(helper.scopes.localPath, 'dist', 'components', 'bar', 'foo', 'node_modules', 'lodash.isstring')
          ).to.be.a.path();
        });
        it('should be able to require its direct dependency and print results from all dependencies', () => {
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo v2');
        });
        describe('after importing a component with external packages', () => {
          before(() => {
            helper.command.tagAllComponents();
            helper.command.exportAllComponents();
            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.addRemoteScope();
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            helper.bitJson.modifyField('dist', { target: 'dist' });
            helper.command.importComponent('bar/foo');
          });
          it('should be able to require its direct dependency and print results from all dependencies', () => {
            fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
            const result = helper.command.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo v2');
          });
        });
      });
      describe('removing the component', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeAfterImport);
          helper.command.removeComponent('bar/foo');
        });
        it('should remove the dist directory as well', () => {
          expect(path.join(helper.scopes.localPath, 'dist/components/bar')).to.not.be.a.path();
        });
      });
      describe('importing all components and then deleting the dist directory', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeAfterImport);
          helper.command.importComponent('utils/is-string');
          helper.command.importComponent('utils/is-type');
          helper.scopeHelper.addRemoteEnvironment();
          helper.fs.deletePath('dist');
        });
        it('should be able to build with no errors', () => {
          // previously it was showing an error "unable to link remote/utils/is-type@0.0.1, the file /workspace/dist/components/utils/is-type is missing from the filesystem."
          const func = () => helper.command.build('--no-cache');
          expect(func).to.not.throw();
        });
      });
    });
  });
  // legacy test as it checks the removal of shared-dir
  describe('bit build', () => {
    let localConsumerFiles;
    let clonedScope;
    before(() => {
      helper.scopeHelper.getClonedLocalScope(scopeWithCompiler);
      helper.scopeHelper.reInitRemoteScope();
      helper.fs.createFile(path.normalize('src/bar'), 'foo.js');
      helper.command.addComponent('src/bar/foo.js', { i: 'bar/foo' });
      clonedScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('as author', () => {
      describe('with dist.entry populated', () => {
        before(() => {
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          helper.bitJson.modifyField('dist', { entry: 'src' });
          helper.command.build();
          localConsumerFiles = helper.fs.getConsumerFiles('*.{js,ts}', false);
        });
        it('should write the dists files without the dist.entry part', () => {
          expect(localConsumerFiles).to.include(path.join('dist', 'bar', 'foo.js'));
          expect(localConsumerFiles).to.not.include(path.join('dist', 'src', 'bar', 'foo.js'));
        });
      });
      describe('with dist.entry and dist.target populated', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(clonedScope);
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          helper.bitJson.modifyField('dist', { entry: 'src', target: 'my-dist' });
          helper.command.build();
          localConsumerFiles = helper.fs.getConsumerFiles('*.{js,ts}', false);
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
        helper.scopeHelper.getClonedLocalScope(clonedScope);
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.scopeHelper.addRemoteEnvironment();
        helper.command.importComponent('bar/foo');
        clonedScope = helper.scopeHelper.cloneLocalScope();
      });
      describe('with dist.entry populated', () => {
        before(() => {
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          helper.bitJson.modifyField('dist', { entry: 'src' });
          helper.command.build('bar/foo');
          localConsumerFiles = helper.fs.getConsumerFiles('*.{js,ts}', false);
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
          helper.scopeHelper.getClonedLocalScope(clonedScope);
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          helper.bitJson.modifyField('dist', { entry: 'src', target: 'my-dist' });
          helper.command.build('bar/foo');
          localConsumerFiles = helper.fs.getConsumerFiles('*.{js,ts}', false);
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
      helper.scopeHelper.getClonedLocalScope(scopeWithCompiler);
      helper.scopeHelper.reInitRemoteScope();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeES6);
      helper.fixtures.addComponentUtilsIsType();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('utils/is-type');

      const isStringFixture = `const isType = require('${helper.general.getRequireBitPath(
        'utils',
        'is-type'
      )}'); module.exports = function isString() { return isType.default() +  ' and got is-string'; };`;
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.getClonedLocalScope(scopeWithCompiler);
      helper.command.importComponent('utils/is-string');

      const fooBarFixture = `import isString from '${helper.general.getRequireBitPath('utils', 'is-string')}';
export default function foo() { return isString() + ' and got foo'; };`;
      helper.fixtures.createComponentBarFoo(fooBarFixture);
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      helper.bitJson.modifyField('dist', { target: 'dist' });
      helper.command.importComponent('bar/foo');
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    describe('"bit build" of a component with no compiler-id (when dists are outside the components dir)', () => {
      before(() => {
        fs.removeSync(path.join(helper.scopes.localPath, 'dist'));
        helper.command.build('utils/is-string');
      });
      it('should save the source files as dists files', () => {
        expect(
          path.join(helper.scopes.localPath, 'dist', 'components', '.dependencies', 'utils', 'is-string')
        ).to.be.a.path();
      });
    });
  });
  describe('when using custom-module-resolution syntax', () => {
    before(() => {
      helper.scopeHelper.getClonedLocalScope(scopeWithCompiler);
      helper.scopeHelper.reInitRemoteScope();
      const bitJson = helper.bitJson.read();
      bitJson.resolveModules = { modulesDirectories: ['src'] };
      helper.bitJson.write(bitJson);

      helper.fs.createFile('src/utils', 'is-type.js', fixtures.isTypeES6);
      helper.command.addComponent('src/utils/is-type.js', { i: 'utils/is-type' });
      const isStringFixture = `import isType from 'utils/is-type';
 export default function isString() { return isType() +  ' and got is-string'; };`;
      helper.fs.createFile('src/utils', 'is-string.js', isStringFixture);
      helper.command.addComponent('src/utils/is-string.js', { i: 'utils/is-string' });
      const fooBarFixture = `import isString from 'utils/is-string';
export default function foo() { return isString() + ' and got foo'; };`;
      helper.fs.createFile('src/bar', 'foo.js', fooBarFixture);
      helper.command.addComponent('src/bar/foo.js', { i: 'bar/foo' });

      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      helper.bitJson.modifyField('dist', { target: 'dist' });
      helper.command.importComponent('bar/foo');
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    it('should not indicate that missing dependencies', () => {
      const status = helper.command.runCmd('bit status');
      expect(status).to.not.have.string(statusFailureMsg);
      expect(status).to.not.have.string('modified');
    });
    describe('"bit build" after updating the imported component', () => {
      before(() => {
        const fooBarFixtureV2 = `import isString from 'utils/is-string';
export default function foo() { return isString() + ' and got foo v2'; };`;
        helper.fs.createFile('components/bar/foo', 'foo.js', fooBarFixtureV2); // update component
        helper.scopeHelper.addRemoteEnvironment();
        helper.command.build();
      });
      it('should save the dists file in the same place "bit import" saved them', () => {
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo v2');
      });
    });
  });
  describe('imported require authored component', () => {
    function importRequireAuthored(distIsOutside = true) {
      describe(`when distIsOutside ${distIsOutside.toString()}`, () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeWithCompiler);
          helper.scopeHelper.reInitRemoteScope();
          helper.fs.createFile('utils', 'is-string.js', '');
          helper.fixtures.addComponentUtilsIsString();
          helper.command.tagAllComponents();
          helper.command.exportAllComponents();
          helper.scopeHelper.getClonedLocalScope(scopeWithCompiler);
          if (distIsOutside) {
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            helper.bitJson.modifyField('dist', { target: 'dist', entry: 'src' });
          }
          helper.command.importComponent('utils/is-string');

          helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeES6);
          helper.fixtures.addComponentUtilsIsType();
          helper.command.tagAllComponents();
          helper.command.exportAllComponents();

          const isStringFixture = `import isType from '${helper.general.getRequireBitPath('utils', 'is-type')}';
     export default function isString() { return isType() +  ' and got is-string'; };`;
          helper.fs.createFile('components/utils/is-string', 'is-string.js', isStringFixture);
        });
        it('bit status should not show missing links', () => {
          // a previous bug showed "missing links" here because the package.json in node_modules
          // was pointing to a non-exist main file.
          const status = helper.command.status();
          expect(status).to.not.have.string(statusFailureMsg);
          expect(status).to.have.string('ok');
        });
        it('bit build should not throw an error', () => {
          expect(() => helper.command.build()).to.not.throw();
        });
        it('bit link should not throw an error', () => {
          expect(() => helper.command.runCmd('bit link')).to.not.throw();
        });
        it('bit link should not generate symlinks from an imported component to the workspace root dir', () => {
          const output = helper.command.runCmd('bit link');
          expect(output).to.not.have.string('original path: .,');
          expect(output).to.not.have.string('original path: dist,');
          const link = path.join(
            helper.scopes.localPath,
            `components/utils/is-string/node_modules/@bit/${helper.scopes.remote}.utils.is-type`
          );
          expect(link).to.not.be.a.path();
        });
        it('bit link should not generate symlinks from an imported component to the root dist', () => {
          const output = helper.command.runCmd('bit link');
          expect(output).to.not.have.string('original path: dist,');
          const distLink = path.join(
            helper.scopes.localPath,
            `dist/components/utils/is-string/node_modules/@bit/${helper.scopes.remote}.utils.is-type`
          );
          expect(distLink).to.not.be.a.path();
        });
        describe('running bit tag', () => {
          before(() => {
            helper.npm.initNpm(); // so then it has package.json with version 1.0.0 (needed for #1698)
            helper.command.tagAllComponents();
          });
          it('bit status should not show modified', () => {
            const output = helper.command.status();
            expect(output).to.not.have.string('modified');
          });
          it('should tag with the correct version of the author component from .bitmap and not use the root package.json version', () => {
            const cmp = helper.command.catComponent(`${helper.scopes.remote}/utils/is-string@latest`);
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  before(() => {
    helper.scopeHelper.reInitLocalScope();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    helper.bitJson.modifyField('dist', { target: 'dist' });
    helper.fixtures.createComponentBarFoo();
    helper.fixtures.addComponentBarFoo();
    helper.fixtures.tagComponentBarFoo();
  });
  it('should not save the dists in the model', () => {
    const catComponent = helper.command.catComponent('bar/foo@latest');
    expect(catComponent).to.not.have.property('dists');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
});
