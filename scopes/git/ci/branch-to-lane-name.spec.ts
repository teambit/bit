import { expect } from 'chai';
import { branchToLaneName } from './branch-to-lane-name';

describe('branchToLaneName()', () => {
  it('should replace slashes and dots with dashes and lowercase the name', () => {
    expect(branchToLaneName('feature/New.Component')).to.equal('feature-new-component');
  });

  it('should not produce a lane name reserved for the default lane', () => {
    expect(branchToLaneName('master')).to.equal('master-branch');
    expect(branchToLaneName('main')).to.equal('main-branch');
    expect(branchToLaneName('Master')).to.equal('master-branch');
  });

  it('should leave names that merely contain a reserved name as is', () => {
    expect(branchToLaneName('fix/master')).to.equal('fix-master');
    expect(branchToLaneName('main-fix')).to.equal('main-fix');
  });
});
