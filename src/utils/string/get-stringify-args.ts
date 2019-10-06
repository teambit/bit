/**
 * Get pretty value (boolean) and return args to pass to the json.stringify method
 *
 * @export
 * @param {boolean} pretty - pretty print or not
 * @returns {Array} args to pass to the json.stringify
 * */
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
export default function getStringifyArgs(pretty?: boolean): Array {
  const args = [null, ''];
  if (pretty) args[1] = '  ';
  return args;
}
