import stc from 'string-to-color';
import chalk from 'chalk';

export default class Reporter {
  createLogger(id) {
    return {
      log(...messages) {
        console.log(chalk.hex(stc(id))(messages.join(' ')));
      },
      warn(...messages) {
        const lines = messages.join(' ').split(/\n/);
        lines
          .filter(line => line.replace(/\s+/, '').length > 0)
          .forEach(line => {
            console.log(chalk.yellow('WARN:'), chalk.hex(stc(id))(line));
          });
      }
    };
  }
}
