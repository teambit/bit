import { parse } from 'comment-json';
import { BitError } from '@teambit/bit-error';
import { MANUALLY_ADD_DEPENDENCY } from '@teambit/legacy.constants';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { DependencyResolverAspect, isPlusVersion } from '@teambit/dependency-resolver';
import { PLUS_RANGE_VERSIONS_FEATURE, isFeatureEnabled } from '@teambit/harmony.modules.feature-toggle';

const isPlusRangeVersion = (version?: string) => version !== MANUALLY_ADD_DEPENDENCY && isPlusVersion(version);

/**
 * returns a description of every "+^"/"+~" version the component uses: in its dependencies (e.g. an env.jsonc
 * supportedRange or `bit deps set`), in its dependency-resolver policy, and in its own env.jsonc if it's an env.
 */
export function getPlusRangeVersionsUsage(component: ConsumerComponent): string[] {
  const usages: string[] = [];
  component.getAllDependencies().forEach((dep) => {
    if (isPlusRangeVersion(dep.versionRange))
      usages.push(`${dep.packageName || dep.id.toStringWithoutVersion()}: "${dep.versionRange}"`);
  });
  const policy = component.extensions.findCoreExtension(DependencyResolverAspect.id)?.data?.policy || [];
  policy.forEach((entry) => {
    if (isPlusRangeVersion(entry.value?.version)) usages.push(`${entry.dependencyId}: "${entry.value.version}"`);
  });
  const envJsonc = component.files.find((file) => ['env.jsonc', 'env.json'].includes(file.relative));
  if (envJsonc) {
    let envJsoncPolicy: Record<string, any> | undefined;
    try {
      envJsoncPolicy = (parse(envJsonc.contents.toString()) as Record<string, any>)?.policy;
    } catch {
      // an invalid env.jsonc is reported when the env is loaded
    }
    const addUsage = (field: string, name: string, version: any) => {
      if (isPlusRangeVersion(version)) usages.push(`env.jsonc policy.${field} ${name}: "${version}"`);
    };
    Object.entries(envJsoncPolicy || {}).forEach(([field, entries]) => {
      if (Array.isArray(entries)) {
        entries.forEach((entry) => {
          addUsage(field, entry?.name, entry?.version);
          addUsage(field, entry?.name, entry?.supportedRange);
        });
        return;
      }
      // the legacy format, e.g. "peerDependencies": { "pkg": "1.0.0" } or { "pkg": { "version": "1.0.0" } }
      Object.entries(entries || {}).forEach(([name, value]: [string, any]) => {
        addUsage(field, name, typeof value === 'string' ? value : value?.version);
      });
    });
  }
  return [...new Set(usages)];
}

/**
 * "+^" and "+~" are not supported by older bit versions (including the one bit.cloud may run), which write them
 * as is to the package.json. until it's safe to use them, they're blocked from leaving the workspace.
 */
export function throwForPlusRangeVersions(components: ConsumerComponent[]) {
  if (isFeatureEnabled(PLUS_RANGE_VERSIONS_FEATURE)) return;
  const usagePerComp = components
    .map((component) => ({ id: component.id.toStringWithoutVersion(), usages: getPlusRangeVersionsUsage(component) }))
    .filter(({ usages }) => usages.length);
  if (!usagePerComp.length) return;
  const details = usagePerComp.map(({ id, usages }) => `${id}\n${usages.map((u) => `  ${u}`).join('\n')}`).join('\n');
  throw new BitError(`the following components use "+^"/"+~" versions, which are not supported yet:
${details}
older bit versions, including the one that builds and releases on bit.cloud, write them as is to the package.json.
use "+" or a semver range instead. to use them anyway, run "bit config set features=${PLUS_RANGE_VERSIONS_FEATURE}"`);
}
