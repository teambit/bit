import { withWorkspaceSession, isRustWorkspaceEngine, retireRustWorkspaceEngine } from '@teambit/component.sources';

export type CheckoutObservation =
  | 'unmerged'
  | 'resolveTarget'
  | 'hasVersion'
  | 'currentVersion'
  | 'mergePending'
  | 'modified'
  | 'targetRemoved';

type Observe = { kind: 'observe'; observation: CheckoutObservation; version?: string };
export type CheckoutSelection =
  | { kind: 'failure'; message: string; legitimate: boolean; shouldBeRemoved?: true }
  | { kind: 'target'; version: string; merge: boolean };
type SelectionState = { token: string; revision: number; directive: Observe | CheckoutSelection };

export type CheckoutSelectionInput = {
  component: {
    id: string;
    idWithoutVersion: string;
    componentVersion?: string;
    hasBitmap: boolean;
    currentExists: boolean;
    isRemoved: boolean;
  };
  model?: { hasMainHead: boolean };
  options: {
    reset: boolean;
    head: boolean;
    ancestor?: number;
    main: boolean;
    latest: boolean;
    version?: string;
    versionPerId?: { version?: string };
    forceOurs: boolean;
    forceTheirs: boolean;
    revert: boolean;
    loadStash: boolean;
  };
};

const observations: CheckoutObservation[] = [
  'unmerged',
  'resolveTarget',
  'hasVersion',
  'currentVersion',
  'mergePending',
  'modified',
  'targetRemoved',
];
// The defining CheckoutMain module supplies the original transport primitive before adapter reloads.
// eslint-disable-next-line no-var
var stringify: typeof JSON.stringify | undefined;

export function registerRustCheckoutSelectionTransport(value: typeof JSON.stringify): void {
  stringify ||= value;
}

export function canTransportRustCheckout(): boolean {
  return Boolean(
    stringify &&
      Object.getOwnPropertyDescriptor(JSON, 'stringify')?.value === stringify &&
      !Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON') &&
      !Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON')
  );
}

function observationValue(stage: CheckoutObservation, value: any): boolean {
  if (stage === 'resolveTarget') return typeof value === 'string';
  if (stage === 'unmerged' || stage === 'hasVersion' || stage === 'mergePending') return typeof value === 'boolean';
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some((key) => !('value' in Object.getOwnPropertyDescriptor(fields, key)!.value)))
    return false;
  if (stage === 'currentVersion')
    return typeof value.hasBitmap === 'boolean' && (value.value === undefined || typeof value.value === 'string');
  if (stage === 'modified') return typeof value.modified === 'boolean' && typeof value.isRemoved === 'boolean';
  return typeof value.removed === 'boolean' && typeof value.hasBitmap === 'boolean';
}

function metadata(value: unknown, seen = new Set<object>(), depth = 0): boolean {
  if (value === undefined || value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth > 64 || seen.has(value)) return false;
  const array = Array.isArray(value);
  if (
    array
      ? Object.getPrototypeOf(value) !== Array.prototype
      : ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return false;
  const fields = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(fields);
  if (keys.length > 4097 || (array && (value.length > 4096 || keys.length !== value.length + 1))) return false;
  seen.add(value);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(fields, key)!.value as PropertyDescriptor;
    if (array && key === 'length') continue;
    if (
      typeof key !== 'string' ||
      !('value' in descriptor) ||
      !descriptor.enumerable ||
      (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length || descriptor.value === undefined)) ||
      !metadata(descriptor.value, seen, depth + 1)
    )
      return false;
  }
  seen.delete(value);
  return true;
}

function selectionState(value: any): value is SelectionState {
  if (!value || !/^[a-f0-9]{40}$/.test(value.token) || !Number.isSafeInteger(value.revision) || value.revision < 0)
    return false;
  const directive = value.directive;
  if (!directive || typeof directive !== 'object') return false;
  if (directive.kind === 'observe')
    return (
      observations.includes(directive.observation) &&
      (directive.version === undefined || typeof directive.version === 'string')
    );
  if (directive.kind === 'failure')
    return (
      typeof directive.message === 'string' &&
      typeof directive.legitimate === 'boolean' &&
      (directive.shouldBeRemoved === undefined || directive.shouldBeRemoved === true)
    );
  return directive.kind === 'target' && typeof directive.version === 'string' && typeof directive.merge === 'boolean';
}

/** The shared engine serializes physical frames, never the public callbacks between them. */
export async function requestRustCheckout<T>(
  input: object,
  validate: (value: any) => value is T
): Promise<T | undefined> {
  if (!isRustWorkspaceEngine()) return undefined;
  if (!canTransportRustCheckout()) {
    await retireRustWorkspaceEngine();
    return undefined;
  }
  if (!metadata(input)) return undefined;
  const bytes = Buffer.from(JSON.stringify(input));
  if (!bytes.length || bytes.length > 4 * 1024 * 1024) return undefined;
  return withWorkspaceSession(async (session) => {
    let result: T | undefined;
    await session.request(
      (id) => {
        const header = Buffer.alloc(12);
        header.write('BMT1');
        header.writeUInt32BE(id, 4);
        header.writeUInt32BE(bytes.length, 8);
        return Buffer.concat([header, bytes]);
      },
      1,
      (response) => {
        if (response.failed) return response.completed === 0 && response.data === undefined;
        if (response.completed !== 1 || !validate(response.data)) return false;
        result = response.data;
        return true;
      },
      4 * 1024 * 1024
    );
    if (!result) await session.dispose();
    return result;
  });
}

function requestSelection(input: object): Promise<SelectionState | undefined> {
  return requestRustCheckout(input, selectionState);
}

/** A lost receipt resumes the canonical suffix using already observed callback results. */
export async function selectRustCheckout(
  input: CheckoutSelectionInput,
  observe: (stage: CheckoutObservation, version?: string) => Promise<unknown>,
  eligible: () => boolean
): Promise<{ began: boolean; acknowledged: Set<CheckoutObservation>; selection?: CheckoutSelection }> {
  const acknowledged = new Set<CheckoutObservation>();
  if (process.env.BIT_RUST_CLIENT_VCS !== 'on' || !eligible() || !canTransportRustCheckout())
    return { began: false, acknowledged };
  let state = await requestSelection({ kind: 'checkoutSelectBegin', ...input });
  if (!state) return { began: false, acknowledged };
  if (!eligible()) {
    await retireRustWorkspaceEngine();
    return { began: false, acknowledged };
  }
  if (
    state.revision !== 0 ||
    (state.directive.kind !== 'failure' &&
      (state.directive.kind !== 'observe' || state.directive.observation !== 'unmerged'))
  ) {
    await retireRustWorkspaceEngine();
    return { began: false, acknowledged };
  }
  const seen = new Set<CheckoutObservation>();
  while (state.directive.kind === 'observe') {
    const { observation, version } = state.directive;
    if (seen.has(observation)) {
      await retireRustWorkspaceEngine();
      return { began: true, acknowledged };
    }
    seen.add(observation);
    const value = await observe(observation, version);
    if (!eligible() || !observationValue(observation, value)) {
      await retireRustWorkspaceEngine();
      return { began: true, acknowledged };
    }
    const previous = state;
    state = await requestSelection({
      kind: 'checkoutSelectReceipt',
      token: previous.token,
      revision: previous.revision,
      observation,
      value,
    });
    if (!state || state.token !== previous.token || state.revision !== previous.revision + 1) {
      await retireRustWorkspaceEngine();
      return { began: true, acknowledged };
    }
    if (!eligible()) {
      await retireRustWorkspaceEngine();
      return { began: true, acknowledged };
    }
    acknowledged.add(observation);
  }
  if (
    state.directive.kind === 'target' &&
    (!acknowledged.has('resolveTarget') || !acknowledged.has('currentVersion') || !acknowledged.has('targetRemoved'))
  ) {
    await retireRustWorkspaceEngine();
    return { began: true, acknowledged };
  }
  return { began: true, acknowledged, selection: state.directive };
}
