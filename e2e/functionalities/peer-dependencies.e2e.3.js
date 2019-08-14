import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';

describe('peer-dependencies functionality', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('when a package is a regular dependency and a peer dependency', () => {
    let catComponent;
    before(() => {
      helper.reInitLocalScope();
      helper.createPackageJson({ peerDependencies: { chai: '>= 2.1.2 < 5' } });

      helper.addNpmPackage('chai', '2.4');
      helper.createComponentBarFoo("import chai from 'chai';");
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      catComponent = helper.catComponent('bar/foo@latest');
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
      const output = helper.showComponentParsed('bar/foo');
      expect(output).to.have.property('peerPackageDependencies');
      expect(output.peerPackageDependencies).to.have.property('chai');
      expect(output.peerPackageDependencies.chai).to.equal('>= 2.1.2 < 5');
    });
    describe('when the component is imported', () => {
      before(() => {
        helper.reInitRemoteScope();
        helper.addRemoteScope();
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        const output = helper.importComponent('bar/foo');
        expect(output).to.have.string('requires a peer');
        helper.addNpmPackage('chai', '2.4'); // it's not automatically installed because it's a peer-dependency
      });
      it('should not be shown as modified', () => {
        const output = helper.runCmd('bit status');
        expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
      });
      describe('and the package.json of the component was changed to remove the peerDependencies', () => {
        before(() => {
          helper.addKeyValueToPackageJson(
            { peerDependencies: {} },
            path.join(helper.localScopePath, 'components/bar/foo')
          );
        });
        it('should be shown as modified', () => {
          const output = helper.runCmd('bit status');
          expect(output).to.not.have.a.string('no modified components');
        });
      });
      describe('and the package.json of the component does not exist', () => {
        before(() => {
          fs.removeSync(path.join(helper.localScopePath, 'components/bar/foo/package.json'));
        });
        it('should not be shown as modified', () => {
          const output = helper.runCmd('bit status');
          expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
        });
      });
    });
  });

  describe('when a package is only a peer dependency but not required in the code', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createPackageJson({ peerDependencies: { chai: '>= 2.1.2 < 5' } });

      helper.addNpmPackage('chai', '2.4');
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
    });
    it('should not save the peer dependencies in the model', () => {
      const output = helper.catComponent('bar/foo@latest');
      expect(output).to.have.property('peerPackageDependencies');
      expect(output.peerPackageDependencies).to.not.have.property('chai');
    });
    it('bit show should not display the peer dependencies', () => {
      const output = helper.showComponentParsed('bar/foo');
      expect(output).to.have.property('peerPackageDependencies');
      expect(output.peerPackageDependencies).to.not.have.property('chai');
    });
  });
});
