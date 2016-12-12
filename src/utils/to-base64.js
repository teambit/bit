/** @flow */

export default function toBase64(str: string) {
  return new Buffer(str).toString('base64'); 
}
