/** @flow */
import camelcase from 'camelcase';

export default ({ name }: { name: string }): string => {
  return `
/**
 * {description}
 * @param {type} name
 * @returns
 *
 */
module.exports = function ${camelcase(name)}() {

};`;
};
