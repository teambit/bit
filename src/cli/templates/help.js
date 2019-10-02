import { BASE_DOCS_DOMAIN, BASE_WEB_DOMAIN } from '../../constants';

const rightpad = require('pad-right');
const chalk = require('chalk');

const SPACE = ' ';
const TITLE_LEFT_SPACES_NUMBER = 2;
const COMMAND_LEFT_SPACES_NUMBER = 4;
const NAME_WITH_SPACES_LENTH = 15;

const allCommands = [
  {
    title: 'start a working area',
    commands: [
      {
        name: 'init',
        description: 'create or reinitialize an empty Bit scope or reinitialize an existing one'
      }
    ]
  },
  {
    title: 'add, modify and control components',
    commands: [
      {
        name: 'add',
        description: 'add any subset of files to be tracked as a component(s).'
      },
      {
        name: 'status',
        description: 'show the working area component(s) status.'
      },
      {
        name: 'tag',
        description: 'record component changes and lock versions.'
      },
      {
        name: 'checkout',
        description: 'switch between component versions.'
      },
      {
        name: 'merge',
        description: 'merge changes of different component versions.'
      },
      {
        name: 'diff',
        description: 'show diff between components files.'
      },
      {
        name: 'untag',
        description: 'revert versions tagged for component(s).'
      },
      {
        name: 'move',
        description: 'move a component to a different filesystem path.'
      },
      {
        name: 'untrack',
        description: 'untrack a new component(s).'
      }
    ]
  },
  {
    title: 'collaborate and share components',
    commands: [
      {
        name: 'import',
        description: 'import components into your current working area.'
      },
      {
        name: 'export',
        description: 'export components to a remote scope.'
      },
      {
        name: 'install',
        description: 'install node packages of all components and calls the link command.'
      },
      {
        name: 'remote',
        description: 'manage set of tracked bit scope(s).'
      },
      {
        name: 'remove',
        description: 'remove component(s) from your working area, or a remote scope.'
      },
      {
        name: 'eject',
        description: 'replaces the components from the local scope with the corresponding packages.'
      },
      {
        name: 'link',
        description: 'generate symlinks for sourced components absolute path resolution.'
      },
      {
        name: 'deprecate',
        description: 'deprecate a component'
      },
      {
        name: 'undeprecate',
        description: 'undeprecate a deprecated component'
      }
    ]
  },
  {
    title: 'discover components',
    commands: [
      {
        name: 'list',
        description: 'list components on a local or a remote scope.'
      },
      {
        name: 'graph',
        description: 'EXPERIMENTAL. generate an image file with the dependencies graph.'
      }
    ]
  },
  {
    title: 'examine component history and state',
    commands: [
      {
        name: 'log',
        description: 'show components(s) version history.'
      },
      {
        name: 'show',
        description: 'show component overview.'
      }
    ]
  },
  {
    title: 'component environment operations',
    commands: [
      {
        name: 'build',
        description:
          'build any set of components with configured compiler (component compiler or as defined in bit.json)'
      },
      {
        name: 'test',
        description: 'test any set of components with configured tester (component tester or as defined in bit.json)'
      },
      {
        name: 'watch',
        description: 'watch components and perform `build` on changes'
      }
      // {
      //   name: 'eject-conf',
      //   description: 'ejecting components configuration'
      // },
      // {
      //   name: 'inject-conf',
      //   description: 'injecting components configuration'
      // }
    ]
  },
  {
    title: 'general commands',
    commands: [
      {
        name: 'login',
        description: `log the CLI into ${BASE_WEB_DOMAIN}`
      },
      {
        name: 'logout',
        description: `log the CLI out of ${BASE_WEB_DOMAIN}`
      },
      {
        name: 'config',
        description: 'global config management'
      },
      {
        name: 'doctor',
        description: 'diagnose a bit workspace'
      },
      {
        name: 'cc',
        description: "clears Bit's cache from current working machine"
      }
    ]
  }
];

const baseTemplate = (commands) => {
  return `${chalk.bold('usage: bit [--version] [--help] <command> [<args>]')}

  ${chalk.grey(
    'bit is a free and open source tool for turning components from existing source-code to a collection of reusable components.'
  )}
  ${chalk.grey('easily share, reuse, maintain and discover code components from any project.')}

  ${chalk.grey(`bit documentation: https://${BASE_DOCS_DOMAIN}`)}

${commandsTemplate(commands)}

  ${chalk.grey("please use 'bit <command> --help' for more information and guides on specific commands.")}`;
};

const commandTemplate = (command) => {
  const { name, description } = command;
  const nameSpace = SPACE.repeat(COMMAND_LEFT_SPACES_NUMBER);
  const nameWithRightSpace = rightpad(name, NAME_WITH_SPACES_LENTH, SPACE);
  const res = `${nameSpace}${chalk.cyan(nameWithRightSpace)}${description}`;
  return res;
};

const commandsSectionTemplate = (section) => {
  const titleSpace = SPACE.repeat(TITLE_LEFT_SPACES_NUMBER);
  const title = `${titleSpace}${chalk.underline(section.title)}`;
  const commands = section.commands.map(commandTemplate).join('\n');
  const res = `${title}\n${commands}`;
  return res;
};

const commandsTemplate = (commands) => {
  const res = commands.map(commandsSectionTemplate).join('\n\n');
  return res;
};

module.exports = function (extensionsCommands) {
  if (extensionsCommands && extensionsCommands.length) {
    allCommands.push({
      title: 'extensions commands',
      commands: extensionsCommands
    });
  }
  return baseTemplate(allCommands);
};
