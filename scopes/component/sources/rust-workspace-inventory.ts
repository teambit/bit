import { withWorkspaceSession } from './rust-workspace-persistence';

export type RustInventoryPolicy = {
  rules: Array<{ source: string; negative: boolean }>;
  cache?: Array<[string, boolean]>;
};
export type RustInventoryBegin = {
  token: number;
  count: number;
  nested: Array<{ directory: string; patterns: string[] }>;
  own: string[];
  cache: Array<[string, boolean]>;
};
export type RustInventoryConfiguration = {
  combined: RustInventoryPolicy;
  hard: RustInventoryPolicy;
  own: RustInventoryPolicy;
  ignoredRoot: string[];
};
export type RustInventoryFile = { relativePath: string; name: string; test: false };
const stringify = JSON.stringify;
const safeText = (value: unknown): value is string =>
  typeof value === 'string' && !value.includes('\0') && Buffer.from(value).toString() === value;
const paths = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= 4096 && value.every(safeText);
function isBegin(value: any): value is RustInventoryBegin {
  return (
    value &&
    Number.isSafeInteger(value.token) &&
    value.token > 0 &&
    Number.isSafeInteger(value.count) &&
    value.count >= 0 &&
    value.count <= 4096 &&
    paths(value.own) &&
    Array.isArray(value.nested) &&
    value.nested.length <= 4096 &&
    value.nested.every((row: any) => safeText(row.directory) && paths(row.patterns)) &&
    Array.isArray(value.cache) &&
    value.cache.length <= 65536 &&
    value.cache.every(
      (row: any) => Array.isArray(row) && row.length === 2 && safeText(row[0]) && typeof row[1] === 'boolean'
    )
  );
}
/** Keep the candidate inventory in Rust while the adapter supplies configured ignore expressions. */
export async function runRustWorkspaceInventory(
  root: string,
  workspace: string,
  excludeDirs: string[],
  rootPolicy: RustInventoryPolicy,
  configure: (scan: RustInventoryBegin) => RustInventoryConfiguration | undefined
): Promise<{ scan: RustInventoryBegin; files: RustInventoryFile[] } | undefined> {
  if (process.env.BIT_RUST_CLIENT_VCS !== 'on') return undefined;
  return withWorkspaceSession(async (session) => {
    async function request<T>(
      input: object,
      valid: (value: any, completed: number) => value is T
    ): Promise<T | undefined> {
      if (
        JSON.stringify !== stringify ||
        Object.hasOwn(Object.prototype, 'toJSON') ||
        Object.hasOwn(Array.prototype, 'toJSON')
      )
        return undefined;
      const bytes = Buffer.from(stringify(input));
      if (bytes.length > 4 * 1024 * 1024) return undefined;
      let result: T | undefined;
      await session.request(
        (id) => {
          const header = Buffer.alloc(12);
          header.write('BWS1');
          header.writeUInt32BE(id, 4);
          header.writeUInt32BE(bytes.length, 8);
          return Buffer.concat([header, bytes]);
        },
        4096,
        (response) => {
          if (response.failed) return true;
          if (!valid(response.data, response.completed)) return false;
          result = response.data;
          return true;
        },
        32 * 1024 * 1024,
        true
      );
      return result;
    }
    const scan = await request(
      { kind: 'inventoryBegin', root, workspace, excludeDirs, rootPolicy },
      (value, completed): value is RustInventoryBegin => isBegin(value) && value.count === completed
    );
    if (!scan) return undefined;
    let finished = false;
    try {
      const configuration = configure(scan);
      if (!configuration) return undefined;
      const result = await request(
        { kind: 'inventoryFinish', token: scan.token, ...configuration },
        (value, completed): value is { files: RustInventoryFile[] } => {
          if (
            !value ||
            !Array.isArray(value.files) ||
            value.files.length > scan.count ||
            value.files.length !== completed
          )
            return false;
          const names = new Set<string>();
          let previous: string | undefined;
          return value.files.every((file: RustInventoryFile) => {
            if (
              !safeText(file.relativePath) ||
              !file.relativePath ||
              file.relativePath.startsWith('/') ||
              file.relativePath.split('/').some((part) => !part || part === '.' || part === '..') ||
              file.name !== file.relativePath.split('/').at(-1) ||
              file.test !== false ||
              names.has(file.relativePath) ||
              (previous !== undefined && previous >= file.relativePath)
            )
              return false;
            names.add(file.relativePath);
            previous = file.relativePath;
            return true;
          });
        }
      );
      finished = Boolean(result);
      return result && { scan, files: result.files };
    } finally {
      if (!finished)
        await request(
          { kind: 'inventoryCancel', token: scan.token },
          (value, completed): value is { cancelled: true } => value?.cancelled === true && completed === 1
        );
    }
  });
}
