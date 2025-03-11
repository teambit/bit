import semver from 'semver';
import { LockfilePackageInfo } from '@pnpm/lockfile.types';
import * as dp from '@pnpm/dependency-path';

export type PackagesMap = Map<string, PackageAttributes>;

export type PackageAttributes = LockfilePackageInfo & {
  component?: {
    scope: string;
    name: string;
  };
};

export type DependencyEdge = {
  id: string;
  neighbours: DependencyNeighbour[];
  attr?: {
    pkgId?: string;
    transitivePeerDependencies?: string[];
  };
};

export type DependencyNeighbour = {
  id: string;
  /**
   * This is true when the dependency is from optionalDependencies.
   */
  optional?: boolean;
  name?: string;
  specifier?: string;
  lifecycle?: 'runtime' | 'dev';
};

const DEPENDENCIES_GRAPH_SCHEMA_VERSION = '1.0';

export class DependenciesGraph {
  static ROOT_EDGE_ID = '.';

  schemaVersion: string;
  packages: PackagesMap;
  edges: DependencyEdge[];

  constructor({
    packages,
    edges,
    schemaVersion,
  }: {
    packages: PackagesMap;
    edges: DependencyEdge[];
    schemaVersion?: string;
  }) {
    this.packages = packages;
    this.edges = edges;
    this.schemaVersion = schemaVersion ?? DEPENDENCIES_GRAPH_SCHEMA_VERSION;
  }

  serialize(): string {
    return JSON.stringify({
      schemaVersion: this.schemaVersion,
      packages: Object.fromEntries(this.packages.entries()),
      edges: this.edges,
    });
  }

  static deserialize(data: string): DependenciesGraph | undefined {
    const parsed = JSON.parse(data);
    // If the schema version is not supported, then we just ignore the data
    if (parsed.schemaVersion !== DEPENDENCIES_GRAPH_SCHEMA_VERSION) {
      return undefined;
    }
    return new DependenciesGraph({
      schemaVersion: parsed.schemaVersion,
      edges: parsed.edges,
      packages: new Map(Object.entries(parsed.packages)),
    });
  }

  merge(graph: DependenciesGraph): void {
    const directDependencies = graph.findRootEdge()?.neighbours;
    if (directDependencies) {
      for (const directDep of directDependencies) {
        const existingDirectDeps = this.findRootEdge()?.neighbours;
        if (existingDirectDeps) {
          const existingDirectDep = existingDirectDeps.find(
            ({ name, specifier }) => name === directDep.name && specifier === directDep.specifier
          );
          if (existingDirectDep == null) {
            existingDirectDeps.push(directDep);
          } else if (existingDirectDep.id !== directDep.id && nodeIdLessThan(existingDirectDep.id, directDep.id)) {
            existingDirectDep.id = directDep.id;
          }
        }
      }
    }
    for (const [newPkgId, newPkgAttr] of graph.packages.entries()) {
      this.packages.set(newPkgId, newPkgAttr);
    }
    this.edges.push(...graph.edges);
  }

  isEmpty(): boolean {
    return this.packages.size === 0 && this.edges.length === 0;
  }

  /**
   * Returns the edge related to the root component
   */
  findRootEdge(): DependencyEdge | undefined {
    return this.edges.find(({ id }) => id === DependenciesGraph.ROOT_EDGE_ID);
  }
}

function nodeIdLessThan(nodeId1: string, nodeId2: string): boolean {
  const parsed1 = dp.parse(nodeId1);
  if (!parsed1?.version) return false;
  const parsed2 = dp.parse(nodeId2);
  if (!parsed2?.version) return false;
  return semver.lt(parsed1.version, parsed2.version);
}
