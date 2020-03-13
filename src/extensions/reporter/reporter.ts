import stc from 'string-to-color';
import chalk from 'chalk';
import ora from 'ora';

export default class Reporter {
  private spinner: any;
  public spinnerText?: string;
  public ids?: Array<string>;
  constructor() {
    this.spinner = ora({ spinner: 'bouncingBar' }).stop();
  }
  startPhase(phaseName) {
    this.ids = [];
    this.spinnerText = phaseName;
    this.spinner.stop();
    const titleUnderline = Array(Math.round(process.stdout.columns / 2))
      .fill('-')
      .join('');
    console.log('');
    console.log(phaseName);
    console.log(titleUnderline);
    console.log('');
    this.spinner.start(this.spinnerText);
  }
  private addId(id) {
    this.ids = this.ids || [];
    this.ids.push(id);
    const spinnerText = `${this.spinnerText}: (${this.ids.map(logId => chalk.hex(stc(logId))(logId)).join(', ')})`;
    this.spinner.text = spinnerText;
  }
  createLogger(id) {
    this.addId(id);
    const spinner = this.spinner;
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
      }
    };
  }
  end() {
    this.spinner.stop();
  }
}
