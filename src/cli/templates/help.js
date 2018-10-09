const chalk = require('chalk');

const baseTemplate = (extensionsTemplate) => {
  return `${chalk.bold('usage: bit [--version] [--help] <command> [<args>]')}

  ${chalk.grey(
    'bit is a free and open source tool for turning components from existing source-code to a collection of reusable components.'
  )}
  ${chalk.grey('Easily share, reuse, maintain and discover code components from any project.')}

  ${chalk.grey('Bit documentation: https://docs.bitsrc.io')}

  ${chalk.underline('start a working area')}
    ${chalk.cyan('init')}       create or reinitialize an empty Bit scope or reinitialize an existing one

  ${chalk.underline('add, modify and control components')}
    ${chalk.cyan('add')}        add any subset of files to be tracked as a component(s).
    ${chalk.cyan('status')}     show the working area component(s) status.
    ${chalk.cyan('tag')}        record component changes and lock versions.
    ${chalk.cyan('checkout')}   switch between component versions.
    ${chalk.cyan('merge')}      merge changes of different component versions.
    ${chalk.cyan('diff')}       show diff between components files.
    ${chalk.cyan('untag')}      revert versions tagged for component(s).
    ${chalk.cyan('move')}       move a component to a different filesystem path.
    ${chalk.cyan('untrack')}    untrack a new component(s).

  ${chalk.underline('collaborate and share components')}
    ${chalk.cyan('import')}     import components into your current working area.
    ${chalk.cyan('export')}     export components to a remote scope.
    ${chalk.cyan('install')}    install node packages of all components and calls the link command.
    ${chalk.cyan('remote')}     manage set of tracked bit scope(s).
    ${chalk.cyan('remove')}     remove component(s) from your working area, or a remote scope.
    ${chalk.cyan('eject')}      remove components from the local scope and install them by the NPM client.
    ${chalk.cyan('link')}       generate symlinks for sourced components absolute path resolution.

  ${chalk.underline('discover components')}
    ${chalk.cyan('list')}       list components on a local or a remote scope.

  ${chalk.underline('examine component history and state')}
    ${chalk.cyan('log')}        show components(s) version history.
    ${chalk.cyan('show')}       show component overview.

  ${chalk.underline('component environment operations')}
    ${chalk.cyan(
    'build'
  )}      build any set of components with configured compiler (component compiler or as defined in bit.json)
    ${chalk.cyan(
    'test'
  )}       test any set of components with configured tester (component tester or as defined in bit.json)
  ${chalk.cyan('  envs-attach')}attach workspace environments to components
  ${chalk.cyan('  eject-conf')} ejecting components configuration
  ${chalk.cyan('  inject-conf')}injecting components configuration

  ${chalk.underline('general commands')}
    ${chalk.cyan('login')}      log the CLI into bitsrc.io
    ${chalk.cyan('logout')}     log the CLI out of bitsrc.io
    ${chalk.cyan('config')}     global config management
    ${chalk.cyan('cc')}         clears Bit's cache from current working machine
  ${extensionsTemplate}
  ${chalk.grey("please use 'bit <command> --help' for more information and guides on specific commands.")}`;
};

const extensionsCommandTemplate = (extensionsCommand) => {
  return `  ${chalk.cyan(extensionsCommand.name)}   ${extensionsCommand.description}
  `;
};

const extensionsCommandsTemplate = (extensionsCommands) => {
  if (!extensionsCommands || !extensionsCommands.length) return '';
  return `${chalk.underline('extensions commands')}
  ${extensionsCommands.map(extensionsCommandTemplate)}
  `;
};

module.exports = function (extensionsCommands) {
  const extensionsTemplate = extensionsCommandsTemplate(extensionsCommands);
  return baseTemplate(extensionsTemplate);
};
