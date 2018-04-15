const replaceBuffer = require('replace-buffer');

!(function (root, name, make) {
  if (typeof module !== 'undefined' && module.exports) module.exports = make();
  else root[name] = make();
}(this, 'eol', function () {
  const api = {};
  const isWindows = typeof process !== 'undefined' && process.platform === 'win32';
  const linebreak = isWindows ? '\r\n' : '\n';
  const newLines = ['\r\n', '\r', '\n'];
  const newline = /\r\n|\r|\n/g;

  function before(text) {
    return linebreak + text;
  }

  function after(text) {
    return text + linebreak;
  }

  function converts(to) {
    function convert(text) {
      let str = text;
      if (Buffer.isBuffer(text)) {
        newLines.forEach(newLine => (str = replaceBuffer(str, newLine, to)));
        return str;
      }
      return newLines.forEach(newLine => (str = str.replace(newLine, to)));
    }
    convert.toString = function () {
      return to;
    };
    return convert;
  }

  function split(text) {
    return text.split(newline);
  }

  api.lf = converts('\n');
  api.cr = converts('\r');
  api.crlf = converts('\r\n');
  api.auto = converts(linebreak);
  api.before = before;
  api.after = after;
  api.split = split;
  return api;
}));
