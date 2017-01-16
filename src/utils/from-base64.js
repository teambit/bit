/** @flow */

export default function fromBase64(base64: string) {
  return new Buffer(base64, 'base64').toString();
}
