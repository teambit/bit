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
