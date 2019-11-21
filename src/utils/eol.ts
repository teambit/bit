import { isBinaryFileSync } from 'isbinaryfile';
import replaceBuffer from './buffer/replace-buffer-non-recursive';

const isWindows = typeof process !== 'undefined' && process.platform === 'win32';
const lineBreak = isWindows ? '\r\n' : '\n';
const newLines = ['\r\n', '\r', '\n'];
const newline = /\r\n|\r|\n/g;

function converts(text: string | Buffer, to: string) {
  if (Buffer.isBuffer(text)) {
    if (isBinaryFileSync(text)) return text; // don't touch binary files
    newLines.forEach(newLine => {
      // $FlowFixMe text is Buffer here
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (newLine !== to) text = replaceBuffer(text, newLine, to);
    });
    return text;
  }
  return text.toString().replace(newline, to);
}

exports.lf = function(text: string | Buffer) {
  return converts(text, '\n');
};

exports.auto = function(text: string | Buffer) {
  return converts(text, lineBreak);
};

exports.cr = function(text: string | Buffer) {
  return converts(text, '\r');
};

exports.crlf = function(text: string | Buffer) {
  return converts(text, '\r\n');
};
