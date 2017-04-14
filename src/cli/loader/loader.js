/** @flow */
import ora from 'ora';

let _loader;

type Loader = {
  on: () => Loader,
  off: () => ?Loader,
  start: (text: ?string) => ?Loader,
  stop: () => ?Loader,
  setText: (string) => ?Loader,
  get: () => ?Loader
}

const start = (text: ?string): ?Loader => {
  if (_loader) {
    if (text) _loader.text = text;
    _loader.start();
  }

  return _loader;
};

const setText = (text: string): ?Loader => {
  if (_loader) _loader.text = text;
  return _loader;
};

const get = (): ?Loader => _loader;

const stop = (): ?Loader => {
  if (_loader) _loader.stop();
  return _loader;
};

const on = (): Loader => {
  if (!_loader) _loader = ora({ text: '' });
  return _loader;
};

const off = (): ?Loader => {
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
  get,
};

export default loader;

