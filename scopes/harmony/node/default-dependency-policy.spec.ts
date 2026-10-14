import { expect } from 'chai';
import { NodeEnv } from './node.env';
import { getNodeDependencyPolicy } from './default-dependency-policy';

describe('getNodeDependencyPolicy()', () => {
  it('should be the policy the node env returns from getDependencies()', () => {
    // the native installer reads the policy without loading the env; the two must not drift.
    expect(getNodeDependencyPolicy()).to.deep.equal(NodeEnv.prototype.getDependencies.call(undefined));
  });
});
