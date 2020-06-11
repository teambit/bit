// eslint-disable-next-line import/no-cycle
import { ComponentGraph } from './component-graph'; // todo: change to "import type" once babel supports it

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
