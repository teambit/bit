import chai, { expect } from 'chai';

import { DIAGNOSIS_NAME } from '../../src/doctor/core-diagnoses/orphan-symlink-objects';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('scope with a symlink object reference to a non-exist component', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  before(() => {
    helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
    helper.fixtures.createComponentBarFoo();
    helper.fixtures.addComponentBarFooAsDir();
    helper.command.tagAllWithoutBuild();
    helper.command.export();

    // intermediate step, make sure, the local scope has both, the Symlink and ModelComponent objects
    const scope = helper.command.catScope(true);
    expect(scope).to.have.lengthOf(2);
    const modelComponent = scope.find((o) => o.type === 'Component');
    expect(modelComponent).to.be.ok;
    const symlink = scope.find((o) => o.type === 'Symlink');
    expect(symlink).to.be.ok;

    // delete manually the modelComponent object. there is no other known way how to get a scope
    // with only symlink without the component.
    const hash = modelComponent.hash;
    helper.fs.deletePath(`.bit/objects/${hash.slice(0, 2)}/${hash.slice(2)}`);
    const scopeAfterDelete = helper.command.catScope(true);
    expect(scopeAfterDelete).to.have.lengthOf(1);

    const indexJson = helper.general.getIndexJson();
    const componentIndex = indexJson.components.filter((i) => i.isSymlink === true);
    helper.general.writeIndexJson(componentIndex);
  });
  it('bit import should throw a descriptive error', () => {
    const output = helper.general.runWithTryCatch('bit import bar/foo');
    expect(output).to.have.string('error: found a symlink object "bar/foo" that references to a non-exist component');
  });
  it('bit doctor should report this as an issue', () => {
    const output = helper.command.doctorOne(DIAGNOSIS_NAME, { j: '' });
    const orphanSymlinkObjectsResult = JSON.parse(output);
    expect(orphanSymlinkObjectsResult.examineResult.bareResult.valid).to.be.false;
    expect(orphanSymlinkObjectsResult.examineResult.bareResult.data.orphanSymlinks[0].name).to.equal('bar/foo');
  });
});
