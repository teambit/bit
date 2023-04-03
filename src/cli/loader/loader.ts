import Spinnies from 'dreidels';

import { SPINNER_TYPE } from '../../constants';

export const DEFAULT_SPINNER = 'default';

/**
 * previous loader was "ora" (which doesn't support multi spinners)
 * some differences:
 * 1) when starting a new spinner, it immediately shows a loader that can't be easily "inactive".
 * 2) when calling "stop()", it doesn't only stop the loader, but also persist the previous text.
 */
export class Loader {
  private spinner: Spinnies | null;

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
    if (!this.spinner) return this;
    this.removeAll();
    this.spinner = null;
    return this;
  }

  private removeAll() {
    if (!this.spinner) return;
    const spinners = this.spinner;
    Object.keys(spinners.spinners).forEach((name) => {
      spinners.spinners[name].removeAllListeners();
      delete spinners.spinners[name];
    });
    spinners.checkIfActiveSpinners();
    spinners.updateSpinnerState();
  }

  /**
   * @deprecated
   * no need to start a spinner. just log/spin whenever needed
   */
  start(text?: string, spinnerName = DEFAULT_SPINNER) {
    this.spin(text || ' ', spinnerName);
  }

  private spin(text: string, spinnerName = DEFAULT_SPINNER) {
    if (!this.spinner) return;
    if (this.getSpinner(spinnerName)) this.getSpinner(spinnerName)?.text(text);
    else this.spinner.add(spinnerName, { text });
  }

  setText(text: string, spinnerName = DEFAULT_SPINNER) {
    this.spin(text, spinnerName);
  }

  setTextAndRestart(text: string, spinnerName = DEFAULT_SPINNER) {
    this.spin(text, spinnerName);
  }

  get(): Spinnies | null {
    return this.spinner;
  }

  /**
   * avoid using `this.spinner?.spinners.get()` method. it throws when the spinner was removed.
   * (which automatically happens when calling fail/stop/succeed/warn/info)
   */
  getSpinner(spinnerName = DEFAULT_SPINNER): ReturnType<Spinnies['get']> | undefined {
    return this.spinner?.spinners[spinnerName];
  }

  /**
   * avoid calling `.stop()`, it persists the last message.
   */
  stop(spinnerName = DEFAULT_SPINNER) {
    this.getSpinner(spinnerName)?.remove();
  }

  succeed(text?: string, spinnerName = DEFAULT_SPINNER) {
    this.getSpinner(spinnerName)?.succeed({ text });
  }

  fail(text?: string, spinnerName = DEFAULT_SPINNER) {
    this.getSpinner(spinnerName)?.fail({ text });
  }

  warn(text?: string, spinnerName = DEFAULT_SPINNER) {
    this.getSpinner(spinnerName)?.warn({ text });
  }

  info(text?: string, spinnerName = DEFAULT_SPINNER) {
    this.getSpinner(spinnerName)?.info({ text });
  }

  stopAndPersist(text?: string, spinnerName = DEFAULT_SPINNER) {
    this.getSpinner(spinnerName)?.static({ text });
  }

  private createNewSpinner(): Spinnies {
    const spinnies = new Spinnies({ spinner: SPINNER_TYPE });
    return spinnies;
  }
}

const loader = new Loader();

export default loader;
