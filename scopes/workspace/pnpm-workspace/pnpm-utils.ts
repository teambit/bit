import { spawn } from 'child_process';
import fs from 'fs/promises';
import { getPathBeforeBuildScripts } from '@teambit/pnpm';

export type PnpmError = Error & { output?: string };

/** the package scripts the env runs. a project with none of them has nothing to build, so it gets the empty env */
export const PNPM_SCRIPTS = ['build', 'test', 'lint'] as const;
export type PnpmScript = (typeof PNPM_SCRIPTS)[number];

/**
 * the environment to run the user's pnpm with. the workspace is the user's, and so is its pnpm: the
 * one their shell finds, which wrote the lockfile. bit's installs put the directory of its own node
 * first on PATH, which can hide that pnpm behind another one, so the PATH goes back to the one before.
 */
export function userPnpmEnv(
  env: NodeJS.ProcessEnv = process.env,
  userPath = getPathBeforeBuildScripts()
): NodeJS.ProcessEnv {
  if (userPath === undefined) return env;
  // the variable is "Path" on Windows. another key of it would leave two, and which one wins is undefined
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
  return { ...env, [pathKey]: userPath };
}

/**
 * runs pnpm with the given arguments. resolves with its output, stdout and stderr interleaved as
 * printed, and rejects with an error carrying that output when pnpm exits with a failure.
 */
export function runPnpm(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, { cwd, env: userPnpmEnv(), shell: process.platform === 'win32' });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', (err: PnpmError) => reject(Object.assign(err, { output })));
    child.on('close', (code) => {
      if (code === 0) return resolve(output);
      const err: PnpmError = new Error(`"pnpm ${args.join(' ')}" exited with code ${code}`);
      return reject(Object.assign(err, { output }));
    });
  });
}

export function exists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(
    () => true,
    () => false
  );
}
