import R from 'ramda';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import { DIAGNOSIS_NAME } from '../../src/doctor/core-diagnoses/orphan-symlink-objects';

chai.use(require('chai-fs'));

describe('scope with a symlink object reference to a non-exist component', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  before(() => {
    helper.setNewLocalAndRemoteScopes();
    helper.createComponentBarFoo();
    helper.addComponentBarFoo();
    helper.tagAllComponents();
    helper.exportAllComponents();

    // intermediate step, make sure, the local scope has both, the Symlink and ModelComponent objects
    const scope = helper.catScope(true);
    expect(scope).to.have.lengthOf(2);
    const modelComponent = scope.find(o => o.type === 'Component');
    expect(modelComponent).to.be.ok;
    const symlink = scope.find(o => o.type === 'Symlink');
    expect(symlink).to.be.ok;

    // delete manually the modelComponent object. there is no other known way how to get a scope
    // with only symlink without the component.
    const hash = modelComponent.hash;
    helper.deletePath(`.bit/objects/${hash.substr(0, 2)}/${hash.substr(2)}`);
    const scopeAfterDelete = helper.catScope(true);
    expect(scopeAfterDelete).to.have.lengthOf(1);

    const indexJson = helper.getIndexJson();
    const componentIndex = indexJson.filter(i => i.isSymlink === false);
    helper.writeIndexJson(R.without(componentIndex, indexJson));
  });
  it('bit import should throw a descriptive error', () => {
    const output = helper.runWithTryCatch('bit import bar/foo');
    expect(output).to.have.string('error: found a symlink object "bar/foo" that references to a non-exist component');
  });
  it('bit tag should throw a descriptive error', () => {
    helper.deleteBitMap();
    helper.addComponentBarFoo();
    const output = helper.runWithTryCatch('bit tag -a');
    expect(output).to.have.string('error: found a symlink object "bar/foo" that references to a non-exist component');
  });
  it('bit doctor should report this as an issue', () => {
    const output = helper.doctorOne(DIAGNOSIS_NAME, { j: '' });
    const orphanSymlinkObjectsResult = JSON.parse(output);
    expect(orphanSymlinkObjectsResult.examineResult.bareResult.valid).to.be.false;
    expect(orphanSymlinkObjectsResult.examineResult.bareResult.data.orphanSymlinks[0].name).to.equal('bar/foo');
  });
});
