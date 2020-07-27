import stc from 'string-to-color';
import chalk from 'chalk';
import debounce from 'debounce';
import getColumnCount from './get-column-count';
import loader from '../../cli/loader';

// this number is added to status line length calculations.
// the idea is to assume we have a longer status line to make
// up for the js runtime speed
const SPACE_BUFFER = 10;

/**
 * time in ms.
 * the timeout is to allow for multiple logs (or multiple `SIGWINCH` events) to pass through
 */
const TIME_BETWEEN_RE_RENDERING = 25;

function clearStatusRow() {
  // eslint-disable-next-line no-console
  console.log(`\r${Array(getColumnCount()).fill(' ').join('')}`);
}

export default class StatusLine {
  public buffer = SPACE_BUFFER;
  private spinner = loader;
  private spinnerLength = 7; // 6 for spinner, 1 for space after it
  private text = '';
  private ids: Array<string> = [];
  private ended = false;
  constructor() {
    this.reRender = debounce(this.reRender, TIME_BETWEEN_RE_RENDERING);
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
      this.spinner.setText(this.text);
      this.spinner.start();
    } else if (columnCount < this.fullVersionLength(this.text) + this.spinnerLength + SPACE_BUFFER) {
      this.spinner.setText(this.shortStatusLine(this.text));
      this.spinner.start();
    } else {
      this.spinner.setText(this.fullVersion(this.text));
      this.spinner.start();
    }
  }
}
