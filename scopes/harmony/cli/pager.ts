import { spawn } from 'child_process';
import { logger } from '@teambit/legacy.logger';
import type { Command, Flags } from './command';

/**
 * best-effort list of env vars set by ai-agent / automation runners. when any is present we
 * never page, so agents always receive the full command output at once (never partial/paged
 * data), even in the rare case they allocate a pseudo-tty.
 */
const AI_AGENT_ENV_VARS = ['CLAUDECODE', 'CLAUDE_CODE', 'CURSOR_AGENT'];

/**
 * detect whether the output is going to an interactive human terminal.
 * anything non-interactive (piped output, CI, ai-agents, bit-cli-server) gets the full output
 * with no pager.
 */
export function isInteractiveTerminal(): boolean {
  if (!process.stdout.isTTY) return false;
  if (logger.isDaemon) return false; // bit-cli-server: output travels over IPC, not a terminal
  if (process.env.CI) return false;
  if (AI_AGENT_ENV_VARS.some((name) => process.env[name])) return false;
  return true;
}

/**
 * decide whether a command's report output should be piped through a pager.
 * mirrors git: on by default for interactive terminals, off for anything else. explicit flags
 * (--pager / --no-pager) and the BIT_NO_PAGER env var override the automatic behavior.
 */
export function shouldUsePager(command: Command, flags: Flags): boolean {
  if (!command.pager) return false; // command didn't opt-in to paging
  if (flags.json) return false; // json is for machine consumption, never page it
  if (flags['no-pager'] || process.env.BIT_NO_PAGER) return false;
  if (flags.pager) return true; // explicit force-on, even when non-interactive
  return isInteractiveTerminal();
}

/**
 * pipe the given output through a pager (`less` by default). resolves to `true` once the data
 * was handed off to the pager, or `false` when no pager could be launched - in which case the
 * caller must write the data directly so nothing is lost.
 *
 * the pager binary is taken from BIT_PAGER, then PAGER, defaulting to `less`. for `less` we set
 * `LESS=FRX` (unless already set): quit if the output fits one screen (-F), keep ansi colors
 * (-R), and don't clear the screen on exit (-X). this means short output behaves exactly as it
 * did before (printed and back to the prompt, no full-screen pager).
 */
export function writeToPager(data: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const configuredPager = process.env.BIT_PAGER || process.env.PAGER;
    const [cmd, ...args] = (configuredPager || 'less').trim().split(/\s+/);
    if (!cmd || cmd === 'cat') {
      resolve(false); // paging effectively disabled by the user (empty / "cat" pager)
      return;
    }
    const env = { ...process.env };
    if (!env.LESS) env.LESS = 'FRX';

    try {
      const child = spawn(cmd, args, { stdio: ['pipe', 'inherit', 'inherit'], env });
      // pager missing (ENOENT) or otherwise failed to launch => fall back to a direct write.
      child.on('error', () => resolve(false));
      child.on('close', () => resolve(true));
      // ignore EPIPE that happens when the user quits the pager (e.g. "q") before all data is read.
      child.stdin?.on('error', () => {});
      child.stdin?.write(data);
      child.stdin?.end();
    } catch {
      resolve(false);
    }
  });
}
