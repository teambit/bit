import stc from 'string-to-color';
import chalk from 'chalk';
import ora from 'ora';

export default class Reporter {
  private spinner: any;
  private shouldOutput = true;
  public spinnerText?: string;
  public ids?: Array<string>;
  constructor() {
    this.spinner = ora({ spinner: 'bouncingBar', stream: process.stdout }).stop();
  }
  startPhase(phaseName) {
    this.ids = [];
    this.spinnerText = phaseName;
    this.spinner.stop();
    // this number is arbitrary and is mostly for non terminal environments
    const columnCount = process.stdout.columns || 100;
    const titleUnderline = Array(Math.round(columnCount / 2))
      .fill('-')
      .join('');
    if (this.shouldOutput) {
      console.log('');
      console.log(phaseName);
      console.log(titleUnderline);
      console.log('');
      this.spinner.start(this.spinnerText);
    }
  }
  machineOutput() {
    this.shouldOutput = false;
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
    const shouldLog = () => this.shouldOutput && this.spinnerText; // TODO: remove this ugly hack
    return {
      log(...messages) {
        if (shouldLog()) {
          // spinner is running
          // TODO: this is a hack because we're only trying out this method for now
          spinner.stop();
          console.log(chalk.hex(stc(id))(messages.join(' ')));
          spinner.start();
        }
      },
      warn(...messages) {
        if (shouldLog()) {
          // spinner is running
          // TODO: this is a hack because we're only trying out this method for now
          const lines = messages.join(' ').split(/\n/);
          spinner.stop();
          lines
            .filter(line => line.replace(/\s+/, '').length > 0)
            .forEach(line => {
              console.log(chalk.yellow('WARN:'), chalk.hex(stc(id))(line));
            });
          spinner.start();
        }
      }
    };
  }
  end() {
    this.spinner.stop();
    this.spinnerText = undefined;
  }
}
