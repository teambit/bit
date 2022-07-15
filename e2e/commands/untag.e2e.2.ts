import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('bit reset command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('untag single component', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      localScope = helper.scopeHelper.cloneLocalScope();
      const output = helper.command.listLocalScope();
      expect(output).to.have.string('found 1 components');
    });
    describe('with one version', () => {
      before(() => {
        helper.command.untag('bar/foo', true);
      });
      it('should delete the entire component from the model', () => {
        const output = helper.command.listLocalScope();
        expect(output).to.have.string('found 0 components');
      });
    });
    describe('with multiple versions when specifying the version', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.command.tagWithoutBuild('bar/foo', '--unmodified');
        const catComponent = helper.command.catComponent('bar/foo');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.have.property('0.0.2');

        helper.command.untag('bar/foo', true);
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
    describe('with multiple versions when not specifying the version', () => {
      describe('and all versions are local', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          helper.command.tagWithoutBuild('bar/foo', '--unmodified');
          const catComponent = helper.command.catComponent('bar/foo');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(catComponent.versions).to.have.property('0.0.2');

          helper.command.untag('bar/foo');
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
        helper.command.export();
        helper.command.tagWithoutBuild('bar/foo', '--unmodified');
        const catComponent = helper.command.catComponent('bar/foo');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.have.property('0.0.2');
      });
      describe('untagging an exported version', () => {
        let output;
        before(() => {
          try {
            output = helper.command.untag('bar/foo', true);
          } catch (err: any) {
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
          helper.command.untag('bar/foo');
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
          helper.command.untag('non-exist-scope/non-exist-comp');
        } catch (err: any) {
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fs.createFile('bar2', 'foo2.js');
      helper.command.addComponent('bar2', { i: 'bar/foo2' });
      helper.fs.createFile('bar3', 'foo3.js');
      helper.command.addComponent('bar3', { i: 'bar/foo3' });
      helper.command.tagAllWithoutBuild();
      helper.command.exportIds('bar/foo3');
      localScope = helper.scopeHelper.cloneLocalScope();
      const output = helper.command.listLocalScope();
      expect(output).to.have.string('found 3 components');
    });
    describe('without specifying a version', () => {
      let untagOutput;
      before(() => {
        untagOutput = helper.command.untagAll();
        helper.command.untagAll();
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
    describe('with --head', () => {
      let untagOutput;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.command.tagIncludeUnmodified('0.0.5');
        untagOutput = helper.command.untagAll('--head');
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
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentIsType();
      helper.fixtures.addComponentUtilsIsTypeAsDir();
      helper.fixtures.createComponentIsString();
      helper.fixtures.addComponentUtilsIsStringAsDir();
      helper.command.linkAndRewire();
      helper.command.tagAllWithoutBuild();
      localScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('untag only the dependency', () => {
      describe('without force flag', () => {
        let untagOutput;
        before(() => {
          try {
            helper.command.untag('utils/is-type');
          } catch (err: any) {
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
          untagOutput = helper.command.untag('utils/is-type', undefined, '--force');
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
          helper.command.export();
          helper.command.tagIncludeUnmodified('1.0.5');
          try {
            output = helper.command.untag('utils/is-type');
          } catch (err: any) {
            output = err.message;
          }
        });
        it('should show an error', () => {
          expect(output).to.have.string(`unable to untag ${helper.scopes.remote}/utils/is-type`);
        });
      });
    });
    describe('untag all components', () => {
      describe('when all components have only local versions', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          helper.command.untagAll();
        });
        it('should remove all the components because it does not leave a damaged component without dependency', () => {
          const output = helper.command.listLocalScope();
          expect(output).to.have.string('found 0 components');
        });
      });
    });
    describe('untag only the dependent', () => {
      let untagOutput;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        untagOutput = helper.command.untag('utils/is-string');
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
        helper.command.export();
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('utils/is-string --path components/utils/is-string');
        scopeAfterImport = helper.scopeHelper.cloneLocalScope();
        helper.command.tagWithoutBuild('utils/is-string', '--unmodified --ignore-issues "*"');
      });
      describe('untag using the id without scope-name', () => {
        let output;
        before(() => {
          output = helper.command.untag('utils/is-string');
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
          helper.command.tagAllWithoutBuild('--ignore-issues "*"');
          helper.command.untagAll();
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
