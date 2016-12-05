/** @flow */
import { loadBox } from '../../box';

export default function list({ inline }: any) {
  return loadBox().list({ inline });
}
