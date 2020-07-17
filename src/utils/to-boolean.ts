/**
 * Convert a boolean from a string or boolean, return default value in case of null or undefined
 */
export default (function toBoolean(value: boolean | null | undefined | string, defaultValue: boolean): boolean {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  const valueAsString = String(value).trim().toLowerCase();
  if (valueAsString === 'true') {
    return true;
  }
  if (valueAsString === 'false') {
    return false;
  }
  return defaultValue;
});
