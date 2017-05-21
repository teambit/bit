/** @flow */

/**
 * splits an array to two chunks by a given predicator
 * 
 * @bit
 * @name splitBy
 * @param {[*]} array 
 * @param {() => boolean} fn 
 * @returns {[[], []]} truthy elements from the left and falsy elements from the right.
 */
function splitBy(array: [], fn: (elm: any) => boolean): [Array<any>, Array<any>] {
  const truthy = [];
  const falsy = [];

  array.forEach((elm) => {
    if (fn(elm)) truthy.push(elm);
    else falsy.push(elm);
  });

  return [falsy, truthy];
}

module.exports = splitBy;
