import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';

describe('peer-dependencies functionality', function() {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when a package is a regular dependency and a peer dependency', () => {
    let catComponent;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.packageJson.create({ peerDependencies: { chai: '>= 2.1.2 < 5' } });

      helper.npm.addNpmPackage('chai', '2.4');
      helper.fixtures.createComponentBarFoo("import chai from 'chai';");
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      catComponent = helper.command.catComponent('bar/foo@latest');
    });
    it('should save the peer dependencies in the model', () => {
      expect(catComponent).to.have.property('peerPackageDependencies');
      expect(catComponent.peerPackageDependencies).to.have.property('chai');
      expect(catComponent.peerPackageDependencies.chai).to.equal('>= 2.1.2 < 5');
    });
    it('should not save the peer-dependency as a package-dependency nor as a dev-package-dependency', () => {
      expect(catComponent.packageDependencies).to.not.have.property('chai');
      expect(catComponent.devPackageDependencies).to.not.have.property('chai');
    });
    it('bit show should display the peer dependencies', () => {
      const output = helper.command.showComponentParsed('bar/foo');
      expect(output).to.have.property('peerPackageDependencies');
      expect(output.peerPackageDependencies).to.have.property('chai');
      expect(output.peerPackageDependencies.chai).to.equal('>= 2.1.2 < 5');
    });
    describe('when the component is imported', () => {
      before(() => {
        helper.scopeHelper.reInitRemoteScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.exportAllComponents();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        const output = helper.command.importComponent('bar/foo');
        expect(output).to.have.string('requires a peer');
        helper.npm.addNpmPackage('chai', '2.4'); // it's not automatically installed because it's a peer-dependency
      });
      it('should not be shown as modified', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
      });
      describe('and the package.json of the component was changed to remove the peerDependencies', () => {
        before(() => {
          helper.packageJson.addKeyValue(
            { peerDependencies: {} },
            path.join(helper.scopes.localPath, 'components/bar/foo')
          );
        });
        it('should be shown as modified', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.not.have.a.string('no modified components');
        });
      });
      describe('and the package.json of the component does not exist', () => {
        before(() => {
          fs.removeSync(path.join(helper.scopes.localPath, 'components/bar/foo/package.json'));
        });
        it('should not be shown as modified', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
        });
      });
    });
  });

  describe('when a package is only a peer dependency but not required in the code', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.packageJson.create({ peerDependencies: { chai: '>= 2.1.2 < 5' } });

      helper.npm.addNpmPackage('chai', '2.4');
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
    });
    it('should not save the peer dependencies in the model', () => {
      const output = helper.command.catComponent('bar/foo@latest');
      expect(output).to.have.property('peerPackageDependencies');
      expect(output.peerPackageDependencies).to.not.have.property('chai');
    });
    it('bit show should not display the peer dependencies', () => {
      const output = helper.command.showComponentParsed('bar/foo');
      expect(output).to.have.property('peerPackageDependencies');
      expect(output.peerPackageDependencies).to.not.have.property('chai');
    });
  });
});
