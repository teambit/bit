import fs from 'fs-extra';
import json from 'comment-json';

const COMPLETION_FLAG = '--get-yargs-completions';

// to get the log working, add `export BIT_DEBUG_AUTOCOMPLETE=true` to your bash profile
// prefixing the command with this won't work for some reason.
const shouldLog = process.env.BIT_DEBUG_AUTOCOMPLETE === 'true';
const logFile = 'compilation.log';
if (shouldLog) fs.ensureFileSync(logFile);
const log = (msg: string) => (shouldLog ? fs.appendFileSync(logFile, `${msg}\n`) : null);

type Cmd = { name: string; options: string[]; description?: string; commands?: Cmd[] };

export function autocomplete() {
  log('[*] autocomplete started');
  const results = getAutocompleteResults();
  if (!results.length) {
    log(`[*] autocomplete completed, no results found`);
    return;
  }
  log(`[*] autocomplete completed with ${results.length} results`);
  process.stdout.write(results.join('\n'), () => {
    process.exit(0);
  });
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
  const command = argv[0];
  const allCommands = getAllCommands();
  const matchedCommand = allCommands.find((cmd) => cmd.name === command || cmd.name.startsWith(`${command} `));
  if (!matchedCommand) {
    return [];
  }
  log(`matchedCommand: ${matchedCommand.name}`);
  const currentArg = argv.length ? argv[argv.length - 1] : '';
  if (currentArg.startsWith('-')) {
    return getCommandFlags(matchedCommand);
  }
  const commandArgs = matchedCommand.name.split(' ').slice(1);
  const firstCmdArg = commandArgs[0];
  const commandNamePrefixes = ['<component-name', '<component-pattern', '[component-name', '[component-pattern'];
  if (firstCmdArg && commandNamePrefixes.some((prefix) => firstCmdArg.startsWith(prefix))) {
    log(`completing component name`);
    return getCompsFromBitmap();
  }
  const subCommands = matchedCommand.commands || [];
  if (subCommands.length && argv.length === 2) {
    return getCommandNames(subCommands);
  }
  return [];
}

function getCommandFlags(cmd: Cmd): string[] {
  return cmd.options.map((opt) => {
    const [, name, description] = opt;
    return `--${name}:${description}`;
  });
}

function getAllCommandNames(): string[] {
  const allCommands = getAllCommands();
  return getCommandNames(allCommands);
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
  const componentsJson = json.parse(bitMap.toString('utf8'), undefined, true);
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
