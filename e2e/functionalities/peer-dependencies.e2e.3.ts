import { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';

describe('peer-dependencies functionality', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
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
        helper.command.expectStatusToBeClean();
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
          expect(output).to.not.have.string('no modified components');
        });
      });
      describe('and the package.json of the component does not exist', () => {
        before(() => {
          fs.removeSync(path.join(helper.scopes.localPath, 'components/bar/foo/package.json'));
        });
        it('should not be shown as modified', () => {
          helper.command.expectStatusToBeClean();
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
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(output.peerPackageDependencies).to.not.have.property('chai');
    });
    it('bit show should not display the peer dependencies', () => {
      const output = helper.command.showComponentParsed('bar/foo');
      expect(output).to.have.property('peerPackageDependencies');
      expect(output.peerPackageDependencies).to.not.have.property('chai');
    });
  });
  describe('when a component has a package dependency that has peerDependency and installed as a compiler', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.npm.addNpmPackage('@babel/plugin-proposal-class-properties', '7.7.0');
      helper.fixtures.createComponentBarFoo('require ("@babel/plugin-proposal-class-properties");');
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo --compiler');
    });
    it('should install the peer dependencies of that package', () => {
      // in this case, @babel/core is a peer-dependency of @babel/plugin-proposal-class-properties
      const dir = path.join(helper.scopes.localPath, '.bit/components/bar/foo', helper.scopes.remote, '0.0.1');
      const packageJson = helper.packageJson.read(dir);
      expect(packageJson.dependencies).to.have.property('@babel/core');
    });
  });
});
