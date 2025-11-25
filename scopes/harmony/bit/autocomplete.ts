import fs from 'fs-extra';
import json from 'comment-json';

const COMPLETION_FLAG = '--get-yargs-completions';

type Cmd = { name: string; options: string[]; description?: string; commands?: Cmd[]; private?: boolean };

export function autocomplete() {
  log('[*] autocomplete started');
  const results = getAutocompleteResults();
  log(`[*] autocomplete completed with ${results.length} results`);
  if (results.length) process.stdout.write(results.join('\n'));
}

function getAutocompleteResults(): string[] {
  const argv = process.argv.slice(2).filter((arg) => arg !== COMPLETION_FLAG);
  // remove the first element, it is always the executable "bit"
  argv.shift();
  log(`argv: ${argv.join(' ')}, length: ${argv.length}`);
  if (argv.length === 0) {
    throw new Error(`argv is empty, it must have at least one element. argv: ${process.argv.join(' ')}`);
  }
  if (argv.length === 1) {
    // either "bit " or "bit x" where x can be any string without a space
    // in both cases, we should return all commands
    return getAllCommandNames();
  }

  // argv has at least 2 elements, the first one is the command name.
  const commandName = argv[0];
  const allCommands = getAllCommands();
  const matchedCommand = findCommandByName(commandName, allCommands);
  if (!matchedCommand) {
    return [];
  }
  // the second element can be a sub-command or an arg or a flag
  const possiblySubCommandName = argv[1];
  const matchedSubCommand = possiblySubCommandName
    ? findCommandByName(possiblySubCommandName, matchedCommand.commands || [])
    : undefined;

  log(`matchedCommand: ${matchedCommand.name}, subCommand: ${matchedSubCommand?.name}`);
  const currentCommand = matchedSubCommand || matchedCommand;

  // examples:
  // "bit nev set ", the user is at arg location 0
  // "bit nev set teambit.wor", the user is at arg location 1
  // "bit build ", the user is at arg location 0
  // "bit build teambit.wor", the user is at arg location 1
  const argLocation = matchedSubCommand ? argv.length - 3 : argv.length - 2;
  log(`argLocation: ${argLocation}`);

  const currentArg = argv.length ? argv[argv.length - 1] : '';
  const flags = getCommandFlags(currentCommand);
  if (currentArg.startsWith('-')) {
    return flags;
  }
  const commandArgs = currentCommand.name.split(' ').slice(1);
  const currentCmdArg = commandArgs[argLocation];
  log(`currentCmdArg: ${currentCmdArg}`);
  const commandNamePrefixes = ['<component-name', '<component-pattern', '[component-name', '[component-pattern'];
  if (currentCmdArg && commandNamePrefixes.some((prefix) => currentCmdArg.startsWith(prefix))) {
    log(`completing component name`);
    return getCompsFromBitmap();
  }
  const subCommands = matchedCommand.commands || [];
  if (subCommands.length && argv.length === 2) {
    return getCommandNames(subCommands);
  }
  if (!currentCmdArg && flags.length) {
    // either no args, or user already typed all args, probably the user wants to add flags
    return flags;
  }
  return [];
}

function findCommandByName(name: string, commands: Cmd[]): Cmd | undefined {
  return commands.find((cmd) => cmd.name === name || cmd.name.startsWith(`${name} `));
}

function getCommandFlags(cmd: Cmd): string[] {
  return cmd.options.map((opt) => {
    const [, name, description] = opt;
    return `--${name}:${description}`;
  });
}

function getAllCommandNames(): string[] {
  const allCommands = getAllCommands();
  const publicCommands = allCommands.filter((cmd) => !cmd.private);
  return getCommandNames(publicCommands);
}

function getCommandNames(commands: Cmd[]): string[] {
  return commands.map((cmd) => {
    const name = cmd.name.split(' ')[0];
    const desc = cmd.description || '';
    return `${name}:${desc}`;
  });
}

function getAllCommands(): Cmd[] {
  const cliReferences = require('@teambit/harmony.content.cli-reference/cli-reference.json');
  return cliReferences;
}

function getCompsFromBitmap(): string[] {
  const bitMap = fs.readFileSync('.bitmap');
  const componentsJson = json.parse(bitMap.toString('utf8'), undefined, true) as Record<string, any>;
  const compIds: string[] = [];
  Object.keys(componentsJson).forEach((componentId) => {
    if (componentId === '$schema-version') return;
    const value = componentsJson[componentId];
    const scope = value.scope || value.defaultScope;
    const name = value.name;
    compIds.push(`${scope}/${name}`);
  });
  return compIds;
}

// to get the log working, add `export BIT_DEBUG_AUTOCOMPLETE=true` to your bash profile
// prefixing the command with this won't work for some reason.
const shouldLog = process.env.BIT_DEBUG_AUTOCOMPLETE === 'true';
const logFile = 'compilation.log';
if (shouldLog) fs.ensureFileSync(logFile);
function log(msg: string) {
  if (shouldLog) fs.appendFileSync(logFile, `${msg}\n`);
}
