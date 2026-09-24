import { spawn } from 'child_process';
import fs from 'fs/promises';

export type PnpmError = Error & { output?: string };

/**
 * runs pnpm with the given arguments. resolves with its output, stdout and stderr interleaved as
 * printed, and rejects with an error carrying that output when pnpm exits with a failure.
 */
export function runPnpm(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, { cwd, shell: process.platform === 'win32' });
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
