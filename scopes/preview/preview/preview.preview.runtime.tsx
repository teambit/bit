import type { PubsubPreview } from '@teambit/pubsub';
import { PubsubAspect } from '@teambit/pubsub';
import type { SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import { ComponentID } from '@teambit/component-id';
// Using cross-fetch here instead of @pnpm/node-fetch
// which is crucial in this context as preview operates from the frontend where proxy and CA cert handling are not required
// Reverting to cross-fetch restores correct handling of relative URLs, ensuring that previews render correctly
import crossFetch from 'cross-fetch';
import { debounce, intersection, isObject } from 'lodash';

import { PreviewNotFound } from './exceptions';
import type { PreviewType } from './preview-type';
import { PreviewAspect, PreviewRuntime } from './preview.aspect';
import { ClickInsideAnIframeEvent } from './events';
import type { ModuleFile, PreviewModule } from './types/preview-module';
import { RenderingContext } from './rendering-context';
import { fetchComponentAspects } from './gql/fetch-component-aspects';
import { LRUCache } from 'lru-cache';
import { PREVIEW_MODULES } from './preview-modules';
import { loadScript, loadLink } from './html-utils';
import { SizeEvent } from './size-event';

// forward linkModules() for generate-link.ts
export { linkModules } from './preview-modules';

export type PreviewSlot = SlotRegistry<PreviewType>;

export type RenderingContextOptions = { aspectsFilter?: string[] };
export type RenderingContextProvider = (options: RenderingContextOptions) => { [key: string]: any };
export type RenderingContextSlot = SlotRegistry<RenderingContextProvider>;

export class PreviewPreview {
  constructor(
    /**
     * register to pubsub
     */
    private pubsub: PubsubPreview,

    /**
     * preview slot.
     */
    private previewSlot: PreviewSlot,

    private renderingContextSlot: RenderingContextSlot
  ) {
    this.registerClickPubSub();
  }

  private rerenderOnPreviewModulesUpdated = debounce(() => {
    if (!this.isReady()) return;
    void this.render().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[preview.preview] failed re-rendering after preview module update', err);
    });
  }, 30);

  private registerClickPubSub() {
    window.addEventListener('click', (e) => {
      const timestamp = Date.now();
      const clickEvent = Object.assign({}, e);
      this.pubsub.pub(PreviewAspect.id, new ClickInsideAnIframeEvent(timestamp, clickEvent));
    });
  }

  private isDev = false;
  private sizeObserver?: ResizeObserver;
  private sizePublishRaf?: number;
  private sizePublishDebounced?: ReturnType<typeof debounce>;

  private cleanupSizeObserver() {
    if (this.sizeObserver) {
      this.sizeObserver.disconnect();
      this.sizeObserver = undefined;
    }
    if (this.sizePublishRaf) {
      window.cancelAnimationFrame(this.sizePublishRaf);
      this.sizePublishRaf = undefined;
    }
    if (this.sizePublishDebounced) {
      this.sizePublishDebounced.cancel();
      this.sizePublishDebounced = undefined;
    }
  }

  /**
   * A pooled grid thumbnail (hash carries `thumbnail=true`, set by preview-canvas.ts). Thumbnail
   * realms render with `onlyOverview=true`, which drops included previews at render time - so
   * their link files stay deferred (never evaluated, see generate-link.ts) and readiness must not
   * wait for modules that will never load. Regular preview pages never carry the marker.
   */
  private isThumbnail() {
    return this.getParam(this.getQuery(), 'thumbnail') === 'true';
  }

  private isReady() {
    const { previewName } = this.getLocation();
    const name = previewName || this.getDefault();

    if (!PREVIEW_MODULES.has(name)) return false;
    const preview = this.getPreview(name);
    if (!preview) return false;
    const includedReady =
      this.isThumbnail() || (preview.include?.every((included) => PREVIEW_MODULES.has(included)) ?? true);
    if (!includedReady) return false;

    return true;
  }

  /**
   * A host that recycles preview iframes - a workspace grid reusing a small pool of them while
   * scrolling, rather than mounting one per card - re-points an iframe at another component by
   * changing its hash. Only the fragment changes, so the document is not reloaded and the realm
   * keeps everything it already parsed: re-rendering costs a render, not a bootstrap.
   */
  private listenToHashChanges(rootExt?: string) {
    if (typeof window === 'undefined' || this.hashListenerAttached) return;
    this.hashListenerAttached = true;
    window.addEventListener('hashchange', () => {
      void this.render(rootExt);
    });
  }

  private hashListenerAttached = false;

  private _setupPromise?: Promise<void>;
  setup = () => {
    if (this.isReady()) return Promise.resolve();

    this._setupPromise ??= new Promise((resolve) => {
      PREVIEW_MODULES.onSet.add(() => {
        if (this.isReady()) resolve();
      });
    });

    return this._setupPromise;
  };

  /**
   * render the preview.
   */
  private renderSeq = 0;

  render = async (rootExt?: string) => {
    // a pooled iframe can be re-pointed while a previous render is still awaiting modules;
    // without a sequence guard the older render can commit last and win over the newer hash
    const seq = ++this.renderSeq;
    // preview registration is asynchronous (link files initialize their modules through a dynamic
    // import), so rendering must wait for the active preview - and its includes - to have
    // registered. setup() resolves immediately once ready, so steady-state renders pay nothing.
    await this.setup();
    if (seq !== this.renderSeq) return undefined;
    // fit content always.
    window.document.body.style.width = 'auto';

    const { previewName, componentId, envId } = this.getLocation();
    const name = previewName || this.getDefault();
    if (rootExt) this.isDev = rootExt === 'teambit.workspace/workspace';

    const preview = this.getPreview(name);
    if (!preview || !componentId) {
      throw new PreviewNotFound(previewName);
    }

    this.listenToHashChanges(rootExt);

    // thumbnails discard includes below (they render with onlyOverview), so don't resolve the
    // included previews' modules at all - their link files are deferred and must stay that way
    const includesAll = this.isThumbnail()
      ? []
      : await Promise.all(
          (preview.include || []).map(async (inclPreviewName) => {
            const includedPreview = this.getPreview(inclPreviewName);
            if (!includedPreview) return undefined;

            const inclPreviewModule = await this.getPreviewModule(inclPreviewName, componentId);
            return includedPreview.selectPreviewModel?.(componentId.fullName, inclPreviewModule);
          })
        );

    const query = this.getQuery();
    const onlyOverview = this.getParam(query, 'onlyOverview');

    const includes =
      onlyOverview === 'true'
        ? []
        : includesAll
            .filter((module) => !!module)
            .map((module) => {
              if (!module.default || !isObject(module.default)) return module;
              // This aims to handle use cases where we have package.json with type:"module" in the root
              // in that case sometime we might get the props both under default and in the object root
              const keysWithoutDefault = Object.keys(module).filter((key) => key !== 'default');
              const defaultKeys = Object.keys(module.default);
              if (intersection(keysWithoutDefault, defaultKeys).length === defaultKeys.length) return module.default;
              return module;
            });

    // Aspect filtering is not needed in dev mode — all providers in the bundle are safe to use,
    // and the GQL call to fetch aspects blocks rendering of every preview iframe.
    const componentAspects = undefined;
    const previewModule = await this.getPreviewModule(name, componentId);
    if (seq !== this.renderSeq) return undefined;
    const render = preview.render(
      componentId,
      envId || '',
      previewModule,
      includes,
      this.getRenderingContext(componentAspects)
    );

    this.reportSize();
    this.setViewport();
    this.setFullScreen();
    return render;
  };

  setFullScreen() {
    const query = this.getQuery();
    const fullScreen = this.getParam(query, 'fullscreen');

    if (!fullScreen) return;

    const root = window.document.getElementById('root');

    if (root) {
      root.style.height = '100vh';
    }
  }

  setViewport() {
    const query = this.getQuery();
    const viewPort = this.getParam(query, 'viewport');
    const body = window.document.body;

    if (!viewPort) {
      body.style.width = '100%';
      body.style.maxWidth = '';
      return;
    }

    body.style.width = 'auto';
    body.style.maxWidth = `${viewPort}px`;
  }

  reportSize() {
    if (!window?.parent || !window?.document) return;
    this.cleanupSizeObserver();
    // In Preview, the <body> can stay viewport-sized while the actual content extends beyond it.
    // Avoid style mutations in ResizeObserver callbacks (which can create ResizeObserver loop errors).
    const measure = () => {
      const root = window.document.getElementById('root') ?? window.document.documentElement;
      const docEl = window.document.documentElement;
      const body = window.document.body;
      const rootRect = root.getBoundingClientRect();
      const height = Math.max(
        root.scrollHeight,
        docEl.scrollHeight,
        body?.scrollHeight || 0,
        Math.ceil(rootRect.height)
      );
      const width = Math.max(root.scrollWidth, docEl.scrollWidth, body?.scrollWidth || 0, Math.ceil(rootRect.width));
      return { width, height };
    };
    const publish = () => {
      const { width, height } = measure();
      this.pubsub.pub(PreviewAspect.id, new SizeEvent({ width, height }));
      // A pooled thumbnail host (preview-canvas.ts) creates its iframes with raw DOM and never
      // opens a penpal connection, so the pubsub event above cannot reach it. Send the size as a
      // plain postMessage too - the pool uses it as the "this card actually rendered" signal.
      if (this.isThumbnail() && window.parent && window.parent !== window) {
        window.parent.postMessage({ type: SizeEvent.TYPE, data: { width, height } }, '*');
      }
    };
    // publish right away so the parent gets the first real size as soon as possible
    publish();
    // publish dimension changes when the content size actually changes
    this.sizePublishDebounced = debounce(publish, 100);
    const schedulePublish = () => {
      if (this.sizePublishRaf) {
        window.cancelAnimationFrame(this.sizePublishRaf);
      }
      this.sizePublishRaf = window.requestAnimationFrame(() => {
        this.sizePublishRaf = undefined;
        this.sizePublishDebounced?.();
      });
    };
    this.sizeObserver = new ResizeObserver(schedulePublish);
    this.sizeObserver.observe(window.document.documentElement);
    const root = window.document.getElementById('root');
    if (root) this.sizeObserver.observe(root);
    if (window.document.body) this.sizeObserver.observe(window.document.body);
  }

  async getPreviewModule(previewName: string, id: ComponentID): Promise<PreviewModule> {
    const compShortId = id.fullName;

    let relevantModel = PREVIEW_MODULES.get(previewName);
    if (!relevantModel) {
      // an include can be requested before its link finished registering - wait once, then fail
      await this.setup();
      relevantModel = PREVIEW_MODULES.get(previewName);
    }
    if (!relevantModel) throw new Error(`[preview.preview] missing preview "${previewName}"`);
    if (relevantModel.componentMap[compShortId]) return relevantModel;

    const componentPreviews = await this.fetchComponentPreview(id, previewName);
    PREVIEW_MODULES.loadComponentPreviews(compShortId, componentPreviews);

    const component = componentPreviews[previewName];
    const metadata = componentPreviews[`${previewName}_metadata`];

    return {
      modulesMap: relevantModel.modulesMap,
      componentMap: {
        [id.fullName]: component,
      },
      componentMapMetadata: {
        [id.fullName]: metadata,
      },
    };
  }

  async fetchComponentPreview(id: ComponentID, name: string): Promise<Record<string, ModuleFile[]>> {
    let previewFile: string | undefined;
    const allFiles = await this.fetchComponentPreviewFiles(id, name);
    // It's a component bundled with the env
    if (allFiles === null) return {};

    await Promise.all(
      allFiles.map((file) => {
        // We want to run the preview file always last
        if (file.endsWith('-preview.js')) {
          previewFile = file;
          return undefined;
        }

        return this.addComponentFileElement(id, file);
      })
    );

    if (!previewFile) return {};
    return this.loadPreviewScript(id, name, previewFile);
  }

  private addComponentFileElement(id: ComponentID, previewBundleFileName: string) {
    if (previewBundleFileName.endsWith('.js')) {
      return this.addComponentFileScriptElement(id, previewBundleFileName);
    }

    // TODO - should we load assets other than .css / .js?
    // if (previewBundleFileName.endsWith('.css')) {
    this.addComponentFileLinkElement(id, previewBundleFileName).catch((err) => {
      throw new Error(
        `[preview.preview] failed loading asset "${previewBundleFileName}". Error - "${err?.toString()}"`
      );
    });

    // do NOT await non js assets, as they might never load (like images), and not critical for rendering.
    return undefined;
  }

  private async fetchComponentPreviewFiles(id: ComponentID, previewName: string): Promise<string[] | null> {
    const previewAssetsRoute = `~aspect/preview-assets`;
    const stringId = id.toString();
    const url = `/api/${stringId}/${previewAssetsRoute}`;

    const res = await crossFetch(url);
    if (res.status >= 400) {
      throw new PreviewNotFound(previewName);
    }
    const parsed = await res.json();
    // This is component bundled with the env, no reason to bring the files, as they will be the files of the env
    if (parsed.isBundledWithEnv) {
      return null;
    }
    if (!parsed.files || !parsed.files.length) {
      throw new PreviewNotFound(previewName);
    }
    return parsed.files;
  }

  private addComponentFileScriptElement(id: ComponentID, previewBundleFileName: string) {
    const previewRoute = `~aspect/component-preview`;
    const stringId = id.toString();
    const src = `/api/${stringId}/${previewRoute}/${previewBundleFileName}`;
    return loadScript({ src });
  }

  private addComponentFileLinkElement(id: ComponentID, previewBundleFileName: string) {
    const stringId = id.toString();
    const previewRoute = `~aspect/component-preview`;
    const href = `/api/${stringId}/${previewRoute}/${previewBundleFileName}`;
    return loadLink({ href });
  }

  private async loadPreviewScript(id: ComponentID, previewName: string, previewBundleFileName: string) {
    const previewRoute = `~aspect/component-preview`;
    const src = `/api/${id.toString()}/${previewRoute}/${previewBundleFileName}`;
    await loadScript({ src });

    // TODO - replace with jsonp
    const globalId = `${id.toStringWithoutVersion()}-preview`;
    const componentPreview = window[globalId];
    if (!componentPreview) throw new PreviewNotFound(previewName);

    return componentPreview as Record<string, ModuleFile[]>;
  }

  // Use LRU cache directly with TTL for component aspects
  private componentAspectsCache = new LRUCache<string, any>({
    max: 100,
    ttl: 12 * 60 * 60 * 1000, // 12 hours
  });

  private getComponentAspects = async (componentId: string) => {
    const cached = this.componentAspectsCache.get(componentId);
    if (cached) {
      return cached;
    }

    const result = await fetchComponentAspects(componentId);
    this.componentAspectsCache.set(componentId, result);
    return result;
  };

  /**
   * register a new preview.
   */
  registerPreview(preview: PreviewType) {
    this.previewSlot.register(preview);
    return this;
  }

  /**
   * get the preview rendering context.
   */
  getRenderingContext(aspectsFilter?: string[]) {
    return new RenderingContext(this.renderingContextSlot, { aspectsFilter });
  }

  /**
   * allows aspects to add rendering contexts.
   * render context is available through all preview definitions.
   */
  registerRenderContext(renderContext: RenderingContextProvider) {
    this.renderingContextSlot.register(renderContext);
    return this;
  }

  getDefault() {
    const previews = this.previewSlot.values();
    const defaultOne = previews.find((previewCandidate) => previewCandidate.default);

    return defaultOne?.name || previews[0].name;
  }

  private getPreview(previewName: string): undefined | PreviewType {
    const previews = this.previewSlot.values();
    const preview = previews.find((previewCandidate) => previewCandidate.name === previewName);

    return preview;
  }

  getParam(query: string, param: string) {
    const params = new URLSearchParams(query);
    return params.get(param);
  }

  getQuery() {
    const withoutHash = window.location.hash.substring(1);
    const [, after] = withoutHash.split('?');
    return after;
  }

  private getLocation() {
    const withoutHash = window.location.hash.substring(1);
    const [before, after] = withoutHash.split('?');

    return {
      previewName: this.getParam(after, 'preview'),
      envId: this.getParam(after, 'env'),
      componentId: ComponentID.tryFromString(before),
    };
  }

  static runtime = PreviewRuntime;

  static dependencies = [PubsubAspect];

  static slots = [Slot.withType<PreviewType>(), Slot.withType<RenderingContextProvider>()];

  static async provider(
    [pubsub]: [PubsubPreview],
    config,
    [previewSlot, renderingContextSlot]: [PreviewSlot, RenderingContextSlot]
  ) {
    const preview = new PreviewPreview(pubsub, previewSlot, renderingContextSlot);

    window.addEventListener('bit-preview-modules-updated', () => {
      preview.rerenderOnPreviewModulesUpdated();
    });

    // hash changes are handled by listenToHashChanges(), attached by the first render();
    // a second listener here made every hash change render twice.

    return preview;
  }
}

PreviewAspect.addRuntime(PreviewPreview);
