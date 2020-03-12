import stc from 'string-to-color';
import chalk from 'chalk';
import ora from 'ora';

export default class Reporter {
  createLogger(id) {
    const spinner = ora({ spinner: 'bouncingBar' }); // TODO: start?
    return {
      log(...messages) {
        spinner.stop();
        console.log(chalk.hex(stc(id))(messages.join(' ')));
        spinner.start();
      },
      warn(...messages) {
        const lines = messages.join(' ').split(/\n/);
        spinner.stop();
        lines
          .filter(line => line.replace(/\s+/, '').length > 0)
          .forEach(line => {
            console.log(chalk.yellow('WARN:'), chalk.hex(stc(id))(line));
          });
        spinner.start();
      },
      done() {
        spinner.stop();
      }
    };
  }
}
