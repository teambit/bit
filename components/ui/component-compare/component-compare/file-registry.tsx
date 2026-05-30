import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type FileInfo = { name: string; status?: string };

type Listener = () => void;

class ComponentRegistry {
  private files = new Map<string, FileInfo[]>();

  private aspectFiles = new Map<string, FileInfo[]>();

  private compositions = new Map<string, boolean>();

  private listeners = new Set<Listener>();

  register(componentId: string, files: FileInfo[]) {
    const existing = this.files.get(componentId);
    if (existing && existing.length === files.length) return;
    this.files.set(componentId, files);
    this.notify();
  }

  getFiles(componentId: string) {
    return this.files.get(componentId);
  }

  registerAspects(componentId: string, files: FileInfo[]) {
    const existing = this.aspectFiles.get(componentId);
    if (existing && existing.length === files.length) return;
    this.aspectFiles.set(componentId, files);
    this.notify();
  }

  getAspectFiles(componentId: string) {
    return this.aspectFiles.get(componentId);
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

  private pendingNotify = false;

  private notify() {
    this.version += 1;
    if (!this.pendingNotify) {
      this.pendingNotify = true;
      queueMicrotask(() => {
        this.pendingNotify = false;
        this.listeners.forEach((l) => l());
      });
    }
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
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!store) return undefined;
    return store.subscribe(() => forceRender((v) => v + 1));
  }, [store]);

  return store;
}

export function useFileRegistryRegister(componentId: string | undefined, files: FileInfo[] | undefined) {
  const store = useContext(FileRegistryContext);
  useEffect(() => {
    if (store && componentId && files && files.length > 0) {
      store.register(componentId, files);
    }
  }, [store, componentId, files?.length]);
}

export function useAspectRegistryRegister(componentId: string | undefined, files: FileInfo[] | undefined) {
  const store = useContext(FileRegistryContext);
  useEffect(() => {
    if (store && componentId && files && files.length > 0) {
      store.registerAspects(componentId, files);
    }
  }, [store, componentId, files?.length]);
}

export function useCompositionsRegistryRegister(componentId: string | undefined, hasCompositions: boolean | undefined) {
  const store = useContext(FileRegistryContext);
  useEffect(() => {
    if (store && componentId && hasCompositions !== undefined) {
      store.registerCompositions(componentId, hasCompositions);
    }
  }, [store, componentId, hasCompositions]);
}
