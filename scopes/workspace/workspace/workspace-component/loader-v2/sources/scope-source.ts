import type { ComponentID } from '@teambit/component-id';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import type { ComponentSource, RawComponentData } from '../component-source';
import type { ScopeMain } from '@teambit/scope';
import type { Component } from '@teambit/component';

/**
 * ScopeSource loads components from the scope storage (.bit directory).
 *
 * This is an adapter that bridges the V2 loader to the existing scope loading logic.
 * It delegates to scope.get() but returns data in the V2 format.
 */
export class ScopeSource implements ComponentSource {
  readonly name = 'scope';
  readonly priority = 2; // Lower priority (higher number) than workspace

  constructor(private scope: ScopeMain) {}

  /**
   * Check if a component exists in scope
   */
  async has(id: ComponentID): Promise<boolean> {
    try {
      const component = await this.scope.get(id, undefined, false);
      return !!component;
    } catch {
      return false;
    }
  }

  /**
   * Check multiple components at once
   */
  async hasMany(ids: ComponentID[]): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();

    // Check each component (scope.get is relatively fast as it's just object lookup)
    await Promise.all(
      ids.map(async (id) => {
        const exists = await this.has(id);
        result.set(id.toString(), exists);
      })
    );

    return result;
  }

  /**
   * Load raw component data for a single component from scope
   */
  async loadRaw(id: ComponentID): Promise<RawComponentData> {
    const component = await this.scope.get(id, undefined, false);

    if (!component) {
      throw new Error(`Component ${id.toString()} not found in scope`);
    }

    return this.componentToRawData(component);
  }

  /**
   * Load raw component data for multiple components
   */
  async loadRawMany(ids: ComponentID[]): Promise<Map<string, RawComponentData>> {
    const result = new Map<string, RawComponentData>();

    // Load components in parallel
    const components = await Promise.all(
      ids.map(async (id) => {
        try {
          return await this.scope.get(id, undefined, false);
        } catch {
          return null;
        }
      })
    );

    // Convert to RawComponentData
    for (let i = 0; i < ids.length; i++) {
      const component = components[i];
      if (component) {
        const rawData = this.componentToRawData(component);
        result.set(ids[i].toString(), rawData);
      }
    }

    return result;
  }

  /**
   * Get extensions for a component without fully loading it
   */
  async getExtensions(id: ComponentID): Promise<ExtensionDataList | null> {
    try {
      const component = await this.scope.get(id, undefined, false);
      if (!component) return null;

      // For scope components, extensions are in the Version object accessed via component.head
      // The Version object is the actual model that stores extensions
      if (component.head && (component.head as any).extensions) {
        return (component.head as any).extensions;
      }

      // Fallback to consumer component extensions if available
      return component.state._consumer?.extensions || null;
    } catch {
      return null;
    }
  }

  /**
   * Get extensions for multiple components
   */
  async getExtensionsMany(ids: ComponentID[]): Promise<Map<string, ExtensionDataList>> {
    const result = new Map<string, ExtensionDataList>();

    await Promise.all(
      ids.map(async (id) => {
        const extensions = await this.getExtensions(id);
        if (extensions) {
          result.set(id.toString(), extensions);
        }
      })
    );

    return result;
  }

  /**
   * Convert a Component to RawComponentData
   */
  private componentToRawData(component: Component): RawComponentData {
    // For scope components, extensions are in the Version object (component.head)
    // The Version object is the source of truth for scope-stored components
    let extensions = component.state._consumer?.extensions;

    if (component.head && (component.head as any).extensions) {
      extensions = (component.head as any).extensions;
    }

    // Ensure extensions is always an ExtensionDataList, never a plain array
    const { ExtensionDataList } = require('@teambit/legacy.extension-data');
    const finalExtensions =
      extensions instanceof ExtensionDataList ? extensions : ExtensionDataList.fromArray(extensions || []);

    return {
      id: component.id,
      consumerComponent: component.state._consumer,
      extensions: finalExtensions,
      isNew: false, // Scope components are never "new"
      source: 'scope',
    };
  }
}

/**
 * Factory function for creating a ScopeSource
 */
export function createScopeSource(scope: ScopeMain): ScopeSource {
  return new ScopeSource(scope);
}
