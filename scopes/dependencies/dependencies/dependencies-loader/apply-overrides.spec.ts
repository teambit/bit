import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
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
