import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import { getGitExecutablePath } from '@teambit/git.modules.git-executable';
import { formatFileDiff } from '@teambit/legacy.component-diff/dist/format-file-diff.js';
import { diffMetadata } from '@teambit/legacy.component-diff/dist/diff-metadata.js';
import { withRustClientRequest, captureRustClientCurrent } from './rust-client-capture';
import { rustDiffMetadata } from './rust-diff-metadata';

type DiffJson = {
  id: string;
  hasDiff: boolean;
  filesDiff: Array<{ filePath: string; status: 'NEW' | 'DELETED' | 'MODIFIED'; diffOutput: string }>;
  fieldsDiff?: Array<{ fieldName: string; diffOutput: string }>;
};

export async function readRustDiff(root: string, home: string, pattern?: string): Promise<DiffJson[] | undefined> {
  return withRustClientRequest(async (request) => {
    const context = await request({ kind: 'statusContext', root, home, history: !pattern });
    if (
      context.targets.some(
        (target) =>
          target.version && !context.models.find((model) => `${model.scope}/${model.name}` === target.identity)?.head
      )
    )
      return undefined;
    let selected = context.targets;
    if (pattern) {
      if (!/^[a-z0-9_./-]+$/.test(pattern)) return undefined;
      const directory = path.posix.normalize(pattern).replace(/^\.\//, '');
      const fromRoot = selected.filter((target) => target.directory === directory);
      selected = fromRoot.length
        ? fromRoot
        : selected.filter(
            (target) =>
              target.identity === pattern || target.identity.slice(target.identity.indexOf('/') + 1) === pattern
          );
      if (selected.length !== 1) return undefined;
    }
    const capture = await captureRustClientCurrent(root, context, request, selected);
    if (!capture) return undefined;
    const targets = capture.captured.map(({ peerDependencies: _peerDependencies, ...target }) => target);
    const result = await request({
      kind: 'workspaceDiff',
      root,
      targets,
      gitExecutable: getGitExecutablePath(),
      color: true,
      modifiedOnly: !pattern,
    });
    if (!capture.fresh()) return undefined;
    let rows = result.comparisons;
    if (!pattern) rows = [...rows.filter((row) => !row.model), ...rows.filter((row) => row.model && row.modified)];
    const output: DiffJson[] = [];
    for (const row of rows) {
      const target = capture.captured.find((item) => item.identity === row.identity);
      const component = capture.components.find((item) => item.identity.split('@')[0] === row.identity);
      const version = target.version || 'latest';
      const filesDiff = row.files.flatMap((file) => {
        const diffOutput = file.same
          ? ''
          : formatFileDiff(
              file.rawDiff.replace(/\r?\n$/, ''),
              `${version} original`,
              `${version} modified`,
              file.relativePath
            );
        return diffOutput
          ? [
              {
                filePath: file.relativePath,
                status: file.fromEmpty ? 'NEW' : file.toEmpty ? 'DELETED' : 'MODIFIED',
                diffOutput,
              },
            ]
          : [];
      });
      let fieldsDiff;
      if (row.model) {
        const model = context.models.find((item) => `${item.scope}/${item.name}` === row.identity);
        fieldsDiff = await diffMetadata(
          rustDiffMetadata(target, model, row.model, [], component.packageName),
          rustDiffMetadata(target, model, row.current, target.peerDependencies, component.packageName, true),
          { formatDepsAsTable: false }
        );
      }
      output.push({
        id: row.identity,
        hasDiff: Boolean(filesDiff.length || fieldsDiff),
        filesDiff,
        ...(fieldsDiff === undefined ? {} : { fieldsDiff }),
      });
    }
    await capture.commit();
    return output;
  });
}

export async function runRustDiff(): Promise<boolean> {
  const args = process.argv.slice(2);
  if (args[0] !== 'diff' || ![2, 3].includes(args.length) || !['--json', '-j'].includes(args.at(-1)!)) return false;
  const pattern = args.length === 3 ? args[1] : undefined;
  let root = process.cwd();
  while (!fs.existsSync(path.join(root, 'workspace.jsonc'))) {
    const parent = path.dirname(root);
    if (parent === root) return false;
    root = parent;
  }
  const result = await readRustDiff(root, homedir(), pattern);
  if (!result) return false;
  const { CommandRunner } = await import('@teambit/cli/dist/command-runner.js');
  const { logger } = await import('@teambit/legacy.logger');
  const { Slot } = await import('@teambit/harmony');
  logger.writeCommandHistoryStart();
  const runner = new CommandRunner(
    {
      name: 'diff [component-pattern] [version] [to-version]',
      description: '',
      loader: true,
      pager: true,
      json: async () => result,
    },
    pattern ? [pattern] : [],
    { json: true },
    Slot.withType<any>()(() => 'teambit.harmony/bit')
  );
  await runner.runCommand();
  return true;
}
