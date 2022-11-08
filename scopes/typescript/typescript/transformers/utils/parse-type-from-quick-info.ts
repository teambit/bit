// eslint-disable-next-line import/no-unresolved
import protocol from 'typescript/lib/protocol';

export const UNRESOLVED = '<<unresolved>>';

/**
 * try to parse the type from the quickinfo.
 * this is an error-prone process, we do our best here.
 *
 * an example of a function with many ":"
 * `export function getObj(a: string, func: (b: number) => {}) { return { a: 1, b: 2 } };`
 * which produce the following quickinfo:
 * ```ts
 * function getObj(a: string, func: (b: number) => {}): {
 *   a: number;
 *   b: number;
 * }
 * ```
 *
 * some examples of quickinfo:
 *
 * function ts.signatureToDisplayParts(typechecker: TypeChecker, signature: Signature, enclosingDeclaration?: Node | undefined, flags?: TypeFormatFlags): SymbolDisplayPart[]
 *
 * const enum ts.TypeFormatFlags
 *
 * (method) ts.TypeChecker.writeSignature(signature: Signature, enclosingDeclaration?: Node | undefined, flags?: TypeFormatFlags | undefined, kind?: SignatureKind | undefined, writer?: EmitTextWriter | undefined): string
 *
 * const obj: {
 *   a: number;
 *   b: number;
 *  }
 *
 * function getObj(a: string): {
 *     a: number;
 *     b: number;
 * }
 */
export function parseTypeFromQuickInfo(quickInfo: protocol.QuickInfoResponse | undefined): string {
  if (!quickInfo?.body?.displayString) return '';
  const displayString = quickInfo.body.displayString;
  const splitByColon = displayString.split(':');
  switch (quickInfo.body.kind) {
    case 'type parameter':
      // (type parameter) T in concat<T, K, V>(array1: T[], array2: T[]): T[]
      return displayString.replace(`(${quickInfo.body.kind}) `, '').split(' ')[0];
    case 'const':
    case 'property':
    case 'let':
    case 'var': {
      const [, ...tail] = splitByColon;
      return tail.join(':').trim();
    }
    case 'method':
    case 'function': {
      const split = displayString.split('): ');
      if (split.length !== 2) {
        // it's hard to determine where the return-type is. so it's better to show unresolved.
        // maybe, in the UI, in this case, it's best to show the signature.
        // e.g.
        // (method) IssuesList.getIssue<T extends ComponentIssue>(IssueClass: {
        //   new (): T;
        // }): T | undefined
        return UNRESOLVED;
      }
      return split[1].trim();
    }
    case 'alias': {
      // e.g. (alias) class BuilderService\nimport BuilderService
      // e.g. '(alias) type Serializable = {\n' +
      // '    toString(): string;\n' +
      // '}\n' +
      // 'import Serializable'
      const firstLine = displayString.split('\n')[0];
      const splitBySpace = firstLine.trim().split(' ');
      // first two are alias keyword and alias type
      const [, , typeName] = splitBySpace;
      return typeName;
    }
    case 'type': {
      // e.g. `type TaskSlot = SlotRegistry<BuildTask[]>`
      const splitByEqual = displayString.split('=');
      const [, ...tail] = splitByEqual;
      return tail.join('=').trim();
    }
    default:
      return splitByColon[splitByColon.length - 1].trim();
  }
}

export function parseReturnTypeFromQuickInfo(quickInfo: protocol.QuickInfoResponse | undefined): string {
  if (!quickInfo) return '';
  const typeStr = parseTypeFromQuickInfo(quickInfo);
  const array = typeStr.split('=>');
  return array[array.length - 1].trim();
}
