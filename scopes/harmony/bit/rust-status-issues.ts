import { ordinaryResolveIssueHeads, resolveExternalIssueVertices } from './rust-workspace-resolve-heads';
import fs from 'fs';
import path from 'path';
import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import { IssuesList, IssuesClasses } from '@teambit/component-issues';
import { getRootComponentDir } from '@teambit/workspace.root-components';

type Component = {
  identity: string;
  packageName: string;
  dependencies: string[];
  issues: { type: string; data: string }[];
};

/** Built-in issue formatting at the cold default-Node boundary. Unknown graph
 * vertices retain canonical loading, including external deprecation/removal. */
export async function collectRustStatusIssues(
  root: string,
  context: any,
  components: Component[],
  resolveIssueHeads?: any,
  issueGraph?: any
) {
  const external = resolveIssueHeads === undefined ? [] : resolveExternalIssueVertices(components, issueGraph);
  if (!external) return undefined;
  const graphComponents = [...components, ...external];
  const graphIds = new Set(graphComponents.map((component) => component.identity));
  if (components.some((component) => component.dependencies.some((id) => !graphIds.has(id)))) return undefined;
  if (
    !(resolveIssueHeads === undefined
      ? ordinaryModelHeads(context)
      : ordinaryResolveIssueHeads(context, resolveIssueHeads))
  )
    return undefined;
  const graph = new Graph(
    graphComponents.map((component) => new Node(component.identity, true)),
    graphComponents.flatMap((component) =>
      [...new Set(component.dependencies)].map((id) => new Edge(component.identity, id, true))
    )
  );
  const circular = new Set(graph.findCycles().flat());
  const resolver = context.workspace['teambit.dependencies/dependency-resolver'] || {};
  const workspacePackages = new Set([
    ...['dependencies', 'peerDependencies'].flatMap((field) => Object.keys(resolver.policy?.[field] || {})),
    ...['dependencies', 'devDependencies', 'peerDependencies'].flatMap((field) =>
      Object.keys(context.packageJson?.[field] || {})
    ),
  ]);
  return Promise.all(
    components.map(async (component) => {
      const issues = IssuesList.deserialize(component.issues);
      const target = context.targets.find((row: any) => row.identity === withoutVersion(component.identity));
      if (!target) throw new Error('status issue target missing');
      if (target.directory !== '.' && !fs.existsSync(path.join(root, 'node_modules', component.packageName)))
        issues.getOrCreate(IssuesClasses.MissingLinksFromNodeModulesToSrc).data = true;
      const modulePath = runtimeModulePath(root, component, Boolean(resolver.rootComponents));
      if (!(await exists(path.join(modulePath, 'dist')))) issues.getOrCreate(IssuesClasses.MissingDists).data = true;
      if (target.directory !== '.' && workspacePackages.has(component.packageName))
        issues.getOrCreate(IssuesClasses.DuplicateComponentAndPackage).data = component.packageName;
      if (circular.has(component.identity)) issues.getOrCreate(IssuesClasses.CircularDependencies).data = true;
      return { id: withoutVersion(component.identity), issues: issues.toObjectIncludeDataAsString() };
    })
  );
}

function ordinaryModelHeads(context: any): boolean {
  const versions = new Map<string, any>(context.versions);
  return context.models.every((model: any) => {
    if (model.deprecated) return false;
    if (!model.head) return true;
    const head = versions.get(model.head);
    return (
      head &&
      !(head.extensions || []).some((extension: any) =>
        ['teambit.component/deprecation', 'teambit.component/remove'].includes(extension.name)
      )
    );
  });
}

function runtimeModulePath(root: string, component: Component, rootComponents: boolean): string {
  const ordinary = path.join(root, 'node_modules', component.packageName);
  if (!rootComponents) return ordinary;
  const roots = path.join(root, 'node_modules', '.bit_roots');
  const self = getRootComponentDir(roots, withoutVersion(component.identity));
  const selectedRoot = fs.existsSync(self) ? self : getRootComponentDir(roots, 'teambit.harmony/node');
  const inner = path.join(selectedRoot, 'node_modules', component.packageName);
  return fs.existsSync(inner) ? inner : ordinary;
}

async function exists(filename: string): Promise<boolean> {
  try {
    await fs.promises.access(filename);
    return true;
  } catch (error: any) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}

function withoutVersion(identity: string): string {
  return identity.split('@')[0];
}
