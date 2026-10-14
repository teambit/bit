import { formatItem, formatSection } from '@teambit/cli/dist/output-formatter.js';
import { formatLaneMergeAbort } from '@teambit/merge-lanes/dist/merge-abort-output.js';
import { hydrateRustWorkspaceCommand } from './rust-workspace-command-report';
import type { RustRecoveryOptions } from './rust-workspace-recovery-options';

function record(value: any, keys: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new Error('native recovery report shape');
}

export function formatRustWorkspaceRecovery(value: any, options: RustRecoveryOptions) {
  const checkoutOptions = {
    operation: 'checkout' as const,
    to: 'reset',
    all: true,
    verbose: options.verbose,
    skipDependencyInstallation: true as const,
  };
  if (options.operation === 'componentAbort') {
    record(value, ['abortedComponents']);
    const hydrated = hydrateRustWorkspaceCommand({ components: value.abortedComponents }, checkoutOptions);
    if (!Array.isArray(value.abortedComponents)) throw new Error('native recovery aborted components');
    return formatSection(
      'merge aborted',
      '',
      hydrated.components!.map((component) => formatItem(component.id.toStringWithoutVersion()))
    );
  }
  record(value, ['checkoutResults', 'restoredItems', 'checkoutError']);
  if (
    !Array.isArray(value.restoredItems) ||
    value.restoredItems.length > 4096 ||
    value.restoredItems.some((item: unknown) => typeof item !== 'string' || item.length > 16384)
  )
    throw new Error('native recovery restored items');
  if (value.checkoutError !== undefined) {
    record(value.checkoutError, ['message']);
    if (typeof value.checkoutError.message !== 'string' || value.checkoutError.message.length > 65536)
      throw new Error('native recovery checkout error');
  }
  return formatLaneMergeAbort(
    {
      ...value,
      checkoutResults:
        value.checkoutResults === undefined
          ? undefined
          : hydrateRustWorkspaceCommand(value.checkoutResults, checkoutOptions),
    },
    { reset: true, all: true, verbose: options.verbose, skipNpmInstall: true }
  );
}
