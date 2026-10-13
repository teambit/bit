import { resolveRustDependencyScannerRuntime } from '../files-dependency-builder/rust-scanner/runtime';

export type PolicyPackages = [Record<string, string>, Record<string, string>, Record<string, string>];
export type PolicyIndices = [number[], number[], number[]];
export type PolicyEntry = { identity: string; packageName: string | null; versionRange: string | null };
export type PolicyManifest = { dependencies: Record<string, string>; peerDependencies: Record<string, string> };
export type PolicyState = { packages: PolicyPackages; components: PolicyIndices; entries: PolicyEntry[] };
export type PolicyInput = PolicyState & {
  ignored: [string[], string[], string[]];
  missing: Array<{ isDevFile: boolean; missingPackages: string[] }>;
  policies: {
    modelPeers: Record<string, string>;
    packagePolicy: PolicyManifest;
    workspacePolicy: PolicyManifest;
    automatic: PolicyPackages;
  };
};
export type PolicyPlan = {
  packages: PolicyPackages;
  components: PolicyIndices;
  ranges: Array<string | null>;
  missing: string[][];
  removed: [string[], string[], string[]];
};
export type PolicyFinishInput = {
  state: PolicyState;
  manual: PolicyPackages;
  packageJson: PolicyPackages;
  resolved: Record<string, { name: string; componentIdentity: string | null; concreteVersion: string | null }>;
  selfIdentity: string;
  environment: {
    policy: Record<string, string>;
    workspace: PolicyManifest;
    modelComponents: PolicyEntry[];
    modelPackages: Record<string, string>;
  };
};
export type PolicyFinishPlan = {
  state: PolicyState;
  added: [string[], string[], string[]];
  missing: string[];
  ignoredSelf: string[];
  envOwn: string[];
};

/** Callers capture ordinary data at a canonical policy checkpoint before invoking this pure kernel. */
function request(input: PolicyInput | PolicyFinishInput, finish: boolean): unknown {
  if (process.env.BIT_RUST_CLIENT_VCS !== 'on') return undefined;
  try {
    const runtime = resolveRustDependencyScannerRuntime();
    if (!runtime?.workspaceAddon) return undefined;
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const binding = require(runtime.workspaceAddon) as {
      planDependencyPolicy?: (input: string, finish: boolean) => string;
    };
    if (typeof binding.planDependencyPolicy !== 'function') return undefined;
    const json = JSON.stringify(input);
    if (Buffer.byteLength(json) > 4 * 1024 * 1024) return undefined;
    const output = binding.planDependencyPolicy(json, finish);
    if (typeof output !== 'string' || Buffer.byteLength(output) > 32 * 1024 * 1024) return undefined;
    return JSON.parse(output);
  } catch {
    return undefined;
  }
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 65536 && value.every((item) => typeof item === 'string');
}
function triple(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length === 3;
}
const inheritedNames = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);
function safeName(value: string): boolean {
  return Boolean(value) && !value.includes('\0') && !inheritedNames.has(value);
}
function packages(value: unknown): value is PolicyPackages {
  return (
    triple(value) &&
    value.every(
      (map) =>
        map &&
        typeof map === 'object' &&
        !Array.isArray(map) &&
        Object.keys(map).length <= 65536 &&
        Object.keys(map).every(safeName) &&
        Object.values(map).every((item) => typeof item === 'string')
    )
  );
}
function components(value: unknown, count: number): value is PolicyIndices {
  return (
    triple(value) &&
    value.every(
      (rows) =>
        Array.isArray(rows) &&
        rows.length <= 65536 &&
        rows.every((index) => Number.isSafeInteger(index) && index >= 0 && index < count)
    )
  );
}
function entries(value: unknown): value is PolicyEntry[] {
  return (
    Array.isArray(value) &&
    value.length <= 65536 &&
    value.every(
      (entry) =>
        entry &&
        typeof entry.identity === 'string' &&
        Boolean(entry.identity) &&
        (entry.packageName === null || (typeof entry.packageName === 'string' && safeName(entry.packageName))) &&
        (entry.versionRange === null || typeof entry.versionRange === 'string')
    )
  );
}
export function planNativeDependencyPolicy(input: PolicyInput): PolicyPlan | undefined {
  const output = request(input, false) as PolicyPlan | undefined;
  if (
    !output ||
    !packages(output.packages) ||
    !components(output.components, input.entries.length) ||
    !Array.isArray(output.ranges) ||
    output.ranges.length !== input.entries.length ||
    !output.ranges.every((value) => value === null || typeof value === 'string') ||
    !Array.isArray(output.missing) ||
    output.missing.length !== input.missing.length ||
    !output.missing.every(strings) ||
    !triple(output.removed) ||
    !output.removed.every(strings)
  )
    return undefined;
  return output;
}
export function finishNativeDependencyPolicy(input: PolicyFinishInput): PolicyFinishPlan | undefined {
  const output = request(input, true) as PolicyFinishPlan | undefined;
  if (
    !output?.state ||
    !entries(output.state.entries) ||
    !packages(output.state.packages) ||
    !components(output.state.components, output.state.entries.length) ||
    !triple(output.added) ||
    !output.added.every(strings) ||
    !strings(output.missing) ||
    !strings(output.ignoredSelf) ||
    !strings(output.envOwn)
  )
    return undefined;
  return output;
}
