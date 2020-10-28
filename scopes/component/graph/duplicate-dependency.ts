// eslint-disable-next-line import/no-cycle
import type { ComponentGraph } from './component-graph';

export class DuplicateDependency {
  latestVersionId: string;
  priorVersions: VersionSubgraph[];

  constructor(latestVersionId: string, priorVersions: VersionSubgraph[]) {
    this.latestVersionId = latestVersionId;
    this.priorVersions = priorVersions;
  }
}

export type VersionSubgraph = {
  versionId: string;
  subGraph: ComponentGraph;
  immediateDependents: string[];
};
