import { isBinaryFileSync } from 'isbinaryfile';

const isWindows = typeof process !== 'undefined' && process.platform === 'win32';
const lineBreak = isWindows ? '\r\n' : '\n';
const newline = /\r\n|\r|\n/g;

function converts(text: string | Buffer, to: string) {
  if (Buffer.isBuffer(text)) {
    if (isBinaryFileSync(text)) return text; // don't touch binary files
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
