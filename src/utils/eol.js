/** @flow */
import replaceBuffer from 'replace-buffer';

const isWindows = typeof process !== 'undefined' && process.platform === 'win32';
const linebreak = isWindows ? '\r\n' : '\n';
const newLines = ['\r\n', '\r', '\n'];
const newline = /\r\n|\r|\n/g;

function converts(text: string | Buffer, to: string) {
  let str = text;
  if (Buffer.isBuffer(text)) {
    newLines.forEach(function (newLine) {
      str = replaceBuffer(str, newLine, to);
    });
    return str;
  }
  return str.toString().replace(newline, to);
}

exports.lf = function (text: string | Buffer) {
  return converts(text, '\n');
};

exports.auto = function (text: string | Buffer) {
  return converts(text, linebreak);
};

exports.cr = function (text: string | Buffer) {
  return converts(text, '\r');
};

exports.crlf = function (text: string | Buffer) {
  return converts(text, '\r\n');
};
