/** @flow */

export default function diff(firstArray: any[], secondArray: any[]): any[] {
  return firstArray.concat(secondArray).filter((val) => {
    return !(firstArray.includes(val) && secondArray.includes(val));
  });
}
