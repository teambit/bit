import React from 'react';
import type { APIDiffResult, APIDiffChange } from './api-diff-model';
import { ComponentApiDiffSection, ApiDiffSlimRow } from './component-api-diff-section';
import { ApiDiffInsightProvider } from './api-diff-insights';

const heroChange: APIDiffChange = {
  status: 'MODIFIED',
  visibility: 'public',
  exportName: 'Hero',
  schemaType: 'React Component',
  schemaTypeRaw: 'ReactSchema',
  impact: 'BREAKING',
  baseSignature: 'Hero(props: { title: string }): ReactNode',
  compareSignature: 'Hero(props: { title: ReactNode, onCta: () => void }): ReactNode',
  changes: [
    {
      changeKind: 'parameter-added',
      description: "required prop 'onCta' added — existing usages won't compile",
      impact: 'BREAKING',
    },
    {
      changeKind: 'parameter-type-changed',
      description: "prop 'title' type changed",
      impact: 'BREAKING',
      from: 'string',
      to: 'ReactNode',
    },
  ],
};

const addedChange: APIDiffChange = {
  status: 'ADDED',
  visibility: 'public',
  exportName: 'useHeroAnalytics',
  schemaType: 'Function',
  schemaTypeRaw: 'FunctionLikeSchema',
  impact: 'NON_BREAKING',
  compareSignature: 'useHeroAnalytics(heroId: string): HeroAnalytics',
};

const internalChange: APIDiffChange = {
  status: 'MODIFIED',
  visibility: 'internal',
  exportName: 'normalizeHeroProps',
  schemaType: 'Function',
  schemaTypeRaw: 'FunctionLikeSchema',
  impact: 'BREAKING',
  baseSignature: 'normalizeHeroProps(props: HeroProps): HeroProps',
  compareSignature: 'normalizeHeroProps(props: HeroProps, strict: boolean): HeroProps',
  changes: [{ changeKind: 'parameter-added', description: "required parameter 'strict' added", impact: 'BREAKING' }],
};

// mirrors a real env-class diff: a breaking removal + base-class change, a batch of minor optional
// additions (properties then methods), and a patch doc removal — exercises the severity clusters,
// collapse-by-kind, and the highlighted add/remove signatures.
const classChange: APIDiffChange = {
  status: 'MODIFIED',
  visibility: 'public',
  exportName: 'AttReact',
  schemaType: 'Class',
  schemaTypeRaw: 'ClassSchema',
  impact: 'BREAKING',
  changes: [
    {
      changeKind: 'member-removed',
      description: "Variable 'eslintConfigPath' removed — consumers using it will break",
      impact: 'BREAKING',
      from: '(property) AttReact.eslintConfigPath: string',
    },
    {
      changeKind: 'extends-changed',
      description: 'extends changed: extends ReactEnv → extends ReactRspackEnv',
      impact: 'BREAKING',
      from: 'extends ReactEnv',
      to: 'extends ReactRspackEnv',
    },
    {
      changeKind: 'member-added',
      description: "Variable 'oxlintConfigPath' added (optional): (property) AttReact.oxlintConfigPath: string",
      impact: 'NON_BREAKING',
      to: '(property) AttReact.oxlintConfigPath: string',
    },
    {
      changeKind: 'member-added',
      description: "Variable 'envCurrentPath' added (optional): (property) AttReact.envCurrentPath: string",
      impact: 'NON_BREAKING',
      to: '(property) AttReact.envCurrentPath: string',
    },
    {
      changeKind: 'member-added',
      description: "Function 'getOxlintNodeOptions' added: (method) AttReact.getOxlintNodeOptions(): OxlintOptions",
      impact: 'NON_BREAKING',
      to: '(method) AttReact.getOxlintNodeOptions(): { configPath: string; tsconfigPath: string; typeAware: boolean }',
    },
    {
      changeKind: 'member-added',
      description: "Function 'workspaceConfig' added: (method) AttReact.workspaceConfig(): ConfigWriterList",
      impact: 'NON_BREAKING',
      to: '(method) AttReact.workspaceConfig(): ConfigWriterList',
    },
    {
      changeKind: 'documentation-removed',
      description: "Function 'build': documentation removed",
      impact: 'PATCH',
      from: 'a set of processes to be performed before a component is snapped, during its build phase\n@see https://bit.dev/docs/react-env/build-pipelines',
      signature: '(method) AttReact.build(): Pipeline',
    },
  ],
};

function makeResult(overrides: Partial<APIDiffResult>): APIDiffResult {
  return {
    status: 'COMPUTED',
    base: { available: true },
    compare: { available: true },
    hasChanges: true,
    impact: 'BREAKING',
    internalImpact: 'PATCH',
    publicChanges: [],
    internalChanges: [],
    added: 0,
    removed: 0,
    modified: 0,
    breaking: 0,
    nonBreaking: 0,
    patch: 0,
    ...overrides,
  };
}

export const SectionWithBreakingChanges = () => (
  <div style={{ padding: 20, maxWidth: 900 }}>
    <ComponentApiDiffSection
      componentIdStr="community.ui/hero"
      displayName="ui/hero"
      baseVersion="0.0.8aaaa"
      compareVersion="0.1.0bbbb"
      result={makeResult({
        publicChanges: [heroChange, addedChange],
        internalChanges: [internalChange],
        internalImpact: 'BREAKING',
      })}
    />
  </div>
);

export const SectionUnresolvedExports = () => (
  <div style={{ padding: 20, maxWidth: 900 }}>
    <ComponentApiDiffSection
      componentIdStr="community.ui/hero"
      displayName="ui/hero"
      baseVersion="0.1.0"
      compareVersion="0.2.0"
      result={makeResult({
        publicChanges: [heroChange],
        unresolvedExports: ['LegacyHero', 'useHeroInternal'],
        impact: 'BREAKING',
      })}
    />
  </div>
);

export const SectionOnlyUnresolved = () => (
  <div style={{ padding: 20, maxWidth: 900 }}>
    <ComponentApiDiffSection
      componentIdStr="community.ui/footer"
      displayName="ui/footer"
      result={makeResult({ hasChanges: false, impact: 'PATCH', unresolvedExports: ['Footer'] })}
    />
  </div>
);

export const SectionSeverityClusters = () => (
  <div style={{ padding: 20, maxWidth: 900 }}>
    <ComponentApiDiffSection
      componentIdStr="att-bit.duc/environment/att-react"
      displayName="environment/att-react"
      baseVersion="6.0.0"
      compareVersion="11b30aa5"
      result={makeResult({
        publicChanges: [classChange],
        impact: 'BREAKING',
        added: 4,
        removed: 1,
        modified: 2,
        breaking: 2,
        nonBreaking: 4,
        patch: 1,
      })}
    />
  </div>
);

export const SectionWithInsights = () => (
  <ApiDiffInsightProvider
    insights={[
      {
        id: 'demo.insight',
        matches: (change) => change.impact === 'BREAKING',
        render: (change) => (
          <span>✦ Migration hint for {change.exportName}: wrap existing callers with an adapter.</span>
        ),
      },
    ]}
  >
    <div style={{ padding: 20, maxWidth: 900 }}>
      <ComponentApiDiffSection
        componentIdStr="community.ui/hero"
        displayName="ui/hero"
        result={makeResult({ publicChanges: [heroChange] })}
      />
    </div>
  </ApiDiffInsightProvider>
);

export const SectionLoading = () => (
  <div style={{ padding: 20, maxWidth: 900 }}>
    <ComponentApiDiffSection componentIdStr="community.ui/hero" displayName="ui/hero" result={undefined} loading />
  </div>
);

export const SectionUnavailable = () => (
  <div style={{ padding: 20, maxWidth: 900 }}>
    <ComponentApiDiffSection
      componentIdStr="community.ui/footer"
      displayName="ui/footer"
      baseVersion="0.0.4cccc"
      result={makeResult({
        status: 'BASE_UNAVAILABLE',
        base: { available: false, reason: 'NOT_BUILT' },
        hasChanges: false,
        impact: 'PATCH',
      })}
    />
  </div>
);

// NEITHER side has an API — the calm blank state (distinct from the amber one-side "Schema unavailable").
export const SectionNoApiAvailable = () => (
  <div style={{ padding: 20, maxWidth: 900 }}>
    <ComponentApiDiffSection
      componentIdStr="community.ui/config"
      displayName="ui/config"
      baseVersion="1.0.2"
      compareVersion="1.0.3"
      result={makeResult({
        status: 'UNAVAILABLE',
        base: { available: false, reason: 'NOT_BUILT' },
        compare: { available: false, reason: 'NOT_BUILT' },
        hasChanges: false,
        impact: 'PATCH',
      })}
    />
  </div>
);

export const SectionError = () => (
  <div style={{ padding: 20, maxWidth: 900 }}>
    <ComponentApiDiffSection
      componentIdStr="community.ui/card"
      displayName="ui/card"
      result={null}
      error="failed to load component from remote"
    />
  </div>
);

export const SectionInternalOnly = () => (
  <div style={{ padding: 20, maxWidth: 900 }}>
    <ComponentApiDiffSection
      componentIdStr="community.ui/button"
      displayName="ui/button"
      result={makeResult({ internalChanges: [internalChange], internalImpact: 'BREAKING', impact: 'PATCH' })}
    />
  </div>
);

export const SectionNoChanges = () => (
  <div style={{ padding: 20, maxWidth: 900 }}>
    <ComponentApiDiffSection
      componentIdStr="community.ui/button"
      displayName="ui/button"
      result={makeResult({ hasChanges: false, impact: 'PATCH' })}
    />
  </div>
);

export const SlimRows = () => (
  <div style={{ padding: 20, maxWidth: 900 }}>
    <ApiDiffSlimRow componentIdStr="a" displayName="ui/button" chip="✓ no API changes" tone="ok" />
    <ApiDiffSlimRow
      componentIdStr="b"
      displayName="ui/footer"
      chip="⚠ no API data"
      detail="base version 0.0.4 was built before API extraction — no API snapshot exists"
      tone="warn"
    />
    <ApiDiffSlimRow
      componentIdStr="c"
      displayName="ui/card"
      chip="⚠ API diff failed"
      detail="failed to load component from remote"
      tone="error"
    />
    <ApiDiffSlimRow
      componentIdStr="d"
      displayName="ui/nav"
      chip="new component"
      detail="no base version to compare"
      tone="ok"
    />
  </div>
);
