import { expect } from 'chai';
import { WorkspaceManifestFactory } from './workspace-manifest-factory';

function resolveConflictingPeerVersions(versionsPerEnv: Array<[string, string]>): string {
  const factory = Object.create(WorkspaceManifestFactory.prototype);
  const versionsMap = new Map<string, Set<string>>();
  versionsPerEnv.forEach(([version, envId]) => versionsMap.set(version, new Set([envId])));
  return factory.resolveConflictingPeerVersions('my-pkg', versionsMap);
}

describe('WorkspaceManifestFactory.resolveConflictingPeerVersions()', () => {
  it('should pick the strictest plus version, regardless of the order of the envs', () => {
    expect(
      resolveConflictingPeerVersions([
        ['+^', 'env1'],
        ['+~', 'env2'],
      ])
    ).to.equal('+~');
    expect(
      resolveConflictingPeerVersions([
        ['+~', 'env2'],
        ['+^', 'env1'],
      ])
    ).to.equal('+~');
    expect(
      resolveConflictingPeerVersions([
        ['+^', 'env1'],
        ['+', 'env2'],
      ])
    ).to.equal('+');
  });
});
