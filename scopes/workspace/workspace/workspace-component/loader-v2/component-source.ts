import type { ComponentID } from '@teambit/component-id';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';

/**
 * Raw component data before enrichment.
 * This is what a ComponentSource returns - the basic data needed
 * to construct a Component.
 */
export interface RawComponentData {
  /** The component ID (may differ from requested if out-of-sync) */
  id: ComponentID;

  /** Legacy ConsumerComponent (maintained for compatibility) */
  consumerComponent: ConsumerComponent;

  /** Extensions configured for this component */
  extensions: ExtensionDataList;

  /** Errors encountered during loading */
  errors?: Error[];

  /** Whether this component exists only in workspace (not tagged/exported) */
  isNew: boolean;

  /** The source that provided this data */
  source: 'workspace' | 'scope';
}

/**
 * ComponentSource is the abstraction for loading raw component data.
 *
 * Both workspace and scope implement this interface, allowing the loader
 * to treat them uniformly while each handles its own storage mechanism.
 */
export interface ComponentSource {
  /** Name of this source for logging */
  readonly name: string;

  /**
   * Priority for source selection (lower = higher priority).
   * When a component exists in multiple sources, the one with
   * lower priority number is preferred.
   */
  readonly priority: number;

  /**
   * Check if this source can provide a component.
   * Returns true if the component exists in this source.
   */
  has(id: ComponentID): Promise<boolean>;

  /**
   * Check multiple components at once (for performance).
   * Returns a map of ID string -> boolean.
   */
  hasMany(ids: ComponentID[]): Promise<Map<string, boolean>>;

  /**
   * Load raw component data for a single component.
   * Throws if the component doesn't exist.
   */
  loadRaw(id: ComponentID): Promise<RawComponentData>;

  /**
   * Load raw component data for multiple components.
   * Returns a map of ID string -> RawComponentData.
   * Missing components are not included in the result.
   */
  loadRawMany(ids: ComponentID[]): Promise<Map<string, RawComponentData>>;

  /**
   * Get the extensions for a component without fully loading it.
   * Used during plan building to discover dependencies.
   */
  getExtensions(id: ComponentID): Promise<ExtensionDataList | null>;

  /**
   * Get extensions for multiple components at once.
   */
  getExtensionsMany(ids: ComponentID[]): Promise<Map<string, ExtensionDataList>>;
}

/**
 * Result of loading from multiple sources
 */
export interface MultiSourceLoadResult {
  /** Successfully loaded components */
  loaded: Map<string, RawComponentData>;

  /** Components that failed to load */
  failed: Map<string, Error>;

  /** Components that weren't found in any source */
  notFound: ComponentID[];
}

/**
 * Coordinates loading from multiple ComponentSources.
 * Tries sources in priority order until the component is found.
 */
export class MultiSourceLoader {
  constructor(private sources: ComponentSource[]) {
    // Sort by priority (lower number = higher priority)
    this.sources.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Load a component from the first source that has it.
   */
  async load(id: ComponentID): Promise<RawComponentData | null> {
    for (const source of this.sources) {
      const has = await source.has(id);
      if (has) {
        return source.loadRaw(id);
      }
    }
    return null;
  }

  /**
   * Load multiple components, trying each source for each component.
   */
  async loadMany(ids: ComponentID[]): Promise<MultiSourceLoadResult> {
    const result: MultiSourceLoadResult = {
      loaded: new Map(),
      failed: new Map(),
      notFound: [],
    };

    // Track which IDs still need to be loaded
    let remaining = [...ids];

    for (const source of this.sources) {
      if (remaining.length === 0) break;

      // Check which remaining IDs this source has
      const hasMap = await source.hasMany(remaining);
      const idsInSource = remaining.filter((id) => hasMap.get(id.toString()) === true);

      if (idsInSource.length > 0) {
        try {
          const loaded = await source.loadRawMany(idsInSource);
          for (const [idStr, data] of loaded) {
            result.loaded.set(idStr, data);
          }
        } catch {
          // If batch load fails, try individually
          for (const id of idsInSource) {
            try {
              const data = await source.loadRaw(id);
              result.loaded.set(id.toString(), data);
            } catch (err: any) {
              result.failed.set(id.toString(), err);
            }
          }
        }

        // Remove loaded/failed IDs from remaining
        const loadedOrFailed = new Set([...result.loaded.keys(), ...result.failed.keys()]);
        remaining = remaining.filter((id) => !loadedOrFailed.has(id.toString()));
      }
    }

    // Any remaining IDs weren't found in any source
    result.notFound = remaining;

    return result;
  }

  /**
   * Get sources sorted by priority
   */
  getSources(): ComponentSource[] {
    return [...this.sources];
  }
}
