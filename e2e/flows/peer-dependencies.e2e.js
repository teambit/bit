import { expect } from 'chai';
import Helper from '../e2e-helper';

describe('peer-dependencies functionality', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('tag a component when root package.json has peer dependency', () => {
    helper.reInitLocalScope();
    helper.createPackageJson({ peerDependencies: { chai: '>= 2.1.2 < 5' } });

    helper.createComponentBarFoo();
    helper.addComponentBarFoo();
    helper.commitComponentBarFoo();
  });
  it('should save the peer dependencies in the model', () => {
    const output = helper.catComponent('bar/foo@latest');
    expect(output).to.have.property('peerPackageDependencies');
    expect(output.peerPackageDependencies).to.have.property('chai');
    expect(output.peerPackageDependencies.chai).to.equal('>= 2.1.2 < 5');
  });
  it('bit show should display the peer dependencies', () => {
    const output = helper.showComponentParsed('bar/foo');
    expect(output).to.have.property('peerPackageDependencies');
    expect(output.peerPackageDependencies).to.have.property('chai');
    expect(output.peerPackageDependencies.chai).to.equal('>= 2.1.2 < 5');
  });
});
