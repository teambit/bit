import fs from 'fs-extra';
import json from 'comment-json';

const COMPLETION_FLAG = '--get-yargs-completions';

const log = (msg) => fs.writeFileSync('compilation.log', `${msg}\n`);

type Cmd = { name: string; options: string[]; description?: string };

export function autocomplete() {
  const argv = process.argv.slice(2).filter((arg) => arg !== COMPLETION_FLAG);
  // remove the first element, it is always the command itself "bit"
  argv.shift();
  log(`argv: ${argv.join(' ')}, length: ${argv.length}`);
  if (argv.length === 0) {
    throw new Error(`argv is empty, it must have at least one element. argv: ${process.argv.join(' ')}`);
  }
  if (argv.length === 1) {
    // either "bit " or "bit x" where x can be any string without a space
    // in both cases, we should return all commands
    printCommandNames();
    process.exit(0);
  }

  // argv has at least 2 elements, the first one is the command name.
  const command = argv[0];
  const allCommands = getAllCommands();
  const matchedCommand = allCommands.find((cmd) => cmd.name === command || cmd.name.startsWith(`${command} `));
  if (!matchedCommand) {
    return;
  }
  log(`matchedCommand: ${matchedCommand.name}`);
  const currentArg = argv.length ? argv[argv.length - 1] : '';
  if (currentArg.startsWith('-')) {
    printCommandFlags(matchedCommand);
    process.exit(0);
  }
  const commandArgs = matchedCommand.name.split(' ').slice(1);
  const firstCmdArg = commandArgs[0];
  const commandNamePrefixes = ['<component-name', '<component-pattern', '[component-name', '[component-pattern'];
  if (firstCmdArg && commandNamePrefixes.some((prefix) => firstCmdArg.startsWith(prefix))) {
    log(`completing component name`);
    const compIds = getCompsFromBitmap();
    process.stdout.write(compIds.join('\n'));
  }
  process.exit(0);
}

function printCommandFlags(cmd: Cmd): void {
  cmd.options.map((opt) => {
    const [, name, description] = opt;
    process.stdout.write(`--${name}:${description}\n`);
  });
}

function printCommandNames() {
  const allCommands = getAllCommands();
  allCommands.forEach((cmd) => {
    const name = cmd.name.split(' ')[0];
    const desc = cmd.description || '';
    process.stdout.write(`${name}:${desc}\n`);
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
