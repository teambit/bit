import { expect } from 'chai';
import { Extensions } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';
import { IssuesClasses } from '@teambit/component-issues';

describe('bit deprecate and undeprecate commands', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('deprecate tagged component', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents();
      helper.command.tagAllWithoutBuild();
      helper.command.deprecateComponent('comp2');
    });
    it('bit show should show the component as deprecated', () => {
      const deprecationData = helper.command.showAspectConfig('comp2', Extensions.deprecation);
      expect(deprecationData.config.deprecate).to.be.true;
    });
    it('bit status should show the component as modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(1);
      expect(status.modifiedComponents[0]).to.include('comp2');
    });
    describe('tagging the component', () => {
      before(() => {
        helper.command.tagAllWithoutBuild();
      });
      it('the component should not be modified', () => {
        const status = helper.command.statusJson();
        expect(status.modifiedComponents).to.have.lengthOf(0);
      });
      it('bit show should show the component as deprecated', () => {
        const deprecationData = helper.command.showAspectConfig('comp2', Extensions.deprecation);
        expect(deprecationData.config.deprecate).to.be.true;
      });
      it('.bitmap should not containing the config', () => {
        const bitmap = helper.bitMap.read();
        expect(bitmap.comp2).to.not.have.property('config');
      });
      it('bit list should show the component as deprecated', () => {
        const list = helper.command.listParsed();
        const comp2 = list.find((c) => c.id === `${helper.scopes.remote}/comp2`);
        expect(comp2?.deprecated).to.be.true;
      });
      describe('exporting the component', () => {
        before(() => {
          helper.command.export();
        });
        it('should delete the config from the .bitmap file.', () => {
          const bitmap = helper.bitMap.read();
          expect(bitmap.comp2).to.not.have.property('config');
        });
        describe('testing some config-merge', () => {
          before(() => {
            helper.workspaceJsonc.setVariant(undefined, 'comp2', {
              'teambit.component/deprecation': { someRandomData: true },
            });
          });
          // @todo: fix. currently it overrides the data unexpectedly.
          it.skip('should not delete the deprecation data from the config', () => {
            const deprecationData = helper.command.showAspectConfig('comp2', Extensions.deprecation);
            expect(deprecationData.config.deprecate).to.be.true;
          });
        });
        describe('importing a deprecated component', () => {
          let importOutput: string;
          before(() => {
            helper.scopeHelper.reInitWorkspace();
            helper.scopeHelper.addRemoteScope();
            importOutput = helper.command.importComponent('comp2');
          });
          it('should indicate that the component is deprecated', () => {
            expect(importOutput).to.have.string('deprecated');
          });
        });
        describe('bit list of a remote deprecated component', () => {
          before(() => {
            helper.scopeHelper.reInitWorkspace();
            helper.scopeHelper.addRemoteScope();
          });
          it('should indicate that the component is deprecated', () => {
            const list = helper.command.listRemoteScopeParsed();
            const comp2 = list.find((c) => c.id === `${helper.scopes.remote}/comp2`);
            expect(comp2.deprecated).to.equal(true);
          });
        });
        describe('importing all scope', () => {
          let output: string;
          before(() => {
            helper.scopeHelper.reInitWorkspace();
            helper.scopeHelper.addRemoteScope();
            output = helper.command.importComponent('* -x');
          });
          it('should not include deprecated by default', () => {
            expect(output).to.have.string('2 components');
          });
        });
        describe('importing all scope with --include-deprecated flag', () => {
          let output: string;
          before(() => {
            helper.scopeHelper.reInitWorkspace();
            helper.scopeHelper.addRemoteScope();
            output = helper.command.importComponent('* -x --include-deprecated');
          });
          it('should include deprecated', () => {
            expect(output).to.have.string('3 components');
          });
        });
      });
    });
  });
  describe('reverting the deprecation by "bit checkout reset"', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.deprecateComponent('comp1');
      // intermediate test
      const deprecationData = helper.command.showAspectConfig('comp1', Extensions.deprecation);
      expect(deprecationData.config.deprecate).to.be.true;

      helper.command.checkoutReset('comp1');
    });
    it('should remove the deprecation config', () => {
      const deprecationData = helper.command.showAspectConfig('comp1', Extensions.deprecation);
      expect(deprecationData).to.be.undefined;
    });
  });
  describe('deprecate previous versions', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.fixtures.populateComponents(2, undefined, 'version2');
      helper.command.deprecateComponent('comp2', '--range 0.0.1');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
    });
    it('should not show the current version as deprecated', () => {
      const deprecationData = helper.command.showComponentParsedHarmonyByTitle('comp2', 'deprecated');
      expect(deprecationData.isDeprecate).to.be.false;
      expect(deprecationData.range).to.equal('0.0.1');
    });
    it('should show the previous version as deprecated', () => {
      const deprecationData = helper.command.showComponentParsedHarmonyByTitle('comp2@0.0.1', 'deprecated');
      expect(deprecationData.isDeprecate).to.be.true;
      expect(deprecationData.range).to.equal('0.0.1');
    });
    it('bit list should not show the component as deprecated', () => {
      const list = helper.command.listParsed();
      const comp2 = list.find((c) => c.id === `${helper.scopes.remote}/comp2`);
      expect(comp2?.deprecated).to.be.false;
    });
    it('un-deprecating the component should remove the range data', () => {
      helper.command.undeprecateComponent('comp2');

      const deprecationData = helper.command.showComponentParsedHarmonyByTitle('comp2@0.0.1', 'deprecated');
      expect(deprecationData.isDeprecate).to.be.false;
      expect(deprecationData).to.not.have.property('range');
    });
    describe('importing the component', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
      });
      it('import the latest version should not show the deprecated message', () => {
        const output = helper.command.importComponent('comp2', '-x');
        expect(output).to.not.have.string('deprecated');
      });
      it('import the previous version should show the deprecated message', () => {
        const output = helper.command.importComponent('comp2@0.0.1', '-x --override');
        expect(output).to.have.string('deprecated');
      });
    });
  });
  describe('deprecating with --range when it overlaps the current version', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.deprecateComponent('comp1', '--range "<1.0.0"');
      helper.command.tagAllWithoutBuild();
    });
    it('should show the component as deprecated', () => {
      const deprecationData = helper.command.showComponentParsedHarmonyByTitle('comp1', 'deprecated');
      expect(deprecationData.isDeprecate).to.be.true;
      expect(deprecationData.range).to.equal('<1.0.0');
    });
    it('when the range is outside the current version it should not show as deprecated', () => {
      helper.command.tagAllWithoutBuild('--ver 2.0.0 --unmodified');
      const deprecationData = helper.command.showComponentParsedHarmonyByTitle('comp1', 'deprecated');
      expect(deprecationData.isDeprecate).to.be.false;
    });
  });
  describe('using deprecated components', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.deprecateComponent('comp2');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
    });
    it('bit status should show the DeprecatedDependencies component-issue', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.DeprecatedDependencies.name);
    });
    describe('un-deprecating it', () => {
      before(() => {
        helper.command.undeprecateComponent('comp2');
      });
      it('bit status should not show the DeprecatedDependencies component-issue anymore', () => {
        helper.command.expectStatusToNotHaveIssue(IssuesClasses.DeprecatedDependencies.name);
      });
    });
  });
});
