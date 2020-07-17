import ora from 'ora';
import { SPINNER_TYPE } from '../../constants';

let _loader;

type Loader = {
  on: () => Loader;
  off: () => Loader | null | undefined;
  start: (text: string | null | undefined) => Loader | null | undefined;
  stop: () => Loader | null | undefined;
  setText: (text: string | null | undefined) => Loader | null | undefined;
  get: () => Loader | null | undefined;
  succeed: (text?: string | null | undefined) => Loader | null | undefined;
  fail: (text?: string | null | undefined) => Loader | null | undefined;
  warn: (text?: string | null | undefined) => Loader | null | undefined;
  info: (text?: string | null | undefined) => Loader | null | undefined;
  stopAndPersist: (options?: object | null | undefined) => Loader | null | undefined;
};

const loader: Loader = {
  on,
  off,
  stop,
  start,
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  setText,
  get,
  succeed,
  fail,
  warn,
  info,
  stopAndPersist,
};

function start(text: string | null | undefined): Loader {
  if (_loader) {
    if (text) _loader.text = text;
    _loader.start();
  }
  return loader;
}

function setText(text: string): Loader {
  if (_loader) _loader.text = text;
  return loader;
}

function get(): Loader | null | undefined {
  return _loader;
}

function stop(): Loader {
  if (_loader) _loader.stop();
  return loader;
}

function on(): Loader {
  if (!_loader) _loader = ora({ spinner: SPINNER_TYPE, text: '' });
  return loader;
}

function off(): Loader {
  stop();
  _loader = null;
  return loader;
}

function succeed(text: string | null | undefined): Loader {
  if (_loader) _loader.succeed(text);
  return loader;
}

function fail(text: string | null | undefined): Loader {
  if (_loader) _loader.fail(text);
  return loader;
}

function warn(text: string | null | undefined): Loader {
  if (_loader) _loader.warn(text);
  return loader;
}

function info(text: string | null | undefined): Loader {
  if (_loader) _loader.info(text);
  return loader;
}

function stopAndPersist(options: object | null | undefined): Loader {
  if (_loader) _loader.stopAndPersist(options);
  return loader;
}

export default loader;
