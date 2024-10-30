import crypto from 'crypto';

/**
 * Generates random string of a specific size
 * @param size - the maximum size can be 40 characters
 */
export function generateRandomStr(size = 8): string {
  return crypto.randomBytes(20).toString('hex').substring(0, size);
}
