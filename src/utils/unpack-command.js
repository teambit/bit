import fromBase64 from './string/from-base64';

module.exports = function unpackCmd(str) {
  try {
    return JSON.parse(fromBase64(str));
  } catch (err) {
    throw new Error(str);
  }
};
