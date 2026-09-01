import { realpathSync } from 'fs';
import { join, resolve, sep } from 'path';

function safeRealpath(p: string): string | undefined {
  try {
    return realpathSync(p);
  } catch {
    return undefined; // path doesn't exist (yet) — nothing to resolve
  }
}

/**
 * Safely resolve a request-derived `filePath` against `publicDir`.
 *
 * `filePath` comes from the untrusted `serve-preview` URL (the trailing segments after the matched
 * component-preview key), so it may contain `..`. `path.join` collapses `..`, so a crafted
 * `../../../etc/passwd` would otherwise resolve outside `publicDir` and let `res.sendFile` read
 * arbitrary files. We additionally `realpath` both ends so a symlink inside `publicDir` cannot
 * redirect the served file outside it. For a not-yet-existent target there is no symlink to follow,
 * so we fall back to the lexical resolve (which still collapses `..`) and let the caller `404`.
 *
 * Returns the absolute path to serve when it stays inside `publicDir`, or `undefined` when it would
 * escape so the caller can reject the request.
 */
export function resolvePreviewFilePath(publicDir: string, filePath: string): string | undefined {
  const file = join(publicDir, filePath);
  const root = safeRealpath(publicDir) ?? resolve(publicDir);
  const resolved = safeRealpath(file) ?? resolve(file);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    return undefined;
  }
  return file;
}
