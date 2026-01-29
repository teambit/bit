import { type Control } from './composition-live-controls';
import { LiveControlsRegistry } from './live-controls-registry';

export type ControlSource = 'common' | 'base' | 'compare';

export type ControlWithSource = Control & {
  source: ControlSource;
};

/**
 * Model for comparing live controls between two channels (base and compare).
 * Encapsulates all diff-specific logic: computing control sources, merging values,
 * and routing broadcasts to the correct channel(s).
 */
export class DiffControlsModel {
  private registry: LiveControlsRegistry;
  private _baseChannel: string;
  private _compareChannel: string;

  constructor(baseChannel?: string, compareChannel?: string) {
    this.registry = LiveControlsRegistry.getInstance();
    this._baseChannel = this.registry.normalizeChannel(baseChannel);
    this._compareChannel = this.registry.normalizeChannel(compareChannel);
  }

  get baseChannel(): string {
    return this._baseChannel;
  }

  get compareChannel(): string {
    return this._compareChannel;
  }

  /**
   * Whether base and compare resolve to the same channel.
   * When true, all controls are labeled 'common'.
   */
  get isSameChannel(): boolean {
    return this._baseChannel === this._compareChannel;
  }

  /**
   * Whether either channel has reported ready state.
   * Also checks 'default' channel for backwards compatibility with older versions.
   */
  get isReady(): boolean {
    const baseState = this.registry.getState(this._baseChannel);
    const compareState = this.registry.getState(this._compareChannel);
    const defaultState = this.registry.getState('default');
    return Boolean(baseState?.ready || compareState?.ready || defaultState?.ready);
  }

  /**
   * Whether there are any subscribers on the relevant channels.
   * Also checks 'default' channel for backwards compatibility.
   */
  get hasSubscribers(): boolean {
    return (
      this.registry.getSubscribers(this._baseChannel).length > 0 ||
      this.registry.getSubscribers(this._compareChannel).length > 0 ||
      this.registry.getSubscribers('default').length > 0
    );
  }

  /**
   * Get value for a specific control based on its source.
   * This ensures each control shows its channel-appropriate value.
   */
  getValueForControl(controlId: string, source: ControlSource): any {
    const baseState = this.registry.getState(this._baseChannel);
    const compareState = this.registry.getState(this._compareChannel);
    const defaultState = this.registry.getState('default');

    if (source === 'base') {
      return baseState?.values?.[controlId] ?? defaultState?.values?.[controlId];
    }
    if (source === 'compare') {
      return compareState?.values?.[controlId] ?? defaultState?.values?.[controlId];
    }
    // For common, prefer base value, then compare, then default
    return baseState?.values?.[controlId] ?? compareState?.values?.[controlId] ?? defaultState?.values?.[controlId];
  }

  /**
   * Merged values from both channels (for backwards compatibility).
   * Use getValueForControl() for source-specific values.
   */
  get values(): Record<string, any> {
    const baseState = this.registry.getState(this._baseChannel);
    const compareState = this.registry.getState(this._compareChannel);
    const defaultState = this.registry.getState('default');
    return {
      ...defaultState?.values,
      ...compareState?.values,
      ...baseState?.values,
    };
  }

  /**
   * Controls with source labels indicating which version they apply to.
   * - 'common': Control exists in both with equivalent definitions
   * - 'base': Control only exists in base, or has different definition
   * - 'compare': Control only exists in compare, or has different definition
   *
   * For backwards compatibility, if data only exists on 'default' channel,
   * all controls are treated as 'common'.
   */
  get controls(): ControlWithSource[] {
    const baseState = this.registry.getState(this._baseChannel);
    const compareState = this.isSameChannel ? baseState : this.registry.getState(this._compareChannel);
    const defaultState = this.registry.getState('default');

    // Get defs, falling back to 'default' channel for backwards compatibility
    const baseDefs = baseState?.defs?.length ? baseState.defs : defaultState?.defs || [];
    const compareDefs = compareState?.defs?.length ? compareState.defs : defaultState?.defs || [];

    // If using same source for both (same channel or both falling back to default)
    const baseSource = baseState?.defs?.length ? 'specific' : 'default';
    const compareSource = compareState?.defs?.length ? 'specific' : 'default';
    const usingSameSource = this.isSameChannel || (baseSource === 'default' && compareSource === 'default');

    if (usingSameSource) {
      return baseDefs.map((def) => ({ ...def, source: 'common' as const }));
    }

    return this.computeDiff(baseDefs, compareDefs);
  }

  /**
   * Update a control value and broadcast to the appropriate channel(s).
   */
  updateControl(controlId: string, value: any, source: ControlSource): void {
    if (source === 'common') {
      this.registry.broadcastUpdate(this._baseChannel, controlId, value);
      if (!this.isSameChannel) {
        this.registry.broadcastUpdate(this._compareChannel, controlId, value);
      }
    } else if (source === 'base') {
      this.registry.broadcastUpdate(this._baseChannel, controlId, value);
    } else if (source === 'compare') {
      this.registry.broadcastUpdate(this._compareChannel, controlId, value);
    }
  }

  /**
   * Reset both channels' state.
   */
  reset(): void {
    this.registry.resetChannel(this._baseChannel);
    if (!this.isSameChannel) {
      this.registry.resetChannel(this._compareChannel);
    }
  }

  private computeDiff(baseDefs: Control[], compareDefs: Control[]): ControlWithSource[] {
    const baseMap = new Map<string, Control>();
    baseDefs.forEach((def) => baseMap.set(def.id, def));

    const compareMap = new Map<string, Control>();
    compareDefs.forEach((def) => compareMap.set(def.id, def));

    const result: ControlWithSource[] = [];
    const processed = new Set<string>();

    // Process base controls
    baseMap.forEach((baseDef, id) => {
      const compareDef = compareMap.get(id);
      processed.add(id);

      if (!compareDef) {
        // Only in base
        result.push({ ...baseDef, source: 'base' });
      } else if (this.areControlsEquivalent(baseDef, compareDef)) {
        // Equivalent controls - merge into common, prefer label from either
        const def = baseDef.label ? baseDef : { ...baseDef, label: compareDef.label };
        result.push({ ...def, source: 'common' });
      } else {
        // Different control definitions - show both separately
        result.push({ ...baseDef, source: 'base' });
        result.push({ ...compareDef, source: 'compare' });
      }
    });

    // Process compare-only controls
    compareMap.forEach((compareDef, id) => {
      if (!processed.has(id)) {
        result.push({ ...compareDef, source: 'compare' });
      }
    });

    return result;
  }

  /**
   * Check if two controls are equivalent (can be shown as a single "common" control).
   * Compares input type, default value, and type-specific metadata.
   * Label is intentionally excluded - it's just display text.
   */
  private areControlsEquivalent(a: Control, b: Control): boolean {
    // Compare input type
    if (this.getInputType(a) !== this.getInputType(b)) {
      return false;
    }

    // Compare default values
    if (!this.areValuesEqual(a.defaultValue, b.defaultValue)) {
      return false;
    }

    // Compare type-specific metadata
    const input = this.getInputType(a);

    if (input === 'select' || input === 'multiselect') {
      if (!this.areOptionsEqual((a as any).options, (b as any).options)) {
        return false;
      }
      if ((a as any).inline !== (b as any).inline) {
        return false;
      }
    }

    if (input === 'range') {
      if ((a as any).min !== (b as any).min) return false;
      if ((a as any).max !== (b as any).max) return false;
      if ((a as any).step !== (b as any).step) return false;
    }

    return true;
  }

  private getInputType(def: Control): string {
    if (def.input) return def.input;
    if (typeof def.type === 'string') return def.type;
    return 'text';
  }

  private areValuesEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a === undefined || b === undefined) return a === b;
    if (a === null || b === null) return a === b;

    // Handle arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, i) => this.areValuesEqual(val, b[i]));
    }

    // Handle objects
    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every((key) => this.areValuesEqual(a[key], b[key]));
    }

    return false;
  }

  private areOptionsEqual(a: any[] | undefined, b: any[] | undefined): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;

    return a.every((optA, i) => {
      const optB = b[i];
      // Options can be strings or { label, value } objects
      if (typeof optA === 'string' && typeof optB === 'string') {
        return optA === optB;
      }
      if (typeof optA === 'object' && typeof optB === 'object') {
        return optA.label === optB.label && optA.value === optB.value;
      }
      return false;
    });
  }
}
