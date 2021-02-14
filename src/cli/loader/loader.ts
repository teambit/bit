import ora, { Ora, PersistOptions } from 'ora';

import { SPINNER_TYPE } from '../../constants';

export class Loader {
  private spinner: Ora | null;

  get isStarted() {
    return !!this.spinner;
  }

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
    // for some reason the stream defaults to stderr.
    return ora({ spinner: SPINNER_TYPE, text: '', stream: process.stdout, discardStdin: false, hideCursor: false });
  }
}

const loader = new Loader();

export default loader;
