/** @flow */
import ora from 'ora';
import { SPINNER_TYPE } from '../../constants';

let _loader;

type Loader = {
  on: () => Loader,
  off: () => Loader | null | undefined,
  start: (text: string | null | undefined) => Loader | null | undefined,
  stop: () => Loader | null | undefined,
  setText: (text: string | null | undefined) => Loader | null | undefined,
  get: () => Loader | null | undefined
};

const start = (text: string | null | undefined): Loader => {
  if (_loader) {
    if (text) _loader.text = text;
    _loader.start();
  }
  return loader;
};

const setText = (text: string): Loader => {
  if (_loader) _loader.text = text;
  return loader;
};

const get = (): Loader | null | undefined => _loader;

const stop = (): Loader => {
  if (_loader) _loader.stop();
  return loader;
};

const on = (): Loader => {
  if (!_loader) _loader = ora({ spinner: SPINNER_TYPE, text: '' });
  return loader;
};

const off = (): Loader => {
  stop();
  _loader = null;
  return loader;
};

const loader: Loader = {
  on,
  off,
  stop,
  start,
  setText,
  get
};

export default loader;
