import { ComponentGraph } from './index';

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
