import stc from 'string-to-color';
import chalk from 'chalk';
import ora from 'ora';
import debounce from 'debounce';
import Logger from './logger';

// this number is added to status line length calculations.
// the idea is to assume we have a longer status line to make
// up for the js runtime speed
const SPACE_BUFFER = 10;

function getColumnCount() {
  // the number on the right side is arbitrary and is mostly for non terminal environments
  return process.stdout.columns || 100;
}

function clearStatusRow() {
  console.log(
    `\r${Array(getColumnCount())
      .fill(' ')
      .join('')}`
  );
}

class StatusLine {
  private spinner: any = ora({ spinner: 'bouncingBar', stream: process.stdout }).stop();
  private spinnerLength: number = 7; // 6 for spinner, 1 for space after it
  private ids: Array<string> = [];
  constructor() {
    this.reRender = debounce(this.reRender, 100);
  }
  addId(id) {
    this.ids.push(id);
  }
  private fullVersion(phaseName) {
    return this.ids.length > 0
      ? `${phaseName}: (${this.ids.map(logId => chalk.hex(stc(logId))(logId)).join(', ')})`
      : phaseName || '';
  }
  private fullVersionLength(phaseName) {
    // we have to measure the length in this way because otherwise the formatting characters are measured as well
    return (this.ids.length > 0 ? `${phaseName}: (${this.ids.join(', ')})` : phaseName || '').length;
  }
  get minimumLength() {
    return this.spinnerLength;
  }
  private shortStatusLine(phaseName) {
    return `${phaseName}: (...)`;
  }
  clear() {
    clearStatusRow();
    this.spinner.stop();
  }
  clearIds() {
    this.ids = [];
  }
  stopSpinner() {
    this.spinner.stop();
  }
  reRender(phaseName) {
    this.spinner.stop();
    if (phaseName) {
      const columnCount = getColumnCount();
      const spinnerLength = 7; // 6 for the spinner, 1 for the space after it
      if (columnCount < spinnerLength + 10) {
        clearStatusRow();
      } else if (columnCount < this.shortStatusLine(phaseName).length + spinnerLength + SPACE_BUFFER) {
        this.spinner.text = phaseName;
        this.spinner.start();
      } else if (columnCount < this.fullVersionLength(phaseName) + this.spinnerLength + SPACE_BUFFER) {
        this.spinner.text = this.shortStatusLine(phaseName);
        this.spinner.start();
      } else {
        this.spinner.text = this.fullVersion(phaseName);
        this.spinner.start();
      }
    }
  }
}

export default class Reporter {
  private phaseName?: string;
  private outputShouldBeSuppressed = false;
  private statusLine: StatusLine = new StatusLine();
  constructor() {
    this.outputShouldBeSuppressed = process.argv.includes('--json') || process.argv.includes('-j');
    process.on('SIGWINCH', () => {
      const columnCount = getColumnCount();
      if (columnCount < this.statusLine.minimumLength + SPACE_BUFFER) {
        this.statusLine.clear();
      }
      if (this.shouldWriteOutput) {
        this.statusLine.reRender(this.phaseName);
      }
    });
  }
  startPhase(phaseName) {
    this.phaseName = phaseName;
    this.statusLine.clear();
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
        this.statusLine.reRender(phaseName);
      }
    }
  }
  suppressOutput() {
    this.outputShouldBeSuppressed = true;
  }
  createLogger(id) {
    const logger = new Logger();
    this.statusLine.addId(id);
    logger.onInfo((...messages) => {
      if (this.shouldWriteOutput) {
        this.statusLine.stopSpinner();
        console.log(chalk.hex(stc(id))(messages.join(' ')));
        this.statusLine.reRender(this.phaseName);
      }
    });
    logger.onWarn((...messages) => {
      if (this.shouldWriteOutput) {
        const lines = messages.join(' ').split(/\n/);
        this.statusLine.stopSpinner();
        lines
          .filter(line => line.replace(/\s+/, '').length > 0)
          .forEach(line => {
            console.log(chalk.yellow('WARN:'), chalk.hex(stc(id))(line));
          });
        this.statusLine.reRender(this.phaseName);
      }
    });
    return logger;
  }
  end() {
    this.phaseName = undefined;
    this.statusLine.clearIds();
    this.statusLine.reRender(this.phaseName);
  }
  private get shouldWriteOutput() {
    return this.phaseName && !this.outputShouldBeSuppressed;
  }
}
