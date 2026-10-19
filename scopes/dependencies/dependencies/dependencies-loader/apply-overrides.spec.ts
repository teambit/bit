import { expect } from 'chai';
import { ApplyOverrides } from './apply-overrides';

function createApplyOverrides({ installed, inWorkspacePolicy }: { installed?: string; inWorkspacePolicy?: string }) {
  const applyOverrides = Object.create(ApplyOverrides.prototype);
  applyOverrides.depsResolver = {
    getWorkspacePolicyManifest: () => ({ dependencies: inWorkspacePolicy ? { 'my-pkg': inWorkspacePolicy } : {} }),
  };
  applyOverrides._resolvePackageData = () => (installed ? { concreteVersion: installed } : undefined);
  return applyOverrides;
}

describe('ApplyOverrides.resolveEnvPeerDepVersion()', () => {
  it('should prefer the installed version by default', () => {
    const applyOverrides = createApplyOverrides({ installed: '2.0.0', inWorkspacePolicy: '3.0.1' });
    expect(applyOverrides.resolveEnvPeerDepVersion('my-pkg')).to.equal('2.0.0');
  });
  it('should prefer the workspace policy when asked to, as the installed version could be outdated', () => {
    const applyOverrides = createApplyOverrides({ installed: '2.0.0', inWorkspacePolicy: '3.0.1' });
    expect(applyOverrides.resolveEnvPeerDepVersion('my-pkg', true)).to.equal('3.0.1');
  });
  it('should prefer the installed version when it satisfies the workspace policy range', () => {
    const applyOverrides = createApplyOverrides({ installed: '18.2.0', inWorkspacePolicy: '^18.0.0' });
    expect(applyOverrides.resolveEnvPeerDepVersion('my-pkg', true)).to.equal('18.2.0');
  });
  it('should take the minimum version of the workspace policy range when the installed one is outdated', () => {
    const applyOverrides = createApplyOverrides({ installed: '17.0.0', inWorkspacePolicy: '^18.1.0' });
    expect(applyOverrides.resolveEnvPeerDepVersion('my-pkg', true)).to.equal('18.1.0');
  });
  it('should fall back to the installed version when the workspace policy does not have the package', () => {
    const applyOverrides = createApplyOverrides({ installed: '2.0.0' });
    expect(applyOverrides.resolveEnvPeerDepVersion('my-pkg', true)).to.equal('2.0.0');
  });
});
