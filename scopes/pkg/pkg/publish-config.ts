import type { PkgExtensionConfig } from './pkg.main.runtime';

/**
 * whether the component is published to an external registry (npm), rather than to bit's own one.
 * this is the gate for the publish task: by default nothing is published externally.
 */
export function shouldPublishToExternalRegistry(config?: PkgExtensionConfig): boolean {
  if (!config || config.avoidPublishToNPM) return false;
  return Boolean(config.packageJson?.name || config.packageJson?.publishConfig);
}

/**
 * the extra arguments to pass to `npm publish`. each configured entry may hold several flags.
 */
export function getPublishArgs(config?: PkgExtensionConfig): string[] {
  const args = config?.packageManagerPublishArgs;
  if (!Array.isArray(args)) return [];
  return args.flatMap((arg) => arg.split(' '));
}

/**
 * the registry `npm publish` will use for this component, when it is not the default one for the
 * package's scope. follows npm's own precedence: the `--registry` argument beats `publishConfig`,
 * which beats the scope's registry from the npmrc. undefined means "whatever the scope resolves to".
 */
export function getPublishRegistry(config?: PkgExtensionConfig): string | undefined {
  // matched on the joined args so that `--registry <url>` and `--registry=<url>` read the same
  const registryArg = getPublishArgs(config)
    .join(' ')
    .match(/--registry[ =](\S+)/)?.[1];
  return registryArg || config?.packageJson?.publishConfig?.registry;
}
