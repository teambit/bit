import chalk from 'chalk';

const ESM_CJS_INTEROP_ERROR_PATTERNS = [
  /is not defined in ES module scope/,
  /Cannot use import statement outside a module/,
  /require\(\) of ES Module/,
  /ERR_REQUIRE_ESM/,
  /Must use import to load ES Module/,
];

// matches an absolute path segment pointing into node_modules, e.g.
// "/repo/node_modules/@scope/pkg/dist/index.js" or "/repo/node_modules/pkg/index.js"
const NODE_MODULES_PATH_REGEX = /(?:file:\/\/)?(\/[^\s'"]*?node_modules\/((?:@[^/\s]+\/)?[^/\s'"]+)[^\s'"]*)/;

function isEsmCjsInteropError(errMsg?: string): boolean {
  if (!errMsg) return false;
  return ESM_CJS_INTEROP_ERROR_PATTERNS.some((pattern) => pattern.test(errMsg));
}

/**
 * best-effort extraction of the offending dependency from the full error text (message + stack).
 * node's "exports is not defined in ES module scope" error, for example, includes the exact file
 * path (and often the package.json path) that triggered it, so we don't need to guess.
 */
function findCulpritPackage(fullErrText?: string): { pkgName?: string; filePath?: string } {
  if (!fullErrText) return {};
  const match = fullErrText.match(NODE_MODULES_PATH_REGEX);
  if (!match) return {};
  const filePath = match[1];
  // with pnpm's virtual store, the path contains nested node_modules segments, e.g.
  // ".../node_modules/.pnpm/pkg@1.0.0_transitive/node_modules/pkg/dist/index.js" - the last
  // "node_modules/<pkg>" segment is the actual resolved package, not the ".pnpm" store dir.
  const segments = [...filePath.matchAll(/node_modules\/((?:@[^/\s'"]+\/)?[^/\s'"]+)/g)];
  const pkgName = segments.length ? segments[segments.length - 1][1] : undefined;
  return { filePath, pkgName };
}

function getEsmCjsInteropHint(errMsg?: string, fullErrText?: string): string {
  if (!isEsmCjsInteropError(errMsg)) return '';
  const { pkgName, filePath } = findCulpritPackage(fullErrText || errMsg);
  const culpritLine = pkgName
    ? `\nLikely caused by the dependency ${chalk.cyan(pkgName)}${filePath ? ` (${chalk.dim(filePath)})` : ''}.`
    : '';
  return chalk.yellow(
    `\nThis looks like an ES Module / CommonJS interoperability issue. It usually happens when one of the ` +
      `dependencies (or a nested/transitive dependency) was published as an ESM-only package, but is being ` +
      `loaded via CommonJS "require()".${culpritLine}\n` +
      `Check your lockfile for a recent version bump of that dependency, and consider pinning it back to a ` +
      `CommonJS-compatible version.\n`
  );
}

export const UNABLE_TO_LOAD_EXTENSION = (id: string, errMsg?: string, fullErrText?: string) =>
  `error: Bit received an error loading "${id}", due to the error "${
    errMsg || '<unknown-error>'
  }", please use the '--log=error' flag for the full error.${getEsmCjsInteropHint(errMsg, fullErrText)}`;
export const UNABLE_TO_LOAD_EXTENSION_FROM_LIST = (
  ids: string[],
  errMsg?: string,
  neededFor?: string,
  fullErrText?: string
) => {
  // const installOutput = err?.code === 'MODULE_NOT_FOUND' ? `try running "bit install" to install the missing dependencies` : '';
  const installOutput = `try running ${chalk.cyan('"bit install"')} to fix this issue`;
  return `Bit received an error loading ${chalk.cyan(ids.join(', '))}, due to the error:
"${errMsg || '<unknown-error>'}".
This is required for the component: ${chalk.cyan(neededFor || 'unknown')}
${getEsmCjsInteropHint(errMsg, fullErrText)}Please use the ${chalk.cyan("'--log=error'")} flag for the full error.
${installOutput}
`;
};
