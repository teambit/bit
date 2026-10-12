import { isBinaryFileSync } from 'isbinaryfile';
import type * as BinaryModule from 'isbinaryfile';
import * as defining from './eol';
// Inspect the defining CommonJS export rather than an interop namespace getter.
const binary = require('isbinaryfile') as typeof BinaryModule;

const isWindows = typeof process !== 'undefined' && process.platform === 'win32';
const lineBreak = isWindows ? '\r\n' : '\n';
const newline = /\r\n|\r|\n/g;

function converts(text: string | Buffer, to: string, isBinary = isBinaryFileSync) {
  if (Buffer.isBuffer(text)) {
    if (isBinary(text)) return text; // don't touch binary files
    const str = text.toString();
    const strReplaced = str.replace(newline, to);
    if (str !== strReplaced) return Buffer.from(strReplaced);
    return text;
  }
  return text.toString().replace(newline, to);
}

export function lf(text: string | Buffer) {
  return converts(text, '\n');
}

export function auto(text: string | Buffer) {
  return converts(text, lineBreak);
}

export function cr(text: string | Buffer) {
  return converts(text, '\r');
}

export function crlf(text: string | Buffer) {
  return converts(text, '\r\n');
}

const defaultAuto = auto;
const defaultLf = lf;
const defaultBinary = isBinaryFileSync;

/** Checkout normalization must retain canonical binary classification and LF function hooks. */
export function captureDefaultEolLf(): typeof lf | undefined {
  if (
    Object.getOwnPropertyDescriptor(defining, 'lf')?.value !== defaultLf ||
    Object.getOwnPropertyDescriptor(binary, 'isBinaryFileSync')?.value !== defaultBinary
  )
    return undefined;
  return (text) => converts(text, '\n', defaultBinary);
}

/** Preserve the write prefix without invoking replacement accessors or later binary hooks. */
export function captureDefaultEolAuto(): typeof auto | undefined {
  if (
    Object.getOwnPropertyDescriptor(defining, 'auto')?.value !== defaultAuto ||
    Object.getOwnPropertyDescriptor(binary, 'isBinaryFileSync')?.value !== defaultBinary
  )
    return undefined;
  return (text) => converts(text, lineBreak, defaultBinary);
}
