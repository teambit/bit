// @flow
import chalk from 'chalk';
import program from 'commander';
import pkg from '../../package.json';
import loader from './loader';
import commands from './commands/command-list';

function bitError(message) {
  return chalk.red(
    `${message
      .split('\n') // eslint-disable-line
      .map(m => `bitjs ERR! ${m}`)
      .join('\n')}\n`
  );
}

function errorHandler(e) {
  loader.off();
  process.stderr.write(bitError(e.message));
  if (e.code) {
    process.stderr.write(bitError(`\ncode: ${e.code}\n`));
  }
  process.stderr.write(bitError(e.stack));
  process.exit(1);
}

function logAndExit(str) {
  loader.off();
  if (str) {
    console.log(str); // eslint-disable-line
  }
  process.exit(0);
}

function start() {
  program.version(pkg.version).description('bit driver for javascript');
  commands.forEach((c) => {
    const currentCommand = program.command(c.name).description(c.description);

    if (c.options && Array.isArray(c.options)) {
      c.options.forEach(option => currentCommand.option(`${option.alias} ${option.name}`, option.description));
    }

    currentCommand.action((args, options) => {
      if (c.loader === true) loader.on();
      loader.start(c.loaderText || `performing ${c.name} command`);
      c.action(args, options)
        .then(c.report)
        .then(logAndExit)
        .catch(c.handleError || errorHandler);
    });
  });

  program.parse(process.argv);
}

export default start;
