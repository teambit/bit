/** @flow */

export default function toBase64(val: string|Buffer) {
  if (val instanceof Buffer) return val.toString('base64');
  return new Buffer(val).toString('base64');
}
