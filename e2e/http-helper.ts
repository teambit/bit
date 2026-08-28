/* eslint no-console: 0 */
import chalk from 'chalk';
import type { ChildProcess } from 'child_process';
import childProcess from 'child_process';
import rightpad from 'pad-right';

import type { Helper } from '@teambit/legacy.e2e-helper';

const HTTP_TIMEOUT_FOR_MSG = 120000; // 2 min
const DEFAULT_HTTP_PORT = 3000;
const PORT_FREE_TIMEOUT = 30000; // 30 sec
// generous on purpose: with `--rebuild` this covers a full rspack build of the UI, which is minutes
// on a cold cache. it exists to bound a hang, not to police how long a legitimate build takes.
const START_TIMEOUT = 900000; // 15 min

const readyMessageFor = (uiRootAspectId: string) => `UI server of ${uiRootAspectId} is listening to port`;
const SCOPE_UI_ROOT = 'teambit.scope/scope';

export type HttpHelperOptions = {
  /**
   * extra flags for `bit start`. `--rebuild` is the one that matters for anything asserting on the
   * UI itself: without it the server resolves the pre-built bundle from the bvm install, so the
   * test measures whatever bit version happens to be installed rather than the code under test.
   */
  extraArgs?: string[];
  /** bound on how long to wait for the server to report itself ready. see `START_TIMEOUT`. */
  startTimeoutMs?: number;
  /**
   * which UI root to start. the scope root serves a bare scope (the default, and what the http
   * protocol tests use); the workspace root serves the local workspace.
   */
  uiRootAspectId?: string;
};

export class HttpHelper {
  httpProcess: ChildProcess;
  /** everything `bit start` wrote to stderr, for tests asserting a clean startup */
  stderr = '';

  constructor(
    private helper: Helper,
    private port = DEFAULT_HTTP_PORT,
    private options: HttpHelperOptions = {}
  ) {}

  private get uiRootAspectId(): string {
    return this.options.uiRootAspectId || SCOPE_UI_ROOT;
  }

  /** the scope root runs against the bare remote scope; any other root against the workspace. */
  private get cwd(): string {
    return this.uiRootAspectId === SCOPE_UI_ROOT ? this.helper.scopes.remotePath : this.helper.scopes.localPath;
  }
  async start(): Promise<void> {
    // a `bit start` server from an earlier describe-block in the same file shares this port (and the
    // same remote-scope dir), and may still be shutting down when we get here — especially with a
    // released `bbit` binary, whose server tears down more slowly than a dev build. wait for the port
    // to be free (force-killing any leftover holder) so the client talks to *this* freshly-started
    // server over the freshly-reinitialized scope, and not a lingering one serving stale/wiped state
    // (which surfaced as OutdatedIndexJson / MergeConflictOnRemote in the bbit nightly).
    await this.waitForPortToBeFree();
    const timeoutMs = this.options.startTimeoutMs ?? START_TIMEOUT;
    return new Promise((resolve, reject) => {
      const args = ['start', '--verbose', '--log', '--port', String(this.port), ...(this.options.extraArgs || [])];
      const cmd = `${this.helper.command.bitBin} ${args.join(' ')}`;
      const { cwd } = this;
      if (this.helper.debugMode) console.log(rightpad(chalk.green('cwd: '), 20, ' '), cwd); // eslint-disable-line no-console
      if (this.helper.debugMode) console.log(rightpad(chalk.green('command: '), 20, ' '), cmd); // eslint-disable-line
      this.httpProcess = childProcess.spawn(this.helper.command.bitBin, args, { cwd });
      let stdoutData = '';
      let stderrData = '';
      let settled = false;
      // the suites that use this run with mocha's timeout disabled, because a legitimate `--rebuild`
      // start can take minutes. that makes this the only deadline: a server that stays alive but
      // never reports readiness would otherwise hang the job forever instead of failing it.
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const tail = (out: string) => out.split('\n').slice(-20).join('\n');
        void this.killHttp().catch(() => {});
        reject(
          new Error(
            `bit start did not report "${readyMessageFor(this.uiRootAspectId)}" within ${timeoutMs}ms.\n` +
              `last stdout:\n${tail(stdoutData)}\nlast stderr:\n${tail(stderrData)}`
          )
        );
      }, timeoutMs);
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.httpProcess.stdout.on('data', (data) => {
        if (this.helper.debugMode) console.log(`stdout: ${data}`);
        stdoutData += data.toString();
        if (data.includes(readyMessageFor(this.uiRootAspectId))) {
          if (this.helper.debugMode) console.log('Bit server is up and running');
          settle(resolve);
        }
      });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.httpProcess.stderr.on('data', (data) => {
        if (this.helper.debugMode) console.log(`stderr: ${data}`);
        stderrData += data.toString();
        this.stderr += data.toString();
      });
      this.httpProcess.on('close', (code) => {
        if (this.helper.debugMode) console.log(`child process exited with code ${code}`);
        settle(() => reject(new Error(`http exited with code ${code}\n${stderrData}`)));
      });
    });
  }
  async waitForHttpToPrintMsg(msg: string, timeoutAfter: number = HTTP_TIMEOUT_FOR_MSG) {
    return new Promise((resolve, reject) => {
      // create a timeout to reject promise if not resolved
      const timer = setTimeout(() => {
        reject(new Error(`http exceed the limit of ${timeoutAfter} ms, the message "${msg}" was not received`));
      }, timeoutAfter);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this.httpProcess.stdout.on('data', (data) => {
        if (data.includes(msg)) {
          clearTimeout(timer);
          resolve(data);
        }
      });
    });
  }
  async killHttp(): Promise<void> {
    const proc = this.httpProcess;
    if (process.platform === 'win32') {
      if (!proc?.pid) throw new Error(`httpProcess.pid is undefined`);
      childProcess.execSync(`taskkill /pid ${proc.pid.toString()} /f /t`);
      return;
    }
    if (proc?.pid) {
      // ask the server to shut down gracefully, then give it a moment to release the port.
      const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
      try {
        proc.kill('SIGINT');
      } catch {
        // process may already be gone
      }
      await Promise.race([exited, delay(5000)]);
    }
    // `bit start` spawns child processes that a SIGINT to the parent doesn't always reap; with a
    // released `bbit` binary they can linger and keep the port. block until the port is actually
    // free (force-killing whatever still holds it) so the next server in this file starts clean.
    await this.waitForPortToBeFree();
  }
  /**
   * pids of any process currently listening on the http port. interface-agnostic (unlike a plain
   * connect check) so it catches server children that escaped the parent's process group.
   * note: `lsof -ti` exits 1 when nothing is listening (the normal "port is free" case), so the
   * `|| true` guards that expected non-zero exit — it is not masking a real lsof failure.
   *
   * `-sTCP:LISTEN` matters: without it lsof also reports processes holding a *client* socket to the
   * port, which includes the mocha process itself once a test has fetched from the server (node
   * keeps connections alive). those were then read as a foreign process squatting the port and
   * `waitForPortToBeFree` refused to continue. only a listener can actually hold the port.
   */
  private portHolders(): number[] {
    if (process.platform === 'win32') return [];
    try {
      const out = childProcess.execSync(`lsof -ti tcp:${this.port} -sTCP:LISTEN 2>/dev/null || true`, {
        encoding: 'utf8',
      });
      return out
        .split('\n')
        .map((pid) => pid.trim())
        .filter(Boolean)
        .map(Number);
    } catch {
      return [];
    }
  }
  private processCommand(pid: number): string {
    try {
      return childProcess.execSync(`ps -p ${pid} -o command= 2>/dev/null || true`, { encoding: 'utf8' }).trim();
    } catch {
      return '';
    }
  }
  /**
   * whether the port holder is a lingering `bit start` server (the spawned process or a node child
   * from the bit bundle). we only ever force-kill these — never an unrelated process a developer
   * happens to be running on the same port.
   */
  private isBitServerProcess(pid: number): boolean {
    const cmd = this.processCommand(pid);
    if (!cmd) return false;
    return cmd.includes('@teambit/bit') || cmd.includes(this.helper.command.bitBin) || /\bbit\b.*\bstart\b/.test(cmd);
  }
  private async waitForPortToBeFree(timeoutMs = PORT_FREE_TIMEOUT): Promise<void> {
    const startTime = Date.now();
    const describe = (pids: number[]) => pids.map((pid) => `  pid ${pid}: ${this.processCommand(pid)}`).join('\n');
    let holders = this.portHolders();
    while (holders.length > 0) {
      const foreign = holders.filter((pid) => !this.isBitServerProcess(pid));
      if (foreign.length) {
        throw new Error(
          `port ${this.port} is held by non-bit process(es); refusing to kill them. free the port and retry:\n${describe(foreign)}`
        );
      }
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`port ${this.port} still held by bit server(s) after ${timeoutMs}ms:\n${describe(holders)}`);
      }
      holders.forEach((pid) => {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // already dead
        }
      });
      await delay(300);
      holders = this.portHolders();
    }
  }
  shouldIgnoreHttpError(data: string): boolean {
    const msgToIgnore = ['@rollup/plugin-replace'];
    return msgToIgnore.some((str) => data.startsWith(str));
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
