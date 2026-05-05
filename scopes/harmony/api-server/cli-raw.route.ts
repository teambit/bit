import type { CLIMain } from '@teambit/cli';
import { CLIParser, YargsExitWorkaround } from '@teambit/cli';
import fs from 'fs-extra';
import path from 'path';
import { isatty } from 'tty';
import chalk from 'chalk';
import type { Route, Request, Response } from '@teambit/express';
import type { Logger } from '@teambit/logger';
import { logger as legacyLogger, getLevelFromArgv } from '@teambit/legacy.logger';
import { reloadFeatureToggle } from '@teambit/harmony.modules.feature-toggle';
import { loader } from '@teambit/legacy.loader';
import type { APIForIDE } from './api-for-ide';

/**
 * Strict allowlist of TTY device paths. Anything not matching is rejected
 * before we attempt to open it. Combined with an `isatty` check on the
 * opened fd, this blocks block devices, /proc files, and symlink-redirected
 * targets.
 *
 *   /dev/tty            current process's controlling tty
 *   /dev/ttyXXXNN       e.g. /dev/ttys000 (macOS), /dev/ttyS0 (Linux)
 *   /dev/pts/N          pseudo-terminal slaves on Linux
 *   /dev/ptmx           pseudo-terminal master
 *   /dev/console        system console
 */
const TTY_PATH_RE = /^\/dev\/(tty[a-zA-Z0-9]*|pts\/\d+|ptmx|console)$/;

/**
 * example usage:
 * post to http://localhost:3000/api/cli
 * with the following json as the body
 *
{
    "command": ["tag comp1 --build"]
}
 */
export class CLIRawRoute implements Route {
  constructor(
    private logger: Logger,
    private cli: CLIMain,
    private apiForIDE: APIForIDE
  ) {}

  method = 'post';
  route = '/cli-raw';

  middlewares = [
    async (req: Request, res: Response) => {
      const { command, pwd, envBitFeatures, ttyPath, isPty } = req.body;
      this.logger.debug(`cli-raw server: got request for ${command}`);

      // Validate pwd parameter to prevent path traversal
      if (pwd) {
        const resolvedPwd = path.resolve(pwd);
        const currentDir = process.cwd();
        if (!resolvedPwd.startsWith(currentDir)) {
          throw new Error(`Invalid pwd parameter. bit-server: ${currentDir}, pwd: ${pwd}`);
        }
      }

      // Validate ttyPath against a strict allowlist. The earlier check (string
      // prefix /dev/ or /proc/) was too permissive — it allowed /dev/sda,
      // /proc/sysrq-trigger, etc. After opening we also verify the fd is a
      // TTY (catches symlinks pointing outside the allowlist).
      if (ttyPath && !TTY_PATH_RE.test(ttyPath)) {
        throw new Error(`Invalid ttyPath parameter. Must be a TTY device under /dev/.`);
      }
      // there are 3 methods to interact with bit-server: 1) SSE, 2) TTY, 3) PTY. See server-commander.ts for more info.
      const isSSE = !ttyPath && !isPty;

      // save the original process.stdout.write method
      const originalStdoutWrite = process.stdout.write;
      const originalStderrWrite = process.stderr.write;

      let fileHandle: number | undefined;
      if (ttyPath) {
        fileHandle = await fs.open(ttyPath, 'w');
        if (!isatty(fileHandle)) {
          await fs.close(fileHandle);
          fileHandle = undefined;
          throw new Error(`Invalid ttyPath parameter. Path is not a TTY.`);
        }
        const ttyFd = fileHandle;
        // @ts-ignore monkey patch the process stdout write method
        process.stdout.write = (chunk, encoding, callback) => {
          fs.writeSync(ttyFd, chunk.toString());
          return originalStdoutWrite.call(process.stdout, chunk, encoding, callback);
        };
        // @ts-ignore monkey patch the process stderr write method
        process.stderr.write = (chunk, encoding, callback) => {
          fs.writeSync(ttyFd, chunk.toString());
          return originalStderrWrite.call(process.stdout, chunk, encoding, callback);
        };
      }
      if (isSSE) {
        process.env.BIT_CLI_SERVER_NO_TTY = 'true';
        loader.shouldSendServerEvents = true;
      }

      let currentLogger;
      const levelFromArgv = getLevelFromArgv(command);
      if (levelFromArgv) {
        currentLogger = legacyLogger.logger;
        if (ttyPath || isPty) {
          legacyLogger.switchToConsoleLogger(levelFromArgv);
        }
        if (isSSE) {
          legacyLogger.switchToSSELogger(levelFromArgv);
        }
      }

      const currentBitFeatures = process.env.BIT_FEATURES;
      const shouldReloadFeatureToggle = currentBitFeatures !== envBitFeatures;
      if (shouldReloadFeatureToggle) {
        process.env.BIT_FEATURES = envBitFeatures;
        reloadFeatureToggle();
      }

      const randomNumber = Math.floor(Math.random() * 10000); // helps to distinguish between commands in the log
      const commandStr = command.join(' ');
      const cmdStrLog = `${randomNumber} ${commandStr}`;
      await this.apiForIDE.logStartCmdHistory(cmdStrLog);
      legacyLogger.isDaemon = true;
      enableChalk();
      const cliParser = new CLIParser(this.cli.commands, this.cli.groups, this.cli.onCommandStartSlot);
      try {
        const commandRunner = await cliParser.parse(command);
        const result = await commandRunner.runCommand(true);
        await this.apiForIDE.logFinishCmdHistory(cmdStrLog, 0);
        this.logger.clearStatusLine();
        res.json(result);
      } catch (err: any) {
        this.logger.clearStatusLine();
        if (err instanceof YargsExitWorkaround) {
          res.json({ data: err.helpMsg, exitCode: err.exitCode });
        } else {
          this.logger.error(`cli-raw server: got an error for ${commandStr}`, err);
          await this.apiForIDE.logFinishCmdHistory(cmdStrLog, 1);
          res.status(500);
          res.jsonp({
            message: err.message,
            error: err,
          });
        }
      } finally {
        // important! at this stage, don't write to stdout/stderr anymore, e.g. don't do "this.logger.clearStatusLine()"
        // because the socket (for pty) is already closed.
        if (ttyPath) {
          process.stdout.write = originalStdoutWrite;
          process.stderr.write = originalStderrWrite;
          if (fileHandle !== undefined) {
            try {
              await fs.close(fileHandle);
            } catch (err) {
              this.logger.debug(`cli-raw: failed to close tty fd: ${(err as Error).message}`);
            }
          }
        }
        if (isSSE) {
          delete process.env.BIT_CLI_SERVER_NO_TTY;
          loader.shouldSendServerEvents = false;
        }
        // change chalk back to false, otherwise, the IDE will have colors. (this is a global setting)
        chalk.level = 0;
        if (shouldReloadFeatureToggle) {
          process.env.BIT_FEATURES = currentBitFeatures;
          reloadFeatureToggle();
        }
        if (currentLogger) {
          legacyLogger.switchToLogger(currentLogger);
        }
      }
    },
  ];
}

/**
 * because this gets called from the express server, which gets spawn from a script, chalk defaults to false.
 * only when calling this route from the terminal, we want colors. on the IDE, we don't want colors.
 */
function enableChalk() {
  chalk.level = 3;
}
