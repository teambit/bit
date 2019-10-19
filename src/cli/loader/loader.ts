/** @flow */
import ora from 'ora';

let _loader;

type Loader = {
  on: () => Loader;
  off: () => Loader | null;
  start: (text: string | null | undefined) => Loader | null;
  stop: () => Loader | null;
  setText: (text: string | null | undefined) => Loader | null | undefined;
  get: () => Loader | null;
};

const start = (text: string | null | undefined): Loader | null | undefined => {
  if (_loader) {
    if (text) _loader.text = text;
    _loader.start();
  }

  return _loader;
};

const setText = (text: string): Loader | null | undefined => {
  if (_loader) _loader.text = text;
  return _loader;
};

const get = (): Loader | null | undefined => _loader;

const stop = (): Loader | null | undefined => {
  if (_loader) _loader.stop();
  return _loader;
};

const on = (): Loader => {
  if (!_loader) _loader = ora({ text: '' });
  return _loader;
};

const off = (): Loader | null | undefined => {
  stop();
  _loader = null;
  return _loader;
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
