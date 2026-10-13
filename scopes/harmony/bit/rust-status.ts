import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import { snapshotSemverGrammar } from '@teambit/pkg.modules.semver-helper';
import { collectRustStatusIssues } from './rust-status-issues';
import { withRustClientRequest, captureRustClientCurrent } from './rust-client-capture';

export async function readRustStatus(root: string, home: string): Promise<any | undefined> {
  return withRustClientRequest(async (request) => {
    const context = await request({ kind: 'statusContext', root, home });
    const capture = await captureRustClientCurrent(root, context, request);
    if (!capture) return undefined;
    const { comparisons, components } = capture;
    const compared = await request({ kind: 'statusCompare', root, targets: comparisons });
    const issues = await collectRustStatusIssues(root, context, components);
    if (!issues || !capture.fresh()) return undefined;
    const targets = context.targets.map((target, index) => ({
      identity: target.identity,
      version: target.version,
      modified: compared.comparisons.find((row) => row.identity === target.identity)?.modified ?? false,
      dependencies: components[index].dependencies,
      issues: issues.find((row) => row.id === target.identity)?.issues ?? [],
    }));
    const versions = [
      ...targets.map((target) => target.version),
      ...components.flatMap((component) => component.dependencies.map((dep) => dep.split('@')[1] ?? '')),
      ...context.models.flatMap((model) => [
        ...Object.keys(model.versions ?? {}),
        ...Object.keys(model.orphanedVersions ?? {}),
        model.head ?? '',
      ]),
      ...context.histories.map((history) => history.remoteHead ?? ''),
    ];
    const semver = snapshotSemverGrammar(versions);
    if (!semver) return undefined;
    const result = await request({
      kind: 'statusResult',
      currentLaneId: `${context.scope.name}/main`,
      targets,
      models: context.models,
      histories: context.histories,
      semver,
    });
    for (const [key, rows] of Object.entries(result)) {
      if (Array.isArray(rows) && key !== 'importPendingComponents')
        rows.sort((a, b) => (typeof a === 'string' ? a : a.id).localeCompare(typeof b === 'string' ? b : b.id));
    }
    return result;
  });
}

export async function runRustStatus(): Promise<boolean> {
  const args = process.argv.slice(2);
  if (args.length !== 2 || !['status', 's'].includes(args[0]) || !['--json', '-j'].includes(args[1])) return false;
  let root = process.cwd();
  while (!fs.existsSync(path.join(root, 'workspace.jsonc'))) {
    const parent = path.dirname(root);
    if (parent === root) return false;
    root = parent;
  }
  const result = await readRustStatus(root, homedir());
  if (!result) return false;
  const { CommandRunner } = await import('@teambit/cli/dist/command-runner.js');
  const { logger } = await import('@teambit/legacy.logger');
  const { Slot } = await import('@teambit/harmony');
  logger.writeCommandHistoryStart();
  const runner = new CommandRunner(
    { name: 'status', description: '', loader: true, json: async () => result },
    [],
    { json: true },
    Slot.withType<any>()(() => 'teambit.harmony/bit')
  );
  await runner.runCommand();
  return true;
}
