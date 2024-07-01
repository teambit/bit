// eslint-disable-next-line max-classes-per-file
import type { Command, CommandOptions } from '@teambit/legacy/dist/cli/command';
import legacyLogger from '@teambit/legacy/dist/logger/logger';
import { handleErrorAndExit } from '@teambit/legacy/dist/cli/handle-errors';
import { loadConsumerIfExist } from '@teambit/legacy/dist/consumer';
import { getHarmonyVersion } from '@teambit/legacy/dist/bootstrap';
import readline from 'readline';
import { CLIParser } from './cli-parser';
import { CLIMain } from './cli.main.runtime';
import { GenerateCommandsDoc, GenerateOpts } from './generate-doc-md';

export class CliGenerateCmd implements Command {
  name = 'generate';
  description = 'generate an .md file with all commands details';
  alias = '';
  loader = false;
  group = 'general';
  options = [
    [
      '',
      'metadata',
      'metadata/front-matter to place at the top of the .md file, enter as an object e.g. --metadata.id=cli --metadata.title=commands',
    ],
    ['', 'docs', 'generate the cli-reference.docs.mdx file'],
    ['j', 'json', 'output the commands info as JSON'],
  ] as CommandOptions;

  constructor(private cliMain: CLIMain) {}

  async report(args, { metadata, docs }: GenerateOpts & { docs?: boolean }): Promise<string> {
    if (docs) {
      return `---
description: 'Bit command synopses. Bit version: ${getHarmonyVersion()}'
labels: ['cli', 'mdx', 'docs']
---
      `;
    }
    return new GenerateCommandsDoc(this.cliMain.commands, { metadata }).generate();
  }

  async json() {
    return new GenerateCommandsDoc(this.cliMain.commands, {}).generateJson();
  }
}

export class CliCmd implements Command {
  name = 'cli';
  description = 'EXPERIMENTAL. enters bit cli program and generates commands list';
  alias = '';
  commands: Command[] = [];
  loader = false;
  group = 'general';
  options = [] as CommandOptions;

  constructor(private cliMain: CLIMain) {}

  async report(): Promise<string> {
    legacyLogger.isDaemon = true;
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'bit > ',
      completer: (line, cb) => completer(line, cb, this.cliMain),
    });

    const cliParser = new CLIParser(this.cliMain.commands, this.cliMain.groups, this.cliMain.onCommandStartSlot);

    rl.prompt();

    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      rl.on('line', async (line) => {
        const cmd = line.trim().split(' ');
        try {
          await cliParser.parse(cmd);
        } catch (err: any) {
          await handleErrorAndExit(err, cmd[0]);
        }
        rl.prompt();
      }).on('close', () => {
        resolve('Have a great day!');
      });
    });
  }
}

function completer(line: string, cb: Function, cliMain: CLIMain) {
  const lineSplit = line.split(' ');
  let values: string[] = [];
  if (lineSplit.length <= 1) {
    values = completeCommand(line, cliMain);
    cb(null, [values, line]);
  }
  loadConsumerIfExist()
    .then((consumer) => {
      const comps = consumer?.bitmapIdsFromCurrentLane.map((id) => id.toStringWithoutVersion()) || [];
      values = comps.filter((c) => c.includes(lineSplit[1]));
      // eslint-disable-next-line promise/no-callback-in-promise
      cb(null, [values, line]);
    })
    .catch((err) => {
      // eslint-disable-next-line promise/no-callback-in-promise
      cb(err, [[], line]);
    });
}

function completeCommand(line: string, cliMain: CLIMain): string[] {
  const commands = cliMain.commands.filter((cmd) => cmd.name.startsWith(line));
  return commands.map((c) => c.name).map((name) => name.split(' ')[0]);
}
