import fs from 'fs-extra';
import path from 'path';
import yesno from 'yesno';
import { PathLinuxRelative } from '@teambit/legacy/dist/utils/path';
import { compact, invertBy, uniq } from 'lodash';
import { PromptCanceled } from '@teambit/legacy/dist/prompts/exceptions';
import { Environment, ExecutionContext } from '@teambit/envs';
import { Workspace } from '@teambit/workspace';
import { Logger } from '@teambit/logger';
import chalk from 'chalk';
import { TsconfigWriterOptions } from './typescript.main.runtime';

export type TsconfigPathsPerEnv = { envId: string; tsconfig: Record<string, any>; paths: string[] };

type PathsPerEnv = { env: Environment; id: string; paths: string[] };

export class TsconfigWriter {
  constructor(private workspace: Workspace, private logger: Logger) {}

  async write(
    envsExecutionContext: ExecutionContext[],
    options: TsconfigWriterOptions
  ): Promise<TsconfigPathsPerEnv[]> {
    const pathsPerEnvs = this.getPathsPerEnv(envsExecutionContext, options);
    const tsconfigPathsPerEnv = pathsPerEnvs.map((pathsPerEnv) => ({
      envId: pathsPerEnv.id,
      tsconfig: pathsPerEnv.env.getTsConfig(),
      paths: pathsPerEnv.paths,
    }));
    if (options.dryRun) return tsconfigPathsPerEnv;
    if (!options.silent) await this.promptForWriting(tsconfigPathsPerEnv.map((p) => p.paths).flat());
    await this.writeFiles(tsconfigPathsPerEnv);
    return tsconfigPathsPerEnv;
  }

  async clean(envsExecutionContext: ExecutionContext[], { dryRun, silent }: TsconfigWriterOptions): Promise<string[]> {
    const pathsPerEnvs = this.getPathsPerEnv(envsExecutionContext, { dedupe: false });
    const componentPaths = pathsPerEnvs.map((p) => p.paths).flat();
    const allPossibleDirs = getAllPossibleDirsFromPaths(componentPaths);
    const dirsWithTsconfig = await filterDirsWithTsconfigFile(allPossibleDirs);
    const tsconfigFiles = dirsWithTsconfig.map((dir) => path.join(dir, 'tsconfig.json'));
    if (dryRun) return tsconfigFiles;
    if (!dirsWithTsconfig.length) return [];
    if (!silent) await this.promptForCleaning(tsconfigFiles);
    await this.deleteFiles(tsconfigFiles);
    return tsconfigFiles;
  }

  private async promptForWriting(dirs: string[]) {
    this.logger.clearStatusLine();
    const tsconfigFiles = dirs.map((dir) => path.join(dir, 'tsconfig.json'));
    const ok = await yesno({
      question: `${chalk.underline('The following paths will be written:')}
${tsconfigFiles.join('\n')}
${chalk.bold('Do you want to continue? [yes(y)/no(n)]')}`,
    });
    if (!ok) {
      throw new PromptCanceled();
    }
  }

  private async promptForCleaning(tsconfigFiles: string[]) {
    this.logger.clearStatusLine();
    const ok = await yesno({
      question: `${chalk.underline('The following paths will be deleted:')}
${tsconfigFiles.join('\n')}
${chalk.bold('Do you want to continue? [yes(y)/no(n)]')}`,
    });
    if (!ok) {
      throw new PromptCanceled();
    }
  }

  private async deleteFiles(tsconfigFiles: string[]) {
    await Promise.all(tsconfigFiles.map((f) => fs.remove(f)));
  }

  private async writeFiles(tsconfigPathsPerEnvs: TsconfigPathsPerEnv[]) {
    await Promise.all(
      tsconfigPathsPerEnvs.map((pathsPerEnv) => {
        return Promise.all(
          pathsPerEnv.paths.map((p) => fs.writeJSON(path.join(p, 'tsconfig.json'), pathsPerEnv.tsconfig, { spaces: 2 }))
        );
      })
    );
  }

  private getPathsPerEnv(envsExecutionContext: ExecutionContext[], { dedupe }: TsconfigWriterOptions): PathsPerEnv[] {
    const pathsPerEnvs = envsExecutionContext.map((envExecution) => {
      return {
        id: envExecution.id,
        env: envExecution.env,
        paths: envExecution.components.map((c) => this.workspace.componentDir(c.id, undefined, { relative: true })),
      };
    });
    if (!dedupe) {
      return pathsPerEnvs;
    }

    const pathsPerEnvId = pathsPerEnvs.map((p) => ({ id: p.id, paths: p.paths }));
    const envsPerDedupedPaths = dedupePaths(pathsPerEnvId);
    const dedupedPathsPerEnvs: PathsPerEnv[] = envsPerDedupedPaths.map((envWithDedupePaths) => {
      const found = pathsPerEnvs.find((p) => p.id === envWithDedupePaths.id);
      if (!found) throw new Error(`dedupedPathsPerEnvs, unable to find ${envWithDedupePaths.id}`);
      return {
        env: found.env,
        id: found.id,
        paths: envWithDedupePaths.paths,
      };
    });

    return dedupedPathsPerEnvs;
  }
}

type PathsPerEnvId = { id: string; paths: string[] };

async function filterDirsWithTsconfigFile(dirs: string[]): Promise<string[]> {
  const dirsWithTsconfig = await Promise.all(
    dirs.map(async (dir) => {
      const hasTsconfig = await fs.pathExists(path.join(dir, 'tsconfig.json'));
      return hasTsconfig ? dir : undefined;
    })
  );
  return compact(dirsWithTsconfig);
}

function getAllPossibleDirsFromPaths(paths: PathLinuxRelative[]): PathLinuxRelative[] {
  const dirs = paths.map((p) => getAllParentsDirOfPath(p)).flat();
  dirs.push('.'); // add the root dir
  return uniq(dirs);
}

function getAllParentsDirOfPath(p: PathLinuxRelative): PathLinuxRelative[] {
  const all: string[] = [];
  let current = p;
  while (current !== '.') {
    all.push(current);
    current = path.dirname(current);
  }
  return all;
}

/**
 * easier to understand by an example:
 * input:
 * [
 *   { id: react, paths: [ui/button, ui/form] },
 *   { id: aspect, paths: [p/a1, p/a2] },
 *   { id: node, paths: [p/n1] },
 * ]
 *
 * output:
 * [
 *   { id: react, paths: [ui] },
 *   { id: aspect, paths: [p] },
 *   { id: node, paths: [p/n1] },
 * ]
 *
 * the goal is to minimize the amount of files to write per env if possible.
 * when multiple components of the same env share a root-dir, then, it's enough to write a file in that shared dir.
 * if in a shared-dir, some components using env1 and some env2, it finds the env that has the max number of
 * components, this env will be optimized. other components, will have the files written inside their dirs.
 */
export function dedupePaths(pathsPerEnvId: PathsPerEnvId[]): PathsPerEnvId[] {
  const rootDir = '.';
  const individualPathPerEnvId: { [path: string]: string } = pathsPerEnvId.reduce((acc, current) => {
    current.paths.forEach((p) => {
      acc[p] = current.id;
    });
    return acc;
  }, {});
  const allPaths = Object.keys(individualPathPerEnvId);
  const allPossibleDirs = getAllPossibleDirsFromPaths(allPaths);

  const allPathsPerEnvId: { [path: string]: string | null } = {}; // null when parent-dir has same amount of comps per env.

  const calculateBestEnvForDir = (dir: string) => {
    if (individualPathPerEnvId[dir]) {
      // it's the component dir, so it's the best env
      allPathsPerEnvId[dir] = individualPathPerEnvId[dir];
      return;
    }
    const allPathsShareSameDir = dir === rootDir ? allPaths : allPaths.filter((p) => p.startsWith(`${dir}/`));
    const countPerEnv: { [env: string]: number } = {};
    allPathsShareSameDir.forEach((p) => {
      const envIdStr = individualPathPerEnvId[p];
      if (countPerEnv[envIdStr]) countPerEnv[envIdStr] += 1;
      else countPerEnv[envIdStr] = 1;
    });
    const max = Math.max(...Object.values(countPerEnv));
    const envWithMax = Object.keys(countPerEnv).filter((env) => countPerEnv[env] === max);
    if (!envWithMax.length) throw new Error(`must be at least one env related to path "${dir}"`);
    if (envWithMax.length > 1) allPathsPerEnvId[dir] = null;
    else allPathsPerEnvId[dir] = envWithMax[0];
  };

  allPossibleDirs.forEach((dirPath) => {
    calculateBestEnvForDir(dirPath);
  });

  // this is the actual deduping. if found a shorter path with the same env, then no need for this path.
  // in other words, return only the paths that their parent is null or has a different env.
  const dedupedPathsPerEnvId = Object.keys(allPathsPerEnvId).reduce((acc, current) => {
    if (allPathsPerEnvId[current] && allPathsPerEnvId[path.dirname(current)] !== allPathsPerEnvId[current]) {
      acc[current] = allPathsPerEnvId[current];
    }

    return acc;
  }, {});
  // rootDir parent is always rootDir, so leave it as is.
  if (allPathsPerEnvId[rootDir]) dedupedPathsPerEnvId[rootDir] = allPathsPerEnvId[rootDir];

  const envIdPerDedupedPaths = invertBy(dedupedPathsPerEnvId);

  return Object.keys(envIdPerDedupedPaths).map((envIdStr) => ({ id: envIdStr, paths: envIdPerDedupedPaths[envIdStr] }));
}
