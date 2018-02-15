import { expect } from 'chai';
import Helper from '../e2e-helper';

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
      helper.commitComponentBarFoo();
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
  });

  describe('when a package is only a peer dependency but not required in the code', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createPackageJson({ peerDependencies: { chai: '>= 2.1.2 < 5' } });

      helper.addNpmPackage('chai', '2.4');
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
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
