import stc from 'string-to-color';
import chalk from 'chalk';
import ora from 'ora';
import debounce from 'debounce';
import Logger from './logger';
import StatusLine from './status-line';
import getColumnCount from './get-column-count';

export default class Reporter {
  private phaseName?: string;
  private outputShouldBeSuppressed = false;
  private statusLine = new StatusLine();
  constructor() {
    this.outputShouldBeSuppressed = process.argv.includes('--json') || process.argv.includes('-j');
    process.on('SIGWINCH', () => {
      const columnCount = getColumnCount();
      if (columnCount < this.statusLine.minimumLength + this.statusLine.buffer) {
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
