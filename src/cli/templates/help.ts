import rightpad from 'pad-right';
import chalk from 'chalk';
import allCommands from './all-help';
import { BASE_DOCS_DOMAIN } from '../../constants';

const SPACE = ' ';
const TITLE_LEFT_SPACES_NUMBER = 2;
const COMMAND_LEFT_SPACES_NUMBER = 4;
const NAME_WITH_SPACES_LENGTH = 15;

const baseTemplate = commands => {
  return `${chalk.bold('usage: bit [--version] [--help] <command> [<args>]')}

  ${chalk.grey(
    'bit is a free and open source tool for turning components from existing source-code to a collection of reusable components.'
  )}
  ${chalk.grey('easily share, reuse, maintain and discover code components from any project.')}

  ${chalk.grey(`bit documentation: https://${BASE_DOCS_DOMAIN}`)}

${commandsTemplate(commands)}

  ${chalk.grey("please use 'bit <command> --help' for more information and guides on specific commands.")}`;
};

function commandTemplate(command) {
  const { name, description } = command;
  const nameSpace = SPACE.repeat(COMMAND_LEFT_SPACES_NUMBER);
  const nameWithRightSpace = rightpad(name, NAME_WITH_SPACES_LENGTH, SPACE);
  const res = `${nameSpace}${chalk.cyan(nameWithRightSpace)}${description}`;
  return res;
}

function commandsSectionTemplate(section) {
  const titleSpace = SPACE.repeat(TITLE_LEFT_SPACES_NUMBER);
  const title = `${titleSpace}${chalk.underline(section.title)}`;
  const commands = section.commands.map(commandTemplate).join('\n');
  const res = `${title}\n${commands}`;
  return res;
}

function commandsTemplate(commands) {
  const res = commands.map(commandsSectionTemplate).join('\n\n');
  return res;
}

module.exports = function(extensionsCommands) {
  if (extensionsCommands && extensionsCommands.length) {
    allCommands.push({
      group: 'extensions',
      title: 'extensions commands',
      commands: extensionsCommands
    });
  }
  return baseTemplate(allCommands);
};
