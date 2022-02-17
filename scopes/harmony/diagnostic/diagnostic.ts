export type DiagnosticFc = () => Object;

export interface Diagnostic {
  diagnosticFn: DiagnosticFc;
}
