import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

// A component-level peer dependency (a bit-component set as a peer of another component) is stored
// only in the dependency-resolver aspect data, not in the legacy `peerDependencies` array of the
// Version model. As a result, a component reconstructed from the model has an empty legacy peer
// array, while the workspace component has it populated. `bit diff` used to compare the legacy
// arrays directly and therefore printed a phantom "peer added" line even though nothing changed
// (and `bit status` correctly reported no modification).
describe('bit diff with a component-level peer dependency', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.reInitWorkspace();
    helper.fixtures.populateComponents(2);
    // mark comp2 as a peer. since comp1 depends on comp2, comp2 becomes a component-level peer
    // dependency of comp1 (lifecycle=peer, type=component), which is stored only in the
    // dependency-resolver aspect data and not in the legacy peerDependencies array.
    helper.command.setPeer('comp2', '0');
    helper.command.install();
    helper.command.tagAllWithoutBuild();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('bit status should not show the component as modified', () => {
    expect(helper.command.statusComponentIsModified(`${helper.scopes.remote}/comp1`)).to.be.false;
  });
  it('bit diff should not show a phantom peer-dependency change', () => {
    const diff = helper.command.diff('comp1');
    expect(diff).to.not.include('peerDependencies');
  });
});
