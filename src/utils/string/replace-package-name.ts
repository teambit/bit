const singleQuote = "'";
const doubleQuotes = '"';

/**
 * 1) replace an exact match. (e.g. '@bit/old-scope.is-string' => '@bit/new-scope.is-string')
 * 2) the require/import statement might be to an internal path (e.g. '@bit/david.utils/is-string/internal-file')
 * 3) the import can start with `~` when working with scss files
 *
 * Read this regex `(${quoteType}~?)${oldName}(/|${quoteType})` as follows:
 * (${quoteType}~?) => string starts with a quote, and then zero or one tilda (~). this whole part got replaced by $1
 * ${oldName} => this is the only part in the string that really get changed, all other are preserved
 * (/|${quoteType}) => string that is either a slash or a quote. (must be one of the two). this whole part got replace by $2
 */
export default function replacePackageName(
  str: string,
  oldName: string,
  newName: string,
  prefixBeforeInternalPath?: string
): string {
  if (prefixBeforeInternalPath) {
    [singleQuote, doubleQuotes].forEach((quoteType) => {
      str = str.replace(new RegExp(`(${quoteType}~?)${oldName}(${quoteType})`, 'g'), `$1${newName}$2`);
    });
    [singleQuote, doubleQuotes].forEach((quoteType) => {
      str = str.replace(new RegExp(`(${quoteType}~?)${oldName}(/)`, 'g'), `$1${newName}$2${prefixBeforeInternalPath}/`);
    });
  } else {
    [singleQuote, doubleQuotes].forEach((quoteType) => {
      str = str.replace(new RegExp(`(${quoteType}~?)${oldName}(/|${quoteType})`, 'g'), `$1${newName}$2`);
    });
  }

  return str;
}
