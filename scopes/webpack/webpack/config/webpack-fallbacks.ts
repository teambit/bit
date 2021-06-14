// based on https://github1s.com/vercel/next.js/blob/canary/packages/next/build/webpack-config.ts
// Full list of old polyfills is accessible here:
// https://github.com/webpack/webpack/blob/2a0536cf510768111a3a6dceeb14cb79b9f59273/lib/ModuleNotFoundError.js#L13-L42

const assertFallbackPath = require.resolve('assert/');
const bufferFallbackPath = require.resolve('buffer/');
const constantsFallbackPath = require.resolve('constants-browserify');
const cryptoFallbackPath = require.resolve('crypto-browserify');
const domainFallbackPath = require.resolve('domain-browser');
const httpFallbackPath = require.resolve('stream-http');
const httpsFallbackPath = require.resolve('https-browserify');
const osFallbackPath = require.resolve('os-browserify/browser');
const pathFallbackPath = require.resolve('path-browserify');
const punycodeFallbackPath = require.resolve('punycode/');
const processFallbackPath = require.resolve('process/browser');
// Handled in separate alias
const querystringFallbackPath = require.resolve('querystring-es3');
const streamFallbackPath = require.resolve('stream-browserify');
const string_decoderFallbackPath = require.resolve('string_decoder/');
const sysFallbackPath = require.resolve('util/');
const timersFallbackPath = require.resolve('timers-browserify');
const ttyFallbackPath = require.resolve('tty-browserify');
// Handled in separate alias
const urlFallbackPath = require.resolve('url/');
const utilFallbackPath = require.resolve('util/');
const vmFallbackPath = require.resolve('vm-browserify');
const zlibFallbackPath = require.resolve('browserify-zlib');

export const fallbacks = {
  assert: assertFallbackPath,
  buffer: bufferFallbackPath,
  constants: constantsFallbackPath,
  crypto: cryptoFallbackPath,
  domain: domainFallbackPath,
  http: httpFallbackPath,
  https: httpsFallbackPath,
  os: osFallbackPath,
  path: pathFallbackPath,
  punycode: punycodeFallbackPath,
  process: processFallbackPath,
  querystring: querystringFallbackPath,
  stream: streamFallbackPath,
  string_decoder: string_decoderFallbackPath,
  sys: sysFallbackPath,
  timers: timersFallbackPath,
  tty: ttyFallbackPath,
  url: urlFallbackPath,
  util: utilFallbackPath,
  vm: vmFallbackPath,
  zlib: zlibFallbackPath,
  fs: false,
  net: false,
  tls: false,
  child_process: false,
  // file: false,
  // module: false,
  // pnpapi: false,
  // readline: false,
  // worker_threads: false,
};
