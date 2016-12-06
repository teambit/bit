/** @flow */
import cleanChar from './clean-char';

export default function cleanBang(str: string): string {
  return cleanChar(str, '!');
}
