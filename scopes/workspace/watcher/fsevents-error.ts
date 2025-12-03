import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

type BitWatcherProcess = {
  pid: number;
  command: string;
  cwd: string;
  isVSCodeServer: boolean; // bit server processes are managed by VS Code extension
};

/**
 * Detect running bit watcher processes on macOS.
 * Returns a list of processes running bit watch, bit start, bit run, or bit server commands.
 */
async function detectRunningBitWatchers(): Promise<BitWatcherProcess[]> {
  if (process.platform !== 'darwin') {
    return []; // FSEvents is macOS-specific
  }

  try {
    // Use ps -eo for more predictable output format (just pid and command)
    const { stdout } = await execAsync(
      `ps -eo pid,command | grep -E "/bit (watch|start|run|server)" | grep -v grep || true`
    );

    if (!stdout.trim()) {
      return [];
    }

    const processes: BitWatcherProcess[] = [];
    const lines = stdout.trim().split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      const firstSpaceIdx = trimmedLine.indexOf(' ');
      if (firstSpaceIdx === -1) continue;

      const pidStr = trimmedLine.slice(0, firstSpaceIdx);
      const command = trimmedLine.slice(firstSpaceIdx + 1).trim();

      // Validate PID is purely numeric to prevent command injection
      if (!/^\d+$/.test(pidStr)) continue;

      const pid = parseInt(pidStr, 10);
      if (pid === process.pid) continue; // Skip current process

      // server-forever is just a spawner process, it doesn't run a watcher itself
      if (/server-forever/.test(command)) continue;

      // bit server is started by VS Code extension - users should close VS Code windows instead of killing these
      const isVSCodeServer = /bit server(?:\s|$)/.test(command);

      // Get the working directory of this process using lsof
      let cwd = 'unknown';
      try {
        const { stdout: lsofOut } = await execAsync(`lsof -p ${pid} 2>/dev/null | grep cwd | head -1 || true`);
        // lsof output format: "node PID user cwd DIR ... /path/to/dir"
        // The path is the last field and starts with /
        const cwdMatch = lsofOut.match(/\s(\/[^\s]+)\s*$/);
        if (cwdMatch) {
          cwd = cwdMatch[1];
        }
      } catch {
        // Ignore lsof errors
      }

      processes.push({ pid, command, cwd, isVSCodeServer });
    }

    return processes;
  } catch {
    return [];
  }
}

/**
 * Format a helpful error message when FSEvents stream limit is reached.
 * Lists running bit watchers and provides suggestions for freeing up streams.
 */
export async function formatFSEventsErrorMessage(): Promise<string> {
  const runningWatchers = await detectRunningBitWatchers();
  const killableProcesses = runningWatchers.filter((p) => !p.isVSCodeServer);
  const vscodeServers = runningWatchers.filter((p) => p.isVSCodeServer);

  let message = `Failed to start the watcher: Error starting FSEvents stream
macOS limits the total number of FSEvents watchers system-wide (undocumented limit, typically ~500).
Each running watcher process may consume multiple streams internally.`;

  if (runningWatchers.length > 0) {
    message += `\n\n${chalk.yellow('Found the following Bit watcher processes:')}`;
    for (const proc of runningWatchers) {
      const cwdInfo = proc.cwd !== 'unknown' ? ` (${proc.cwd})` : '';
      const vscodeNote = proc.isVSCodeServer ? chalk.gray(' [VS Code extension]') : '';
      message += `\n  ${chalk.cyan(`PID ${proc.pid}`)}: ${proc.command}${cwdInfo}${vscodeNote}`;
    }

    message += `\n\n${chalk.yellow('To free up FSEvents streams, you can:')}`;
    if (killableProcesses.length > 0) {
      message += `\n  1. Close unnecessary terminal tabs running bit watch/start/run`;
      message += `\n  2. Kill specific processes: ${chalk.cyan(`kill ${killableProcesses.map((p) => p.pid).join(' ')}`)}`;
    }
    if (vscodeServers.length > 0) {
      message += `\n  ${killableProcesses.length > 0 ? '3' : '1'}. Close unused VS Code windows (${vscodeServers.length} VS Code Bit server${vscodeServers.length > 1 ? 's' : ''} running)`;
    }
  }

  message += `\n
${chalk.yellow('Note:')} If you're using "bit start" or "bit run", you don't need "bit watch" separately.
With the VS Code Bit extension, you can use "Compile on Change" instead of running a watcher manually.

For more details, see: https://facebook.github.io/watchman/docs/troubleshooting#fseventstreamstart-register_with_server-error-f2d_register_rpc--null--21`;

  return message;
}
