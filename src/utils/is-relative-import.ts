// @flow

/**
 * returns whether a the require/import path is relative.
 *
 * the criteria is taken from http://www.typescriptlang.org/docs/handbook/module-resolution.html
 * Quote: A relative import is one that starts with /, ./ or ../. Some examples include:
 * import Entry from "./components/Entry";
 * import { DefaultHeaders } from "../constants/http";
 * import "/mod";
 * End quote.
 */
export default function isRelativeImport(str: string): boolean {
  return str.startsWith('./') || str.startsWith('../') || str.startsWith('/') || str === '.' || str === '..';
}
