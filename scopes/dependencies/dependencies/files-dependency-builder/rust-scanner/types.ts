export type RustScannerDependency = {
  importSpecifiers?: Array<{ isDefault: boolean; name?: string; exported?: boolean }>;
  isTypeImport?: boolean;
};

export type RustScannerOutcome = {
  path: string;
  status: 'ok' | 'parse_error' | 'read_error' | 'unsupported';
  dependencies: Record<string, RustScannerDependency>;
  diagnostics: string[];
};

export type RustDependencyScannerSessionOptions = {
  executable: string;
  workspaceAddon?: string;
  args?: readonly string[];
  cwd?: string;
  threads?: number;
  timeoutMs?: number;
  maxBatchFiles?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  maxCacheBytes?: number;
  maxQueuedBytes?: number;
  maxPendingRequests?: number;
  signal?: AbortSignal;
};

export type RustGraphPathMap = {
  file: string;
  dependencies: {
    importSource: string;
    resolvedDep: string;
    importSpecifiers?: RustScannerDependency['importSpecifiers'];
  }[];
};
export type RustGraphVisited = { pathMap: RustGraphPathMap; missing?: string[]; error?: undefined };
export type RustDependencyGraphRequest = {
  root: string;
  files: string[];
  home: string;
  builtins: string[];
  typescript: boolean;
  includeNpm: boolean;
  detectorExtensions: string[];
  visited?: Record<string, RustGraphVisited>;
};
export type RustDependencyGraph = {
  tree: Record<string, string[]>;
  pathMap: RustGraphPathMap[];
  pathMapOrigins: number[];
  missing: Record<string, string[]>;
  errors: Record<string, never>;
  visited: Record<string, RustGraphVisited>;
  registeredPaths: string[];
  scannedPaths: string[];
};
