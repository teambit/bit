import { DiagnosticMessageChain, server } from 'typescript';

export type Diagnostic = server.protocol.Diagnostic;

/**
 * mostly taken from ts repo, src/compiler/program.ts "formatDiagnosticsWithColorAndContext" method.
 * sadly, it's impossible to use that method for the diagnostic format coming from ts-server. it only
 * works with the diagnostic format of "ts" APIs.
 */
export function formatDiagnostics(diagnostics: readonly Diagnostic[], filePath: string): string {
  let output = '';

  for (const diagnostic of diagnostics) {
    output += formatDiagnostic(diagnostic, filePath);
  }
  return output;
}

const diagnosticCategoryName = (diagnostic: Diagnostic) => diagnostic.category;

export function formatDiagnostic(diagnostic: Diagnostic, filePath: string): string {
  const errorMessage = `${diagnosticCategoryName(diagnostic)} TS${diagnostic.code}: ${flattenDiagnosticMessageText(
    diagnostic.text,
    '\n'
  )}${'\n'}`;

  const { line, offset } = diagnostic.start;
  return `${filePath}(${line},${offset}): ${errorMessage}`;
}

function flattenDiagnosticMessageText(
  diag: string | DiagnosticMessageChain | undefined,
  newLine: string,
  indent = 0
): string {
  if (typeof diag === 'string') {
    return diag;
  }
  if (diag === undefined) {
    return '';
  }
  let result = '';
  if (indent) {
    result += newLine;

    for (let i = 0; i < indent; i += 1) {
      result += '  ';
    }
  }
  result += diag.messageText;
  indent += 1;
  if (diag.next) {
    for (const kid of diag.next) {
      result += flattenDiagnosticMessageText(kid, newLine, indent);
    }
  }
  return result;
}
