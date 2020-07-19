import stc from 'string-to-color';
import chalk from 'chalk';
import ora from 'ora';
import debounce from 'debounce';
import getColumnCount from './get-column-count';

// this number is added to status line length calculations.
// the idea is to assume we have a longer status line to make
// up for the js runtime speed
const SPACE_BUFFER = 10;

function clearStatusRow() {
  // eslint-disable-next-line no-console
  console.log(`\r${Array(getColumnCount()).fill(' ').join('')}`);
}

// we send a proxy to the spinner instance rather than proxess.stdout
// so that we would be able to bypass our monkey-patch of process.stdout
// this is so that we won't have a case where the stdout "write" method
// triggers itself through the spinner by doing "spinner.start()" or "spinner.stop()"
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const stdoutProxy = new Proxy(process.stdout, {
  get(obj, prop) {
    if (prop === 'write') {
      return originalStdoutWrite;
    }
    return obj[prop];
  },
});

const originalStderrWrite = process.stderr.write.bind(process.stderr);

export default class StatusLine {
  public buffer = SPACE_BUFFER;
  private spinner: any = ora({ spinner: 'bouncingBar', stream: stdoutProxy, isEnabled: true }).stop();
  private spinnerLength = 7; // 6 for spinner, 1 for space after it
  private text = '';
  private ids: Array<string> = [];
  private ended = false;
  constructor() {
    this.reRender = debounce(this.reRender, 100);
    // @ts-ignore
    // here we monkey-patch the process.stdout stream so that whatever is printed
    // does not break the status line with the spinner, and that this line always
    // remains at the bottom of the screen
    process.stdout.write = (buffer, encoding, callback) => {
      const wasSpinning = this.spinner.isSpinning;
      if (wasSpinning) {
        this.spinner.stop();
      }
      originalStdoutWrite(buffer, encoding, callback);
      if (wasSpinning) {
        this.spinner.start();
      }
    };
    // @ts-ignore
    process.stderr.write = (buffer, encoding, callback) => {
      const wasSpinning = this.spinner.isSpinning;
      if (wasSpinning) {
        this.spinner.stop();
      }
      originalStderrWrite(buffer, encoding, callback);
      if (wasSpinning) {
        this.spinner.start();
      }
    };
  }
  addId(id) {
    this.ids.push(id);
  }
  private fullVersion(phaseName) {
    return this.ids.length > 0
      ? `${phaseName}: (${this.ids.map((logId) => chalk.hex(stc(logId))(logId)).join(', ')})`
      : phaseName || '';
  }
  private fullVersionLength(text) {
    // we have to measure the length in this way because otherwise the formatting characters are measured as well
    return (this.ids.length > 0 ? `${text}: (${this.ids.join(', ')})` : text || '').length;
  }
  get minimumLength() {
    return this.spinnerLength;
  }
  private shortStatusLine(text) {
    return `${text}: (...)`;
  }
  clear() {
    clearStatusRow();
    this.spinner.stop();
    this.ended = true;
  }
  clearIds() {
    this.ids = [];
  }
  stopSpinner() {
    this.spinner.stop();
  }
  startSpinner() {
    this.spinner.start();
  }
  reRender(newText?: string) {
    if (this.ended) {
      return;
    }
    if (newText) {
      this.text = newText;
    }
    if (this.text.length === 0) {
      return;
    }
    this.spinner.stop();
    const columnCount = getColumnCount();
    const spinnerLength = 7; // 6 for the spinner, 1 for the space after it
    if (columnCount < spinnerLength + 10) {
      clearStatusRow();
    } else if (columnCount < this.shortStatusLine(this.text).length + spinnerLength + SPACE_BUFFER) {
      this.spinner.text = this.text;
      this.spinner.start();
    } else if (columnCount < this.fullVersionLength(this.text) + this.spinnerLength + SPACE_BUFFER) {
      this.spinner.text = this.shortStatusLine(this.text);
      this.spinner.start();
    } else {
      this.spinner.text = this.fullVersion(this.text);
      this.spinner.start();
    }
  }
}
