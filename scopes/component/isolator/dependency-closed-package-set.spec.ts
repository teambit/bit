import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import type { ComponentIdGraph } from '@teambit/graph';
import { enforceDependencyClosedPackageSet } from './dependency-closed-package-set';

describe('enforceDependencyClosedPackageSet', () => {
  it('keeps closure propagation version-accurate when the graph contains multiple component versions', () => {
    const consumerOfV1 = ComponentID.fromString('scope/consumer-v1@1.0.0');
    const consumerOfV2 = ComponentID.fromString('scope/consumer-v2@1.0.0');
    const dependencyV1 = ComponentID.fromString('scope/dependency@1.0.0');
    const dependencyV2 = ComponentID.fromString('scope/dependency@2.0.0');
    const nodes = new Map(
      [consumerOfV1, consumerOfV2, dependencyV1, dependencyV2].map((id) => [id.toString(), { attr: id }])
    );
    const graph = {
      edges: [
        { sourceId: consumerOfV1.toString(), targetId: dependencyV1.toString(), attr: 'prod' },
        { sourceId: consumerOfV2.toString(), targetId: dependencyV2.toString(), attr: 'prod' },
      ],
      node: (id: string) => nodes.get(id),
    } as unknown as ComponentIdGraph;
    const capsuleIds = new Set([dependencyV2.toString()]);
    const packageCandidateIds = new Set([consumerOfV1.toString(), consumerOfV2.toString(), dependencyV1.toString()]);

    enforceDependencyClosedPackageSet(graph, capsuleIds, packageCandidateIds);

    expect(capsuleIds).to.include(consumerOfV2.toString());
    expect(capsuleIds).to.not.include(consumerOfV1.toString());
    expect(packageCandidateIds).to.include(consumerOfV1.toString());
    expect(packageCandidateIds).to.include(dependencyV1.toString());
  });
});
