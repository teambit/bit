export type DiagnosticFc = () => object;

export interface Diagnostic {
  diagnosticFn: DiagnosticFc;
}
