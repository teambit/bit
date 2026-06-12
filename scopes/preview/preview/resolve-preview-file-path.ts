import { join, resolve, sep } from 'path';

/**
 * Safely resolve a request-derived `filePath` against `publicDir`.
 *
 * `filePath` comes from the untrusted `serve-preview` URL (the trailing segments after the matched
 * component-preview key), so it may contain `..`. `path.join` collapses `..`, so a crafted
 * `../../../etc/passwd` would otherwise resolve outside `publicDir` and let `res.sendFile` read
 * arbitrary files. Returns the absolute path to serve when it stays inside `publicDir`, or
 * `undefined` when it would escape so the caller can reject the request.
 */
export function resolvePreviewFilePath(publicDir: string, filePath: string): string | undefined {
  const file = join(publicDir, filePath);
  const root = resolve(publicDir);
  const resolved = resolve(file);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    return undefined;
  }
  return file;
}
