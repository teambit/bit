import { spawn } from 'child_process';
import { basename } from 'path';
import { logger } from '@teambit/legacy.logger';
import { removeChalkCharacters } from '@teambit/legacy.utils';
import type { Command, Flags } from './command';

/**
 * best-effort list of env vars set by ai-agent / automation runners. when any is present we
 * never page, so agents always receive the full command output at once (never partial/paged
 * data), even in the rare case they allocate a pseudo-tty.
 */
const AI_AGENT_ENV_VARS = ['CLAUDECODE', 'CLAUDE_CODE', 'CURSOR_AGENT'];

/**
 * an env var counts as "set" when it's present at all, even if its value is an empty string. the
 * vars we gate on (CI, ai-agent markers, BIT_NO_PAGER) are opt-outs, so presence — not truthiness —
 * is what disables paging; this also matches automation runners that inject empty-string values.
 */
const isEnvSet = (name: string): boolean => process.env[name] !== undefined;

/**
 * detect whether the output is going to an interactive human terminal.
 * anything non-interactive (piped output, CI, ai-agents, bit-cli-server) gets the full output
 * with no pager.
 */
export function isInteractiveTerminal(): boolean {
  if (!process.stdout.isTTY) return false;
  // daemon contexts don't page: the bit-cli-server (output travels over IPC, no terminal) and the
  // experimental `bit cli` REPL (a pager would fight its readline interface over the TTY).
  if (logger.isDaemon) return false;
  if (isEnvSet('CI')) return false;
  if (AI_AGENT_ENV_VARS.some(isEnvSet)) return false;
  return true;
}

/**
 * whether the output already fits within the current terminal, in which case there's no reason
 * to page it (avoids the "press q to exit" annoyance for short output, without relying on the
 * version-dependent `less -F` behavior which is broken by `-X` in modern less). accounts for line
 * wrapping and ignores ansi color codes when measuring width. returns false when the terminal size
 * is unknown.
 */
export function fitsOnScreen(output: string): boolean {
  const { rows, columns } = process.stdout;
  if (!rows || !columns) return false;
  // split at most rows+1 lines — enough to prove overflow — so the array never scales with the
  // full (potentially huge) output; the loop below also early-exits once one screen is exceeded.
  const lines = output.replace(/\n$/, '').split('\n', rows + 1);
  let usedRows = 0;
  for (const line of lines) {
    const width = (removeChalkCharacters(line) || '').length;
    usedRows += width === 0 ? 1 : Math.ceil(width / columns);
    if (usedRows > rows) return false; // stop early once we know it overflows one screen
  }
  return true;
}

/**
 * decide whether a command's report output should be piped through a pager.
 * mirrors git: on by default for interactive terminals, off for anything else. explicit flags
 * (--pager / --no-pager) and the BIT_NO_PAGER env var override the automatic behavior. in the
 * automatic case, output that already fits on the screen is printed directly (no pager).
 */
export function shouldUsePager(command: Command, flags: Flags, output: string): boolean {
  if (!command.pager) return false; // command didn't opt-in to paging
  if (flags.json) return false; // json is for machine consumption, never page it
  // explicit CLI flags win over the BIT_NO_PAGER env var, so `--pager` can force paging for a
  // single invocation even when the user exports BIT_NO_PAGER globally.
  if (flags['no-pager']) return false;
  if (flags.pager) return true; // explicit force-on, even when non-interactive / fits on screen
  if (isEnvSet('BIT_NO_PAGER')) return false; // env opt-out (overridable by --pager above)
  if (!isInteractiveTerminal()) return false;
  return !fitsOnScreen(output); // only page when the output is longer than one screen
}

/**
 * split a configured pager string (BIT_PAGER / PAGER) into [command, ...args], honoring single and
 * double quotes so an executable path that contains spaces can be configured, e.g.
 * `"/Applications/My Pager/less" -R`. we deliberately don't run the pager through a shell (avoids
 * shell-injection and the ENOENT-swallows-output problem), so quoting is how a spaced path is
 * expressed.
 */
function parsePagerCommand(pager: string): string[] {
  const tokens = pager.match(/"[^"]*"|'[^']*'|\S+/g) || [];
  return tokens.map((token) => token.replace(/^["']|["']$/g, ''));
}

/**
 * pipe the given output through a pager (`less` by default). resolves to `true` only after the
 * pager process has exited cleanly — the caller must await this before exiting the process so the
 * pager isn't cut off. resolves to `false` when paging is disabled, the pager couldn't launch, or
 * it exited with an error, in which case the caller must write the data directly so nothing is lost.
 *
 * the pager binary is taken from BIT_PAGER, then PAGER, defaulting to `less`. an empty or `cat`
 * pager means the user disabled paging via the env — honored unless `force` is set (the `--pager`
 * flag), which falls back to a real pager so the flag is a true override. for `less` we set
 * `LESS=FRX` (unless already set, matching git's default): keep ansi colors (-R), don't clear the
 * screen on exit (-X), and quit if the output fits one screen (-F).
 */
export function writeToPager(data: string, force = false): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    // BIT_PAGER wins over PAGER; default to `less` only when neither is set. use `??` (not `||`)
    // so an explicit empty string is preserved rather than treated as unset — that lets
    // BIT_PAGER="" disable paging.
    const configuredPager = process.env.BIT_PAGER ?? process.env.PAGER ?? 'less';
    const tokens = parsePagerCommand(configuredPager);
    // an empty / "cat" pager means the user disabled paging. honor that, unless `--pager` forces
    // paging on, in which case fall back to a real pager so the flag is a true override.
    const disabled = !tokens[0] || tokens[0] === 'cat';
    if (disabled && !force) {
      resolve(false);
      return;
    }
    const [cmd, ...args] = disabled ? ['less'] : tokens;
    const env = { ...process.env };
    // LESS=FRX only makes sense for `less` itself; don't leak it into other pagers or wrapper scripts.
    if (/^less(\.exe)?$/i.test(basename(cmd)) && !env.LESS) env.LESS = 'FRX';

    try {
      const child = spawn(cmd, args, { stdio: ['pipe', 'inherit', 'inherit'], env });
      // pager missing (ENOENT) or otherwise failed to launch => fall back to a direct write.
      child.on('error', () => resolve(false));
      // resolve success only on a clean exit (code 0) or a signal (code null, e.g. the user killed
      // it). a non-zero exit means the pager failed (bad args, couldn't render) without showing the
      // output, so fall back to a direct write and never lose it.
      child.on('close', (code) => resolve(code === 0 || code === null));
      // ignore EPIPE that happens when the user quits the pager (e.g. "q") before all data is read.
      child.stdin?.on('error', () => {});
      child.stdin?.write(data);
      child.stdin?.end();
    } catch {
      resolve(false);
    }
  });
}
