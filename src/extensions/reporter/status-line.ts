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
  console.log(
    `\r${Array(getColumnCount())
      .fill(' ')
      .join('')}`
  );
}

export default class StatusLine {
  public buffer = SPACE_BUFFER;
  private spinner: any = ora({ spinner: 'bouncingBar', stream: process.stdout }).stop();
  private spinnerLength = 7; // 6 for spinner, 1 for space after it
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
