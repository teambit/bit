import ora, { Ora, PersistOptions } from 'ora';
import { SPINNER_TYPE } from '../../constants';

export class Loader {
  private spinner: Ora | null;

  on(): Loader {
    if (!this.spinner) {
      this.spinner = this.createNewSpinner();
    }
    return this;
  }

  off(): Loader {
    this.stop();
    this.spinner = null;
    return this;
  }

  start(text?: string): Loader {
    if (this.spinner) {
      this.spinner.start(text);
    }
    return this;
  }

  setText(text: string): Loader {
    if (this.spinner) this.spinner.text = text;
    return this;
  }

  setTextAndRestart(text: string): Loader {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner.text = text;
      this.spinner.start();
    }
    return this;
  }

  get(): Ora | null {
    return this.spinner;
  }

  stop(): Loader {
    if (this.spinner) this.spinner.stop();
    return this;
  }

  succeed(text?: string): Loader {
    if (this.spinner) this.spinner.succeed(text);
    return this;
  }

  fail(text?: string): Loader {
    if (this.spinner) this.spinner.fail(text);
    return this;
  }

  warn(text?: string): Loader {
    if (this.spinner) this.spinner.warn(text);
    return this;
  }

  info(text?: string): Loader {
    if (this.spinner) this.spinner.info(text);
    return this;
  }

  stopAndPersist(options?: PersistOptions): Loader {
    if (this.spinner) this.spinner.stopAndPersist(options);
    return this;
  }

  private createNewSpinner(): Ora {
    // we send a proxy to the spinner instance rather than process.stdout
    // so that we would be able to bypass our monkey-patch of process.stdout
    // this is so that we won't have a case where the stdout "write" method
    // triggers itself through the spinner by doing "spinner.start()" or "spinner.stop()"
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    const stdoutProxy = new Proxy(process.stdout, {
      get(obj, prop) {
        if (prop === 'write') {
          return originalStdoutWrite;
        }
        return obj[prop];
      },
    });
    const spinner = ora({ spinner: SPINNER_TYPE, text: '', stream: stdoutProxy });
    // @ts-ignore
    // here we monkey-patch the process.stdout stream so that whatever is printed
    // does not break the status line with the spinner, and that this line always
    // remains at the bottom of the screen
    process.stdout.write = (buffer, encoding, callback) => {
      const wasSpinning = spinner.isSpinning;
      if (wasSpinning) {
        spinner.stop();
      }
      originalStdoutWrite(buffer, encoding, callback);
      if (wasSpinning) {
        spinner.start();
      }
    };
    // @ts-ignore
    process.stderr.write = (buffer, encoding, callback) => {
      const wasSpinning = spinner.isSpinning;
      if (wasSpinning) {
        spinner.stop();
      }
      originalStderrWrite(buffer, encoding, callback);
      if (wasSpinning) {
        spinner.start();
      }
    };
    return spinner;
  }
}

const loader = new Loader();

export default loader;
