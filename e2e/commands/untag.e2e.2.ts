import { expect } from 'chai';
import * as path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

describe('bit untag command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('untag single component', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      localScope = helper.scopeHelper.cloneLocalScope();
      const output = helper.command.listLocalScope();
      expect(output).to.have.string('found 1 components');
    });
    describe('with one version', () => {
      before(() => {
        helper.command.runCmd('bit untag bar/foo 0.0.1');
      });
      it('should delete the entire component from the model', () => {
        const output = helper.command.listLocalScope();
        expect(output).to.have.string('found 0 components');
      });
    });
    describe('with multiple versions when specifying the version', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.command.tagComponent('bar/foo', undefined, '-f');
        const catComponent = helper.command.catComponent('bar/foo');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.have.property('0.0.2');

        helper.command.runCmd('bit untag bar/foo 0.0.2');
      });
      it('should delete only the specified tag', () => {
        const catComponent = helper.command.catComponent('bar/foo');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.not.have.property('0.0.2');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.have.property('0.0.1');
      });
      it('should delete the specified version from the "state" attribute', () => {
        const catComponent = helper.command.catComponent('bar/foo');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.state.versions).to.not.have.property('0.0.2');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.state.versions).to.have.property('0.0.1');
      });
      it('bit show should work', () => {
        const showOutput = helper.command.showComponentParsed('bar/foo');
        expect(showOutput.name).to.equal('bar/foo');
      });
      it('bit status should show the component as staged', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.string('staged components');
      });
    });
    describe('with multiple versions when specifying the version as part of the id', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.command.tagComponent('bar/foo', undefined, '-f');
        const catComponent = helper.command.catComponent('bar/foo');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.have.property('0.0.2');
        const componentStatus = helper.command.runCmd('bit status');
        expect(componentStatus).to.have.string('staged components');
        expect(componentStatus).to.not.have.string('no staged components');
        expect(componentStatus).to.have.string('bar/foo. versions: 0.0.1, 0.0.2 ... ok');

        helper.command.runCmd('bit untag bar/foo@0.0.2');
      });
      it('should delete only the specified tag', () => {
        const catComponent = helper.command.catComponent('bar/foo');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.not.have.property('0.0.2');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.have.property('0.0.1');
      });
    });
    describe('with multiple versions when not specifying the version', () => {
      describe('and all versions are local', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          helper.command.tagComponent('bar/foo', undefined, '-f');
          const catComponent = helper.command.catComponent('bar/foo');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(catComponent.versions).to.have.property('0.0.2');

          helper.command.runCmd('bit untag bar/foo');
        });
        it('should delete the entire component from the model', () => {
          const output = helper.command.listLocalScope();
          expect(output).to.have.string('found 0 components');
        });
      });
    });
    describe('when some versions are exported, some are local', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.scopeHelper.reInitRemoteScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.exportAllComponents();
        helper.command.tagComponent('bar/foo', undefined, '-f');
        const catComponent = helper.command.catComponent('bar/foo');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.have.property('0.0.2');
      });
      describe('untagging an exported version', () => {
        let output;
        before(() => {
          try {
            output = helper.command.runCmd('bit untag bar/foo 0.0.1');
          } catch (err) {
            output = err.message;
          }
        });
        it('should throw an error', () => {
          expect(output).to.have.string(
            `unable to untag ${helper.scopes.remote}/bar/foo, the version 0.0.1 was exported already`
          );
        });
      });
      describe('untagging without version', () => {
        before(() => {
          helper.command.runCmd('bit untag bar/foo');
        });
        it('should delete only the local tag and leave the exported tag', () => {
          const catComponent = helper.command.catComponent('bar/foo');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(catComponent.versions).to.not.have.property('0.0.2');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(catComponent.versions).to.have.property('0.0.1');
        });
      });
    });
    describe('when tagging non-existing component', () => {
      let output;
      before(() => {
        try {
          helper.command.runCmd('bit untag non-exist-scope/non-exist-comp');
        } catch (err) {
          output = err.message;
        }
      });
      it('should show an descriptive error', () => {
        expect(output).to.have.string(
          'untag non-exist-scope/non-exist-comp\nerror: component "non-exist-scope/non-exist-comp'
        );
      });
    });
  });
  describe('untag multiple components (--all flag)', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fs.createFile('bar', 'foo2.js');
      helper.command.addComponent('bar/foo2.js', { i: 'bar/foo2' });
      helper.fs.createFile('bar', 'foo3.js');
      helper.command.addComponent('bar/foo3.js', { i: 'bar/foo3' });
      helper.command.tagAllComponents();
      helper.command.exportComponent('bar/foo3');
      localScope = helper.scopeHelper.cloneLocalScope();
      const output = helper.command.listLocalScope();
      expect(output).to.have.string('found 3 components');
    });
    describe('without specifying a version', () => {
      let untagOutput;
      before(() => {
        untagOutput = helper.command.runCmd('bit untag --all');
      });
      it('should display a descriptive successful message', () => {
        expect(untagOutput).to.have.string('2 component(s) were untagged');
      });
      it('should remove only local components from the model', () => {
        const output = helper.command.listLocalScope();
        expect(output).to.have.string('found 1 components');
        expect(output).to.have.string('bar/foo3');
      });
    });
    describe('with specifying a version', () => {
      let untagOutput;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.command.tagScope('0.0.5');
        untagOutput = helper.command.runCmd('bit untag 0.0.5 --all');
      });
      it('should display a descriptive successful message', () => {
        expect(untagOutput).to.have.string('3 component(s) were untagged');
      });
      it('should remove only the specified version from the model', () => {
        const output = helper.command.listLocalScope();
        expect(output).to.have.string('found 3 components');
        expect(output).to.have.string('0.0.1');
        expect(output).to.not.have.string('0.0.5');
      });
    });
  });
  describe('components with dependencies', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      localScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('untag only the dependency', () => {
      describe('without force flag', () => {
        let untagOutput;
        before(() => {
          try {
            helper.command.runCmd('bit untag utils/is-type');
          } catch (err) {
            untagOutput = err.message;
          }
        });
        it('should throw a descriptive error', () => {
          expect(untagOutput).to.have.string(
            'unable to untag utils/is-type, the version 0.0.1 has the following dependent(s) utils/is-string@0.0.1'
          );
        });
      });
      describe('with force flag', () => {
        let untagOutput;
        before(() => {
          untagOutput = helper.command.runCmd('bit untag utils/is-type --force');
        });
        it('should untag successfully', () => {
          expect(untagOutput).to.have.string('1 component(s) were untagged');
        });
      });
      describe('after exporting the component and tagging the scope', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          helper.scopeHelper.reInitRemoteScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.exportAllComponents();
          helper.command.tagScope('1.0.5');
          try {
            output = helper.command.runCmd('bit untag utils/is-type');
          } catch (err) {
            output = err.message;
          }
        });
        it('should show an error', () => {
          expect(output).to.have.string(`unable to untag ${helper.scopes.remote}/utils/is-type`);
        });
        describe('tagging after the export, then, un-tagging the local tag', () => {
          let packageJsonUtilsIsStringPath;
          before(() => {
            helper.command.tagScope('2.0.0');
            helper.command.tagScope('2.0.1');
            // an intermediate step, make sure the package.json is updated to that version
            packageJsonUtilsIsStringPath = path.join(
              helper.scopes.localPath,
              `node_modules/@bit/${helper.scopes.remote}.utils.is-string`
            );
            const packageJson = helper.packageJson.read(packageJsonUtilsIsStringPath);
            expect(packageJson.version).to.equal('2.0.1');

            helper.command.untag('-a 2.0.1');
          });
          it('should change the version in the author package.json', () => {
            const packageJsonUtilsIsString = helper.packageJson.read(packageJsonUtilsIsStringPath);
            expect(packageJsonUtilsIsString.version).to.equal('2.0.0');
          });
        });
      });
    });
    describe('untag all components', () => {
      describe('when all components have only local versions', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          helper.command.runCmd('bit untag --all');
        });
        it('should remove all the components because it does not leave a damaged component without dependency', () => {
          const output = helper.command.listLocalScope();
          expect(output).to.have.string('found 0 components');
        });
      });
      describe('with specifying a version and the dependent has a different version than its dependency', () => {
        let untagOutput;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          helper.command.tagComponent('utils/is-string', undefined, '-f');
          try {
            helper.command.runCmd('bit untag 0.0.1 --all');
          } catch (err) {
            untagOutput = err.message;
          }
        });
        it('should throw a descriptive error', () => {
          expect(untagOutput).to.have.string(
            'unable to untag utils/is-type@0.0.1, the version 0.0.1 has the following dependent(s)'
          );
        });
      });
    });
    describe('untag only the dependent', () => {
      let untagOutput;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        untagOutput = helper.command.runCmd('bit untag utils/is-string');
      });
      it('should untag successfully the dependent', () => {
        expect(untagOutput).to.have.string('1 component(s) were untagged');
        expect(untagOutput).to.have.string('utils/is-string');
      });
      it('should leave the dependency intact', () => {
        const output = helper.command.listLocalScope();
        expect(output).to.have.string('utils/is-type');
      });
    });
    describe('after import and tagging', () => {
      let scopeAfterImport;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.scopeHelper.reInitRemoteScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.exportAllComponents();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('utils/is-string');
        scopeAfterImport = helper.scopeHelper.cloneLocalScope();
        helper.command.tagComponent('utils/is-string', undefined, '-f');
      });
      describe('untag using the id without scope-name', () => {
        let output;
        before(() => {
          output = helper.command.runCmd('bit untag utils/is-string');
        });
        it('should untag successfully', () => {
          expect(output).to.have.string('1 component(s) were untagged');
          expect(output).to.have.string('utils/is-string');
        });
      });
      describe('modify, tag and then untag all', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeAfterImport);
          helper.fs.modifyFile('components/utils/is-string/is-string.js');
          helper.command.tagAllComponents();
          helper.command.runCmd('bit untag --all');
        });
        it('should show the component as modified', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.not.have.string('no modified components');
          expect(output).to.have.string('modified components');
          expect(output).to.have.string('utils/is-string');
        });
      });
    });
  });
});
