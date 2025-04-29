import semver from 'semver';
import { PackageInfo } from '@pnpm/lockfile.types';
import * as dp from '@pnpm/dependency-path';

export type PackagesMap = Map<string, PackageAttributes>;

export type PackageAttributes = PackageInfo & {
  component?: {
    scope: string;
    name: string;
  };
  requiresBuild?: boolean;
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

const DEPENDENCIES_GRAPH_SCHEMA_VERSION = '2.0';

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
    return this.findEdgeById(DependenciesGraph.ROOT_EDGE_ID);
  }

  findEdgeById(edgeId: string): DependencyEdge | undefined {
    return this.edges.find(({ id }) => id === edgeId);
  }

  /**
   * Finds all possible paths from the root to the specified package names
   * @param targetPackageNames Array of package names to find paths to
   * @returns An object mapping each target package name to an array of paths,
   *          where each path is an array of node IDs representing the traversal from root to target
   */
  findPathsToPackages(targetPackageNames: string[]): Record<string, string[][]> {
    const result: Record<string, string[][]> = {};
    const rootEdge = this.findRootEdge();

    // Initialize result object with empty arrays for each target package
    for (const packageName of targetPackageNames) {
      result[packageName] = [];
    }

    if (!rootEdge) {
      return result; // Return empty result if no root edge found
    }

    // Helper function to perform depth-first search
    const dfs = (
      currentEdgeId: string,
      currentPath: string[],
      visited: Set<string>
    ) => {
      // Avoid cycles by checking if we've already visited this node
      if (visited.has(currentEdgeId)) {
        return;
      }

      visited.add(currentEdgeId);
      currentPath.push(currentEdgeId);

      // Find the current edge
      const currentEdge = this.findEdgeById(currentEdgeId);

      // Check if the current edge represents a package in our target list
      const parsed = dp.parse(currentEdgeId);
      if (parsed.name) {
        // console.log(packageAttr.name)
        if (targetPackageNames.includes(parsed.name)) {
          // Found a path to a target package, add it to results
          result[parsed.name].push([...currentPath]);
        }
      }

      if (currentEdge) {
        // Visit all neighbors
        for (const neighbor of currentEdge.neighbours) {
          if (neighbor.id != null) { // We currently ignore the "linked" packages.
            dfs(neighbor.id, [...currentPath], new Set(visited));
          }
        }
      }

      // Backtrack
      currentPath.pop();
      visited.delete(currentEdgeId);
    };

    // Start DFS from the root edge
    dfs(rootEdge.id, [], new Set());

    return result;
  }
}

function nodeIdLessThan(nodeId1: string, nodeId2: string): boolean {
  const parsed1 = dp.parse(nodeId1);
  if (!parsed1?.version) return false;
  const parsed2 = dp.parse(nodeId2);
  if (!parsed2?.version) return false;
  return semver.lt(parsed1.version, parsed2.version);
}
