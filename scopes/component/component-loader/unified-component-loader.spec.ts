import { expect } from 'chai';
import type { Component } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import type { Logger } from '@teambit/logger';
import { ComponentCache } from './component-cache';
import { ComponentNotFound } from './component-not-found';
import { LoadEventEmitter, type LoadEvent } from './load-events';
import type { LoaderHost } from './loader-host';
import type { Phase } from './phase';
import { UnifiedComponentLoader } from './unified-component-loader';

function id(str: string): ComponentID {
  return { toString: () => str } as unknown as ComponentID;
}

function comp(label: string, phase: Phase = 'aspects'): Component {
  return { __label: label, loadedPhase: phase, id: id(label) } as unknown as Component;
}

const NULL_LOGGER: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  trace: () => undefined,
} as unknown as Logger;

class FakeHost implements LoaderHost {
  bitmapIds: ComponentID[] = [];
  bitmapH = 'bm-1';
  workspaceConfigH = 'wc-1';
  aspectStateH = 'as-1';
  fileSigs = new Map<string, string>();
  componentConfigs = new Map<string, string>();
  loadCalls: { id: string; phase: Phase }[] = [];
  loadHandler: (id: ComponentID, phase: Phase) => Component | undefined = (_, phase) => comp(_.toString(), phase);

  listBitmapIds() {
    return this.bitmapIds;
  }
  bitmapHash() {
    return this.bitmapH;
  }
  workspaceConfigHash() {
    return this.workspaceConfigH;
  }
  aspectStateHash() {
    return this.aspectStateH;
  }
  fileSignature(i: ComponentID) {
    return this.fileSigs.get(i.toString()) ?? `fs-${i.toString()}`;
  }
  componentConfigHash(i: ComponentID) {
    return this.componentConfigs.get(i.toString()) ?? `cc-${i.toString()}`;
  }
  async loadAtPhase(i: ComponentID, phase: Phase) {
    this.loadCalls.push({ id: i.toString(), phase });
    return this.loadHandler(i, phase);
  }
}

function newLoader(host: FakeHost = new FakeHost()): {
  loader: UnifiedComponentLoader;
  host: FakeHost;
  events: LoadEvent[];
} {
  const events: LoadEvent[] = [];
  const emitter = new LoadEventEmitter();
  emitter.on((e) => events.push(e));
  const loader = new UnifiedComponentLoader(host, new ComponentCache(100), emitter, NULL_LOGGER);
  return { loader, host, events };
}

describe('UnifiedComponentLoader', () => {
  describe('get', () => {
    it('loads a component at the requested phase via the host', async () => {
      const { loader, host } = newLoader();
      const result = await loader.get(id('a'), { phase: 'files' });
      expect(result).to.have.property('__label', 'a');
      expect(host.loadCalls).to.deep.equal([{ id: 'a', phase: 'files' }]);
    });

    it('caches the load — second get returns the cached component', async () => {
      const { loader, host } = newLoader();
      await loader.get(id('a'), { phase: 'dependencies' });
      await loader.get(id('a'), { phase: 'dependencies' });
      expect(host.loadCalls).to.deep.equal([{ id: 'a', phase: 'dependencies' }]); // only one host call
    });

    it('throws ComponentNotFound when the host returns undefined', async () => {
      const host = new FakeHost();
      host.loadHandler = () => undefined;
      const { loader } = newLoader(host);
      try {
        await loader.get(id('missing'));
        expect.fail('expected ComponentNotFound');
      } catch (err: any) {
        expect(err).to.be.instanceOf(ComponentNotFound);
        expect(err.missingIds.map((x: ComponentID) => x.toString())).to.deep.equal(['missing']);
      }
    });

    it('busts the cache when the bitmap hash changes', async () => {
      const { loader, host } = newLoader();
      await loader.get(id('a'), { phase: 'files' });
      host.bitmapH = 'bm-2'; // simulate a bitmap change
      await loader.get(id('a'), { phase: 'files' });
      expect(host.loadCalls.length).to.equal(2);
    });

    it('busts the cache when the file signature changes', async () => {
      const { loader, host } = newLoader();
      await loader.get(id('a'), { phase: 'files' });
      host.fileSigs.set('a', 'fs-NEW');
      await loader.get(id('a'), { phase: 'files' });
      expect(host.loadCalls.length).to.equal(2);
    });
  });

  describe('getMany', () => {
    it('loads a batch of components at the requested phase', async () => {
      const { loader, host } = newLoader();
      const result = await loader.getMany([id('a'), id('b'), id('c')], { phase: 'dependencies' });
      expect(result.components).to.have.length(3);
      expect(result.missing).to.have.length(0);
      expect(host.loadCalls).to.have.length(3);
      expect(host.loadCalls.every((c) => c.phase === 'dependencies')).to.equal(true);
    });

    it('throwOnMissing=false collects missing IDs instead of throwing', async () => {
      const host = new FakeHost();
      host.loadHandler = (i, phase) => (i.toString() === 'gone' ? undefined : comp(i.toString(), phase));
      const { loader } = newLoader(host);
      const result = await loader.getMany(
        [id('a'), id('gone'), id('b')],
        { phase: 'identity' },
        { throwOnMissing: false }
      );
      expect(result.components).to.have.length(2);
      expect(result.missing.map((x) => x.toString())).to.deep.equal(['gone']);
    });

    it('throws ComponentNotFound when any ID is missing under throwOnMissing=true (default)', async () => {
      const host = new FakeHost();
      host.loadHandler = (i, phase) => (i.toString() === 'gone' ? undefined : comp(i.toString(), phase));
      const { loader } = newLoader(host);
      try {
        await loader.getMany([id('a'), id('gone')], { phase: 'identity' });
        expect.fail('expected ComponentNotFound');
      } catch (err: any) {
        expect(err).to.be.instanceOf(ComponentNotFound);
      }
    });
  });

  describe('listIds', () => {
    it('returns IDs from the host without invoking loadAtPhase', () => {
      const host = new FakeHost();
      host.bitmapIds = [id('a'), id('b'), id('c')];
      const { loader } = newLoader(host);
      const ids = loader.listIds();
      expect(ids.map((i) => i.toString())).to.deep.equal(['a', 'b', 'c']);
      expect(host.loadCalls).to.have.length(0);
    });
  });

  describe('list', () => {
    it('combines listIds and getMany; missing IDs do not throw', async () => {
      const host = new FakeHost();
      host.bitmapIds = [id('a'), id('b')];
      host.loadHandler = (i, phase) => (i.toString() === 'b' ? undefined : comp(i.toString(), phase));
      const { loader } = newLoader(host);
      const result = await loader.list({ phase: 'files' });
      expect(result.components).to.have.length(1);
      expect(result.missing.map((x) => x.toString())).to.deep.equal(['b']);
    });
  });

  describe('invalidate', () => {
    it('forwards to the cache and returns the count', async () => {
      const { loader } = newLoader();
      await loader.get(id('a'), { phase: 'files' });
      await loader.get(id('b'), { phase: 'files' });
      expect(loader.invalidate(id('a'))).to.equal(1);
      expect(loader.cache.size()).to.equal(1);
    });

    it('invalidate("all") clears every entry', async () => {
      const { loader } = newLoader();
      await loader.get(id('a'), { phase: 'files' });
      await loader.get(id('b'), { phase: 'extensions' });
      expect(loader.invalidate('all')).to.equal(2);
      expect(loader.cache.size()).to.equal(0);
    });
  });

  describe('ensurePhase', () => {
    it('returns the same component when already at or above the requested phase', async () => {
      const { loader } = newLoader();
      const c = comp('a', 'extensions');
      const out = await loader.ensurePhase(c, 'dependencies');
      expect(out).to.equal(c);
    });

    it('upgrades when the component is below the requested phase', async () => {
      const host = new FakeHost();
      host.loadHandler = (i, phase) => comp(i.toString(), phase);
      const { loader } = newLoader(host);
      const c = comp('a', 'identity');
      const out = await loader.ensurePhase(c, 'extensions');
      expect(out).to.have.property('loadedPhase', 'extensions');
      expect(host.loadCalls).to.deep.equal([{ id: 'a', phase: 'extensions' }]);
    });
  });

  describe('events', () => {
    it('emits load:start, load:phase:start, load:component, load:phase:end, load:end in order on a fresh load', async () => {
      const { loader, events } = newLoader();
      await loader.get(id('a'), { phase: 'files' });
      const kinds = events.map((e) => e.kind);
      expect(kinds).to.deep.equal(['load:start', 'load:phase:start', 'load:component', 'load:phase:end', 'load:end']);
      expect((events.find((e) => e.kind === 'load:component') as any).cached).to.equal(false);
    });

    it('a cached load skips phase events and emits cached=true on load:component', async () => {
      const { loader, events } = newLoader();
      await loader.get(id('a'), { phase: 'files' });
      events.length = 0; // reset
      await loader.get(id('a'), { phase: 'files' });
      const kinds = events.map((e) => e.kind);
      expect(kinds).to.deep.equal(['load:start', 'load:component', 'load:end']);
      expect((events.find((e) => e.kind === 'load:component') as any).cached).to.equal(true);
    });

    it('all events of one call share a callId distinct from a separate call', async () => {
      const { loader, events } = newLoader();
      await loader.get(id('a'));
      const firstCallId = events[0]!.callId;
      events.length = 0;
      await loader.get(id('b'));
      const secondCallId = events[0]!.callId;
      expect(firstCallId).to.not.equal(secondCallId);
      expect(events.every((e) => e.callId === secondCallId)).to.equal(true);
    });
  });
});
