import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

describe.only('peer-dependencies functionality', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when a package is a regular dependency and a peer dependency', () => {
    let catComponent;
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.addPolicyToDependencyResolver({ peerDependencies: { chai: '>= 2.1.2 < 5' } });
      helper.npm.addFakeNpmPackage('chai', '2.4');
      helper.fixtures.createComponentBarFoo("import chai from 'chai';");
      helper.fixtures.addComponentBarFooAsDir();
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
    // @TODO: FIX ON HARMONY!
    // check with Gilad. On Harmony, it's modified. it shows "chai@4.3.6" as packageDependency instead of chai@@>= 2.1.2 < 5 as peerPackageDependencies
    describe.skip('when the component is imported', () => {
      before(() => {
        helper.scopeHelper.reInitRemoteScope();
        helper.scopeHelper.addRemoteScope();
        helper.bitJsonc.setupDefault();
        helper.command.export();

        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
        // const output = helper.command.importComponent('bar/foo');
        // expect(output).to.have.string('requires a peer'); // this was probably changed in Harmony
        // helper.npm.addFakeNpmPackage('chai', '2.4'); // it's not automatically installed because it's a peer-dependency
      });
      it('should not be shown as modified', () => {
        helper.command.expectStatusToBeClean();
      });
    });
  });

  describe('when a package is only a peer dependency but not required in the code', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.addPolicyToDependencyResolver({ peerDependencies: { chai: '>= 2.1.2 < 5' } });
      helper.npm.addFakeNpmPackage('chai', '2.4');
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
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
});
