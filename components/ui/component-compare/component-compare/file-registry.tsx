import React, { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

export type FileInfo = { name: string; status?: string };

type Listener = () => void;

function filesSignature(files: FileInfo[]) {
  return files.map((f) => `${f.name}:${f.status ?? ''}`).join('|');
}

class ComponentRegistry {
  private files = new Map<string, FileInfo[]>();

  private aspectFiles = new Map<string, FileInfo[]>();

  /** changed API exports per component — populates the sidebar tree in API view mode */
  private apiEntries = new Map<string, FileInfo[]>();

  private compositions = new Map<string, boolean>();

  private listeners = new Set<Listener>();

  register(componentId: string, files: FileInfo[]) {
    const existing = this.files.get(componentId);
    if (existing && filesSignature(existing) === filesSignature(files)) return;
    this.files.set(componentId, files);
    this.notify();
  }

  getFiles(componentId: string) {
    return this.files.get(componentId);
  }

  registerAspects(componentId: string, files: FileInfo[]) {
    const existing = this.aspectFiles.get(componentId);
    if (existing && filesSignature(existing) === filesSignature(files)) return;
    this.aspectFiles.set(componentId, files);
    this.notify();
  }

  getAspectFiles(componentId: string) {
    return this.aspectFiles.get(componentId);
  }

  registerApiEntries(componentId: string, entries: FileInfo[]) {
    const existing = this.apiEntries.get(componentId);
    if (existing && filesSignature(existing) === filesSignature(entries)) return;
    this.apiEntries.set(componentId, entries);
    this.notify();
  }

  getApiEntries(componentId: string) {
    return this.apiEntries.get(componentId);
  }

  registerCompositions(componentId: string, hasCompositions: boolean) {
    if (this.compositions.get(componentId) === hasCompositions) return;
    this.compositions.set(componentId, hasCompositions);
    this.notify();
  }

  getHasCompositions(componentId: string) {
    return this.compositions.get(componentId);
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getVersion() {
    return this.version;
  }

  private version = 0;

  /** the version value subscribers last observed — guards against flushing a no-op change */
  private flushedVersion = 0;

  private pendingNotify = false;

  /**
   * coalesce a burst of registrations into a single asynchronous flush, then notify subscribers
   * exactly once. crucial properties that keep this provably convergent and free of the
   * "Maximum update depth exceeded" loop:
   *  - `version` only advances when a `register*` method detected a *real* content change (each
   *    one bails on an equal signature), so a re-render that registers nothing cannot bump it.
   *  - the flush is deferred to a microtask and guarded by `pendingNotify`, so N synchronous
   *    registrations collapse into one subscriber notification (one re-render), never N.
   *  - the flush bails when `version === flushedVersion`, so a scheduled flush whose change was
   *    already observed (e.g. via `useSyncExternalStore`'s snapshot) does no extra work.
   *  - listeners are snapshotted before iterating, so a subscriber that (un)subscribes while being
   *    notified cannot mutate the set mid-iteration.
   */
  private notify() {
    this.version += 1;
    if (this.pendingNotify) return;
    this.pendingNotify = true;
    queueMicrotask(() => {
      this.pendingNotify = false;
      if (this.version === this.flushedVersion) return;
      this.flushedVersion = this.version;
      [...this.listeners].forEach((l) => l());
    });
  }
}

const FileRegistryContext = createContext<ComponentRegistry | undefined>(undefined);

export function FileRegistryProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<ComponentRegistry | undefined>(undefined);
  if (!storeRef.current) storeRef.current = new ComponentRegistry();
  return <FileRegistryContext.Provider value={storeRef.current}>{children}</FileRegistryContext.Provider>;
}

export function useFileRegistry() {
  const store = useContext(FileRegistryContext);

  // Subscribe via `useSyncExternalStore` rather than a manual `useState` + `forceRender`. The
  // snapshot is the store's monotonic `version`, which only advances on a real registration change.
  // React re-renders this consumer solely when that number changes and bails when it is unchanged —
  // so a re-render that triggers no genuine registration produces no new snapshot and cannot loop.
  const subscribe = useCallback((onStoreChange: () => void) => store?.subscribe(onStoreChange) ?? (() => {}), [store]);
  const getSnapshot = useCallback(() => store?.getVersion() ?? 0, [store]);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return store;
}

// `undefined` = not loaded yet (register nothing); `[]` = loaded with no changed files (register the
// empty list, so a component that becomes unchanged under a new base clears its stale sidebar entry
// instead of keeping the previous non-empty one). the signature encodes definedness so an
// `undefined → []` transition still re-runs the effect — otherwise both collapse to '' and it wouldn't.
// `register*()` bails on an equal signature, so a repeated empty registration never notifies.
function registerSignature(files: FileInfo[] | undefined): string | undefined {
  return files === undefined ? undefined : filesSignature(files);
}

export function useFileRegistryRegister(componentId: string | undefined, files: FileInfo[] | undefined) {
  const store = useContext(FileRegistryContext);
  const signature = registerSignature(files);
  useEffect(() => {
    if (store && componentId && files) {
      store.register(componentId, files);
    }
  }, [store, componentId, signature]);
}

export function useAspectRegistryRegister(componentId: string | undefined, files: FileInfo[] | undefined) {
  const store = useContext(FileRegistryContext);
  const signature = registerSignature(files);
  useEffect(() => {
    if (store && componentId && files) {
      store.registerAspects(componentId, files);
    }
  }, [store, componentId, signature]);
}

export function useCompositionsRegistryRegister(componentId: string | undefined, hasCompositions: boolean | undefined) {
  const store = useContext(FileRegistryContext);
  useEffect(() => {
    if (store && componentId && hasCompositions !== undefined) {
      store.registerCompositions(componentId, hasCompositions);
    }
  }, [store, componentId, hasCompositions]);
}
