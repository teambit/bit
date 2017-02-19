/** @flow */
import ora from 'ora';
import { SPINNER_TYPE } from '../constants';

let _loader;

type Loader = {
  on: () => Loader,
  off: () => Loader,
  start: (text: ?string) => Loader,
  stop: () => Loader,
  setText: (string) => Loader,
}

const on = (): Loader => {
  if (!_loader) _loader = ora({ spinner: SPINNER_TYPE, text: '' });
  return loader;
};

const off = (): Loader => {
  _loader = null;
  return loader;
};

const start = (text: ?string): Loader => {
  if (_loader) {
    if (text) _loader.text = text;
    _loader.start();
  }
  return loader;
};

const stop = (): Loader => {
  if (_loader) _loader.stop();
  return loader;
};

const setText = (text: string): Loader => {
  if (_loader) _loader.text = text;
  return loader;
};

const loader: Loader = {
  on,
  off,
  stop,
  start,
  setText,
};

module.exports = loader;
