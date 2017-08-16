const chalk = require('chalk');

module.exports = `${chalk.bold('usage: bit [--version] [--help] <command> [<args>]')}

bit is a free and open source tool for turning components from existing source-code to a collection of reusable components. 
Easily share, reuse, maintain and discover code components from any project.

Bit documantation: https://docs.bitsrc.io

${chalk.underline('start a working area')}
  ${chalk.cyan('init')}    create or reinitialize an empty Bit scope or reinitialize an existing one

${chalk.underline('add, modify and control components')}
  ${chalk.cyan('add')}     add any subset of files to be tracked as components
  ${chalk.cyan('status')}  show the working area component(s) status.
  ${chalk.cyan('commit')}  record component changes and lock versions.
  ${chalk.cyan('mv')}      move a component to a different filesystem path.
  ${chalk.cyan('reset')}   revert a component version to previous one.

${chalk.underline('collaborate and share components')}
  ${chalk.cyan('import')}  import components into your current working area.
  ${chalk.cyan('export')}  export components to a remote scope.
  ${chalk.cyan('remote')}  manage set of tracked bit scope(s).

${chalk.underline('discover components')}
  ${chalk.cyan('list')}    list components on a local or a remote scope.
  ${chalk.cyan('search')}  search for components by desired functionallity.

${chalk.underline('examine component history and state')}
  ${chalk.cyan('log')}     show components(s) commit history.
  ${chalk.cyan('show')}    show component overview.  

${chalk.underline('component envrionment operations')}
  ${chalk.cyan('build')}   build any set of components with configured compiler (component compiler or as defined in bit.json)
  ${chalk.cyan('test')}    test any set of components with configured tester (component tester or as defined in bit.json)

${chalk.underline('general purpose commands')}
  ${chalk.cyan('config')}  global config management
  ${chalk.cyan('cc')}      clears Bit's cache from current working machine

${chalk.grey('please use \'bit <command> --help\' for more information and guides on specific commands.')}`;
