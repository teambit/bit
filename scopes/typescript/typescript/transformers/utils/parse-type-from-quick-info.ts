// eslint-disable-next-line import/no-unresolved
import protocol from 'typescript/lib/protocol';

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
    case 'const':
    case 'let':
    case 'var': {
      const [, ...tail] = splitByColon;
      return tail.join(':').trim();
    }
    case 'function': {
      const split = displayString.split('): ');
      if (split.length !== 2) {
        throw new Error(`quickinfo of a function below was not implemented.\n${displayString}`);
      }
      return split[1].trim();
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
