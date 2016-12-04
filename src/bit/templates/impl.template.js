/** @flow */
import type { BitProps } from '../bit';

export default ({ name, version = 1 }: BitProps) => {
  return `
  /**
    * @bit 
    * @name ${name}
    * @version ${version}
    * @env {{env}}
    * @dependencies []
    * @param {type} name
    * @returns
    * @sig 
    * @example
    * // example description
    * example.do(); //outputs nothing
    */
    module.exports = function () {
      
    };`;
};
