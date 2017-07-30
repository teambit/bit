/** @flow */
/**
 * Retrieve latest bit version from latest to number
 * @param {Array<BitIds>} arr
 * @param {string} id
 * @returns {string}
 */
import R from 'ramda';
import {
  VERSION_DELIMITER,
  LATEST
} from '../constants';

const findLatest = (component , bitIds, idWithLatest) => {
  const bitArr = {};
  Object.keys(bitIds).forEach((id) => {
    const bit = id.split('::');
    if (bitArr[bit[0]]) {
      bitArr[bit[0]].push(bit[1]);
    } else {
      bitArr[bit[0]]= [bit[1]];
    }
  });
  const id = bitArr[component];
  const maxVersion = R.apply(Math.max, id);
  return id ? `${component}::${maxVersion}`: idWithLatest;
};

export default function getLatestVersionNumber(bitIds: Array<Object>, idWithLatest: string) {
  const componentId = idWithLatest.split(VERSION_DELIMITER);
  if (componentId.length < 2 || componentId[1] !== LATEST) return idWithLatest;
  return findLatest(componentId[0], bitIds, idWithLatest);
}


/*
 const a = ['bit.nodejs/models/scope::1','bit.nodejs/models/scope::2','bit.nodejs/models/scope::3'];
 getLatestVersionNumber(a,'bit.nodejs/models/scope::latest')
 */
