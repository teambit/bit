/** @flow */
import isTextOrBinary from 'istextorbinary';
import replaceBuffer from './buffer/replace-buffer-non-recursive';

const isWindows = typeof process !== 'undefined' && process.platform === 'win32';
const lineBreak = isWindows ? '\r\n' : '\n';
const newLines = ['\r\n', '\r', '\n'];
const newline = /\r\n|\r|\n/g;

function converts(fileName: string, text: string | Buffer, to: string) {
  if (Buffer.isBuffer(text)) {
    if (isTextOrBinary.isBinarySync(fileName, text)) return text; // don't touch binary files
    newLines.forEach((newLine) => {
      // $FlowFixMe text is Buffer here
      if (newLine !== to) text = replaceBuffer(text, newLine, to);
    });
    return text;
  }
  return text.toString().replace(newline, to);
}

exports.lf = function (text: string | Buffer, fileName: string) {
  return converts(fileName, text, '\n');
};

exports.auto = function (text: string | Buffer, fileName: string) {
  return converts(fileName, text, lineBreak);
};

exports.cr = function (text: string | Buffer, fileName: string) {
  return converts(fileName, text, '\r');
};

exports.crlf = function (text: string | Buffer, fileName: string) {
  return converts(fileName, text, '\r\n');
};
