import type { RustScannerDependency, RustScannerOutcome } from './types';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function dependency(value: unknown): value is RustScannerDependency {
  if (!object(value) || !keys(value, ['importSpecifiers', 'isTypeImport'])) return false;
  if (value.isTypeImport !== undefined && typeof value.isTypeImport !== 'boolean') return false;
  if (value.importSpecifiers === undefined) return true;
  if (!Array.isArray(value.importSpecifiers)) return false;
  return value.importSpecifiers.every((specifier) => {
    if (!object(specifier) || !keys(specifier, ['isDefault', 'name', 'exported'])) return false;
    return (
      typeof specifier.isDefault === 'boolean' &&
      (specifier.name === undefined || typeof specifier.name === 'string') &&
      (specifier.exported === undefined || typeof specifier.exported === 'boolean')
    );
  });
}

function outcome(value: unknown): value is RustScannerOutcome {
  if (!object(value) || !keys(value, ['path', 'status', 'dependencies', 'diagnostics'])) return false;
  if (
    typeof value.path !== 'string' ||
    !['ok', 'parse_error', 'read_error', 'unsupported'].includes(value.status as string)
  ) {
    return false;
  }
  if (!object(value.dependencies) || !Object.values(value.dependencies).every(dependency)) return false;
  if (!Array.isArray(value.diagnostics) || !value.diagnostics.every((message) => typeof message === 'string'))
    return false;
  return value.status === 'ok' || Object.keys(value.dependencies).length === 0;
}

/** Validate the entire response before allowing any file into the session cache. */
export function decodeResponse(line: string, id: string, paths: readonly string[]): RustScannerOutcome[] {
  const value: unknown = JSON.parse(line);
  if (!object(value) || !keys(value, ['version', 'id', 'files']) || value.version !== 1 || value.id !== id) {
    throw new Error('invalid Rust scanner response envelope');
  }
  if (!Array.isArray(value.files) || value.files.length !== paths.length) {
    throw new Error('invalid Rust scanner response file count');
  }
  const files = value.files;
  if (!files.every((file, index) => outcome(file) && file.path === paths[index])) {
    throw new Error('invalid Rust scanner response file identity or outcome');
  }
  return files as RustScannerOutcome[];
}
