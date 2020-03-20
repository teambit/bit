import EventEmitter from 'events';
import stc from 'string-to-color';
import chalk from 'chalk';
import ora from 'ora';
import debounce from 'debounce';
import Logger from './logger';

function getColumnCount() {
  // this number is arbitrary and is mostly for non terminal environments
  return process.stdout.columns || 100;
}

function clearStatusRow() {
  console.log(
    `\r${Array(getColumnCount())
      .fill(' ')
      .join('')}`
  );
}

export default class Reporter {
  private phaseName?: string;
  private spinner: any;
  private outputShouldBeSuppressed = false;
  private ids: Array<string>;
  constructor() {
    this.outputShouldBeSuppressed = process.argv.includes('--json') || process.argv.includes('-j');
    this.spinner = ora({ spinner: 'bouncingBar', stream: process.stdout }).stop();
    this.ids = [];
    this.reRenderSpinner = debounce(this.reRenderSpinner, 100);
    process.on('SIGWINCH', () => {
      clearStatusRow();
      this.spinner.stop();
      this.reRenderSpinner();
    });
  }
  startPhase(phaseName) {
    this.phaseName = phaseName;
    this.spinner.stop();
    {
      const columnCount = getColumnCount();
      const titleUnderline = Array(Math.round(columnCount / 2))
        .fill('-')
        .join('');
      if (!this.outputShouldBeSuppressed) {
        console.log('');
        console.log(phaseName);
        console.log(titleUnderline);
        console.log('');
        this.reRenderSpinner();
      }
    }
  }
  suppressOutput() {
    this.outputShouldBeSuppressed = true;
  }
  createLogger(id) {
    const logger = new Logger();
    this.addId(id);
    logger.onInfo((...messages) => {
      if (this.shouldWriteOutput) {
        // this.pauseSpinner();
        this.spinner.stop();
        console.log(chalk.hex(stc(id))(messages.join(' ')));
        this.reRenderSpinner();
        // this.unpauseSpinner();
      }
    });
    logger.onWarn((...messages) => {
      if (this.shouldWriteOutput) {
        const lines = messages.join(' ').split(/\n/);
        this.spinner.stop();
        lines
          .filter(line => line.replace(/\s+/, '').length > 0)
          .forEach(line => {
            console.log(chalk.yellow('WARN:'), chalk.hex(stc(id))(line));
          });
        this.reRenderSpinner();
      }
    });
    return logger;
  }
  end() {
    this.spinner.stop();
    this.phaseName = undefined;
    this.ids = [];
  }
  private get shouldWriteOutput() {
    return this.phaseName && !this.outputShouldBeSuppressed;
  }
  private addId(id) {
    this.ids.push(id);
    this.reRenderSpinner();
  }
  private reRenderSpinner() {
    if (this.shouldWriteOutput) {
      this.spinner.stop();
      {
        const columnCount = getColumnCount();
        const spinnerLength = 7; // 6 for the spinner, 1 for the space after it
        // we have to measure the length in this way because otherwise the formatting characters are measured as well
        const fullVersionLength = (this.ids.length > 0
          ? `${this.phaseName}: (${this.ids.join(', ')})`
          : this.phaseName || ''
        ).length;
        const fullVersion =
          this.ids.length > 0
            ? `${this.phaseName}: (${this.ids.map(logId => chalk.hex(stc(logId))(logId)).join(', ')})`
            : this.phaseName || '';
        const shortVersion = `${this.phaseName}: (...)`;
        if (columnCount < spinnerLength + 10) {
          clearStatusRow();
        } else if (columnCount < shortVersion.length + spinnerLength + 10) {
          this.spinner.text = this.phaseName;
          this.spinner.start();
        } else if (columnCount < fullVersionLength + spinnerLength + 10) {
          this.spinner.text = shortVersion;
          this.spinner.start();
        } else {
          this.spinner.text = fullVersion;
          this.spinner.start();
        }
      }
    }
  }
}
