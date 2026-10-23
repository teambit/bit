import { expect } from 'chai';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { Dependency } from '@teambit/legacy.consumer-component';
import { ComponentOverrides } from '@teambit/legacy.consumer-config';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import type { Logger } from '@teambit/logger';
import { ApplyOverrides } from './apply-overrides';

const noopLogger = { debug() {}, warn() {}, trace() {} } as unknown as Logger;

function createApplyOverrides(forcedDeps: Record<string, Record<string, string>>) {
  const id = ComponentID.fromString('my-scope/my-env@0.0.1');
  const component = { id, componentId: id, issues: undefined, overrides: new ComponentOverrides(forcedDeps) };
  // no workspace, as in a bare scope
  return new ApplyOverrides(component as any, {} as DependencyResolverMain, noopLogger);
}

describe('ApplyOverrides', () => {
  describe('outside a workspace, a forced dependency that is a component dependency in another field', () => {
    // e.g. a peer that an env sets for itself (in env.jsonc) is a runtime dependency of the env. the env of the env
    // may set it as a peer, which moves the component dependency to the peers before the forced deps are added.
    const peerDep = new Dependency(
      ComponentID.fromString('my-scope/ui/button@1.0.0'),
      [],
      '@my-scope/ui.button',
      '^1.0.0'
    );
    let result: ReturnType<ApplyOverrides['getDependenciesToAddManually']>;
    before(() => {
      const applyOverrides = createApplyOverrides({ dependencies: { '@my-scope/ui.button': '1.0.0' } });
      applyOverrides.allDependencies = { dependencies: [], devDependencies: [], peerDependencies: [peerDep] };
      result = applyOverrides.getDependenciesToAddManually(undefined, applyOverrides.allDependencies);
    });
    it('should resolve the package to the component, as the node_modules of a workspace would', () => {
      expect(result?.components.dependencies).to.have.lengthOf(1);
      expect(result?.components.dependencies[0].componentId.toString()).to.equal('my-scope/ui/button@1.0.0');
      expect(result?.packages).to.deep.equal({});
    });
    it('should not set a version range on a runtime component dependency', () => {
      expect(result?.components.dependencies[0].versionRange).to.be.undefined;
    });
  });
});

describe('ApplyOverrides outside a workspace, when the dependencies are calculated from a new policy', () => {
  // e.g. a lane merge from a bare scope. a workspace takes these versions from the policy, .bitmap and node_modules.
  const buttonId = ComponentID.fromString('my-scope/ui/button@1.0.0');
  const buttonPkg = '@my-scope/ui.button';
  function loadForcedDep({ inWorkspace = false, envOwn = false, newPolicy = true } = {}) {
    const applyOverrides = createApplyOverrides({ dependencies: { [buttonPkg]: '2.0.0' } });
    const dep = new Dependency(buttonId, [], buttonPkg);
    applyOverrides.allDependencies = { dependencies: [dep], devDependencies: [], peerDependencies: [] };
    if (newPolicy) applyOverrides.workspaceComponentIds = ComponentIdList.fromArray(inWorkspace ? [buttonId] : []);
    if (envOwn) applyOverrides.overridesDependencies.envOwnPkgNames = new Set([buttonPkg]);
    applyOverrides.getDependenciesToAddManually(undefined, applyOverrides.allDependencies);
    return { dep, component: (applyOverrides as any).component };
  }
  function applyPeerRange(range: string, { inWorkspace = false } = {}) {
    const applyOverrides = createApplyOverrides({});
    const peer = new Dependency(buttonId, [], buttonPkg, '1.0.0');
    applyOverrides.allDependencies = { dependencies: [], devDependencies: [], peerDependencies: [peer] };
    applyOverrides.workspaceComponentIds = ComponentIdList.fromArray(inWorkspace ? [buttonId] : []);
    (applyOverrides as any).applyPackageVersion('peerDependencies', buttonPkg, range, undefined, undefined, peer);
    return peer;
  }
  it('should set the version of a forced component dependency and keep it when a new version is snapped along', () => {
    const { dep, component } = loadForcedDep();
    expect(dep.id.version).to.equal('2.0.0');
    expect(component.dependenciesWithVersionFromConfig).to.deep.equal(['my-scope/ui/button']);
  });
  it('should set the version of a forced dependency on a workspace component', () => {
    expect(loadForcedDep({ inWorkspace: true }).dep.id.version).to.equal('2.0.0');
  });
  it('should keep the version of an env own dependency on a workspace component, which follows the workspace', () => {
    const { dep, component } = loadForcedDep({ inWorkspace: true, envOwn: true });
    expect(dep.id.version).to.equal('1.0.0');
    expect(component.dependenciesWithVersionFromConfig).to.be.undefined;
  });
  it('should keep the version when the policy is not new (e.g. a tag from a scope)', () => {
    expect(loadForcedDep({ newPolicy: false }).dep.id.version).to.equal('1.0.0');
  });
  it('should set the version of a component peer that is out of the range of the policy', () => {
    const peer = applyPeerRange('2.0.0');
    expect(peer.id.version).to.equal('2.0.0');
    expect(peer.versionRange).to.equal('2.0.0');
  });
  it('should keep the version of a component peer that is in the range of the policy', () => {
    expect(applyPeerRange('^1.0.0').id.version).to.equal('1.0.0');
  });
  it('should keep the version of a component peer that is a workspace component', () => {
    expect(applyPeerRange('2.0.0', { inWorkspace: true }).id.version).to.equal('1.0.0');
  });
});

function createApplyOverridesWithPolicy({
  installed,
  inWorkspacePolicy,
}: {
  installed?: string;
  inWorkspacePolicy?: string;
}) {
  const applyOverrides = Object.create(ApplyOverrides.prototype);
  applyOverrides.depsResolver = {
    getWorkspacePolicyManifest: () => ({ dependencies: inWorkspacePolicy ? { 'my-pkg': inWorkspacePolicy } : {} }),
  };
  applyOverrides._resolvePackageData = () => (installed ? { concreteVersion: installed } : undefined);
  return applyOverrides;
}

describe('ApplyOverrides.resolveEnvPeerDepVersion()', () => {
  it('should prefer the installed version by default', () => {
    const applyOverrides = createApplyOverridesWithPolicy({ installed: '2.0.0', inWorkspacePolicy: '3.0.1' });
    expect(applyOverrides.resolveEnvPeerDepVersion('my-pkg')).to.equal('2.0.0');
  });
  it('should prefer the workspace policy when asked to, as the installed version could be outdated', () => {
    const applyOverrides = createApplyOverridesWithPolicy({ installed: '2.0.0', inWorkspacePolicy: '3.0.1' });
    expect(applyOverrides.resolveEnvPeerDepVersion('my-pkg', true)).to.equal('3.0.1');
  });
  it('should prefer the installed version when it satisfies the workspace policy range', () => {
    const applyOverrides = createApplyOverridesWithPolicy({ installed: '18.2.0', inWorkspacePolicy: '^18.0.0' });
    expect(applyOverrides.resolveEnvPeerDepVersion('my-pkg', true)).to.equal('18.2.0');
  });
  it('should take the minimum version of the workspace policy range when the installed one is outdated', () => {
    const applyOverrides = createApplyOverridesWithPolicy({ installed: '17.0.0', inWorkspacePolicy: '^18.1.0' });
    expect(applyOverrides.resolveEnvPeerDepVersion('my-pkg', true)).to.equal('18.1.0');
  });
  it('should keep an unconstrained workspace policy range as is', () => {
    const applyOverrides = createApplyOverridesWithPolicy({ inWorkspacePolicy: '*' });
    expect(applyOverrides.resolveEnvPeerDepVersion('my-pkg', true)).to.equal('*');
  });
  it('should fall back to the installed version when the workspace policy does not have the package', () => {
    const applyOverrides = createApplyOverridesWithPolicy({ installed: '2.0.0' });
    expect(applyOverrides.resolveEnvPeerDepVersion('my-pkg', true)).to.equal('2.0.0');
  });
});
