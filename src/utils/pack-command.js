import toBase64 from './to-base64';

module.exports = function packCmd(obj) {
  return toBase64(JSON.stringify(obj));
};
