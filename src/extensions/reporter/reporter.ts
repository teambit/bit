/* eslint-disable no-console */
import stc from 'string-to-color';
import chalk from 'chalk';
import { Logger, LogEntry, LogLevel } from '../logger';
import StatusLine from './status-line';
import getColumnCount from './get-column-count';

export default class Reporter {
  private outputShouldBeSuppressed = false;
  private statusLine = new StatusLine();
  constructor(private logger: Logger) {
    this.outputShouldBeSuppressed = process.argv.includes('--json') || process.argv.includes('-j');
    process.on('SIGWINCH', () => {
      const columnCount = getColumnCount();
      if (columnCount < this.statusLine.minimumLength + this.statusLine.buffer) {
        this.statusLine.clear();
      }
      if (this.shouldWriteOutput) {
        this.statusLine.reRender();
      }
    });
  }
  suppressOutput() {
    this.outputShouldBeSuppressed = true;
  }
  setStatusText(text) {
    this.statusLine.reRender(text);
  }
  title(...messages) {
    this.statusLine.stopSpinner();
    console.log('');
    console.log(chalk.bold(messages.join(' '))); // TODO: default color/style
    console.log('');
    this.statusLine.startSpinner();
  }
  info(componentId, messages) {
    const lines = messages.split(/\n/);
    this.statusLine.stopSpinner();
    lines
      .filter(line => line.replace(/\s+/, '').length > 0)
      .forEach(line => {
        if (componentId) {
          console.log(chalk.hex(stc(componentId))(line));
        } else {
          console.log(line);
        }
      });
    this.statusLine.startSpinner();
  }
  warn(componentId, messages) {
    const lines = messages.split(/\n/);
    this.statusLine.stopSpinner();
    lines
      .filter(line => line.replace(/\s+/, '').length > 0)
      .forEach(line => {
        // console.log(chalk.yellow('warn:'), chalk.hex(stc(id))(line));
        if (componentId) {
          console.log(chalk.yellow('warn:'), chalk.hex(stc(componentId))(line));
        } else {
          console.log(chalk.yellow('warn:'), line);
        }
      });
    this.statusLine.startSpinner();
  }
  error(componentId, messages) {
    const lines = messages.split(/\n/);
    this.statusLine.stopSpinner();
    lines
      .filter(line => line.replace(/\s+/, '').length > 0)
      .forEach(line => {
        if (componentId) {
          console.log(chalk.red('error:'), chalk.hex(stc(componentId))(line));
        } else {
          console.log(chalk.red('error:'), line);
        }
      });
    this.statusLine.startSpinner();
  }
  debug(componentId, messages) {
    const lines = messages.split(/\n/);
    this.statusLine.stopSpinner();
    lines
      .filter(line => line.replace(/\s+/, '').length > 0)
      .forEach(line => {
        if (componentId) {
          console.log(chalk.hex(stc(componentId))(line));
        } else {
          console.log(line);
        }
      });
    this.statusLine.startSpinner();
  }
  subscribe(extensionName) {
    this.logger.subscribe(extensionName, (logEntry: LogEntry) => {
      const { componentId, messages } = logEntry;
      switch (logEntry.logLevel) {
        case LogLevel.INFO:
          this.info(componentId, messages);
          break;
        case LogLevel.WARN:
          this.warn(componentId, messages);
          break;
        case LogLevel.ERROR:
          this.error(componentId, messages);
          break;
        case LogLevel.DEBUG:
          this.debug(componentId, messages);
          break;
        default:
          break;
      }
    });
  }

  unsubscribe(extensionName) {
    this.logger.unsubscribe(extensionName);
  }
  end() {
    this.statusLine.clear();
  }
  private get shouldWriteOutput() {
    return !this.outputShouldBeSuppressed;
  }
}
