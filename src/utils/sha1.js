import crypto from 'crypto';

export default function sha1(data, encoding) {
  return crypto.createHash('sha1')
  .update(data)
  .digest(encoding || 'hex');
}
