import stc from 'string-to-color';
import chalk from 'chalk';
import ora from 'ora';
import debounce from 'debounce';

function getColumnCount() {
  // this number is arbitrary and is mostly for non terminal environments
  return process.stdout.columns || 100;
}

export default class Reporter {
  private phaseName?: string;
  private spinner: any;
  private outputShouldBeSuppressed = false;
  private ids: Array<string>;
  private paused = false;
  constructor() {
    this.outputShouldBeSuppressed = process.argv.includes('--json') || process.argv.includes('-j');
    this.spinner = ora({ spinner: 'bouncingBar', stream: process.stdout }).stop();
    this.ids = [];
    this.unpauseSpinner = debounce(this.unpauseSpinner, 100);
    process.on('SIGWINCH', () => this.reRenderSpinner());
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
  private addId(id) {
    this.ids.push(id);
    this.reRenderSpinner();
  }
  createLogger(id) {
    const spinner = this.spinner;
    const unpauseSpinner = this.unpauseSpinner.bind(this);
    const shouldWriteOutput = () => this.phaseName && !this.outputShouldBeSuppressed; // TODO: remove this ugly hack
    this.addId(id);
    return {
      log(...messages) {
        if (shouldWriteOutput()) {
          // spinner is running
          spinner.stop();
          console.log(chalk.hex(stc(id))(messages.join(' ')));
          unpauseSpinner();
        }
      },
      warn(...messages) {
        if (shouldWriteOutput()) {
          // spinner is running
          const lines = messages.join(' ').split(/\n/);
          spinner.stop();
          lines
            .filter(line => line.replace(/\s+/, '').length > 0)
            .forEach(line => {
              console.log(chalk.yellow('WARN:'), chalk.hex(stc(id))(line));
            });
          unpauseSpinner();
        }
      }
    };
  }
  end() {
    this.spinner.stop();
    this.phaseName = undefined;
    this.ids = [];
  }
  private reRenderSpinner() {
    if (this.phaseName && !this.paused && !this.outputShouldBeSuppressed) {
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
          // clear spinner line - we need this because the spinner (seems to be) unaware of the
          // window size change, so doesn't clear everything on its own
          console.log(
            `\r${Array(spinnerLength + 10)
              .fill(' ')
              .join('')}`
          );
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
  private pauseSpinner() {
    this.paused = true;
    this.spinner.stop();
  }
  private unpauseSpinner() {
    this.paused = false;
    this.reRenderSpinner();
  }
}
