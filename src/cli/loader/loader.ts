import { platform } from 'os';
import ora, { Ora, PersistOptions } from 'ora';
import cliSpinners from 'cli-spinners';
import prettyTime from 'pretty-time';
import { sendEventsToClients } from '@teambit/harmony.modules.send-server-sent-events';

const SPINNER_TYPE = platform() === 'win32' ? cliSpinners.dots : cliSpinners.dots12;

export class Loader {
  private spinner: Ora | null;

  get isStarted() {
    return !!this.spinner;
  }

  get isSpinning() {
    return this.spinner?.isSpinning;
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
    sendEventsToClients('onLoader', { method: 'setTextAndRestart', args: [text] });
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
    sendEventsToClients('onLoader', { method: 'stop' });
    if (this.spinner) this.spinner.stop();
    return this;
  }

  succeed(text?: string, startTime?: [number, number]): Loader {
    sendEventsToClients('onLoader', { method: 'succeed', args: [text, startTime] });
    if (text && startTime) {
      const duration = process.hrtime(startTime);
      text = `${text} (completed in ${prettyTime(duration)})`;
    }
    if (this.spinner) this.spinner.succeed(text);
    return this;
  }

  fail(text?: string): Loader {
    sendEventsToClients('onLoader', { method: 'fail', args: [text] });
    if (this.spinner) this.spinner.fail(text);
    return this;
  }

  warn(text?: string): Loader {
    sendEventsToClients('onLoader', { method: 'warn', args: [text] });
    if (this.spinner) this.spinner.warn(text);
    return this;
  }

  info(text?: string): Loader {
    if (this.spinner) this.spinner.info(text);
    return this;
  }

  stopAndPersist(options?: PersistOptions): Loader {
    sendEventsToClients('onLoader', { method: 'stopAndPersist', args: [options] });
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
