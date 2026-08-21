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

  private isReady() {
    const { previewName } = this.getLocation();
    const name = previewName || this.getDefault();

    if (!PREVIEW_MODULES.has(name)) return false;
    const preview = this.getPreview(name);
    if (!preview) return false;
    const includedReady = preview.include?.every((included) => PREVIEW_MODULES.has(included)) ?? true;
    if (!includedReady) return false;

    return true;
  }

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
   * Batched mode: render many components inside ONE realm.
   *
   * A workspace grid gives every card its own preview iframe, and every iframe is a JS realm that
   * pays the full preview-runtime bootstrap - measured at ~0.22s of main thread and ~76-300MB of
   * heap per card, the same whether the card shows a real component or a behaviour with no UI. With
   * 79 cards live that is ~17s of blocking work, and it is what makes scrolling a large workspace
   * stutter. Resolving an extra component inside an already-booted realm, by contrast, measured at
   * ~0ms: the realm already holds every component in the env.
   *
   * So in this mode the host mounts one iframe per env and drives it over postMessage: it sends the
   * set of components currently on screen with the rect each should occupy, and this runtime renders
   * them into absolutely positioned containers. Scrolling only moves the boxes - nothing re-renders,
   * and nothing bootstraps a second time.
   */
  private multiSurfaces = new Map<string, { container: HTMLElement; frame: HTMLIFrameElement; mount: HTMLElement }>();

  private multiRendered = new Set<string>();

  private styleSyncObserver?: MutationObserver;

  private isMultiMode() {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('multi') === 'true';
  }

  private multiRoot(): HTMLElement {
    let host = window.document.getElementById('bit-preview-multi-root');
    if (!host) {
      host = window.document.createElement('div');
      host.id = 'bit-preview-multi-root';
      host.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
      window.document.body.appendChild(host);
    }
    return host;
  }

  /**
   * Mirror the realm's stylesheets into a surface document. Previews are rendered into their own
   * documents (see `ensureSurface`), which means they do not inherit the realm's styles - the env's
   * css has to be copied in, and kept in sync as the dev server injects more of it.
   */
  private syncStyles(target: Document) {
    const isStyle = (node: Node): node is HTMLElement =>
      node instanceof HTMLElement &&
      (node.tagName === 'STYLE' || (node.tagName === 'LINK' && node.getAttribute('rel') === 'stylesheet'));

    const copyAll = () => {
      const wanted = [...window.document.head.children].filter(isStyle);
      target.head.querySelectorAll('[data-bit-mirrored]').forEach((n) => n.remove());
      wanted.forEach((node) => {
        const clone = node.cloneNode(true) as HTMLElement;
        clone.setAttribute('data-bit-mirrored', 'true');
        target.head.appendChild(clone);
      });
    };
    copyAll();

    if (!this.styleSyncObserver) {
      // one observer for every surface: re-mirroring is cheap next to a preview render, and dev
      // servers inject styles continuously as chunks arrive
      this.styleSyncObserver = new MutationObserver(() => {
        for (const surface of this.multiSurfaces.values()) {
          const doc = surface.frame.contentDocument;
          if (doc) this.syncStyles(doc);
        }
      });
      this.styleSyncObserver.observe(window.document.head, { childList: true, characterData: true, subtree: true });
    }
  }

  /**
   * Give a preview its own document.
   *
   * Rendering every preview into the single realm document looked cheapest, but a component that
   * uses `position: fixed` or portals into `document.body` - sticky bars, modals, drawers - escapes
   * its box and paints over the whole grid, and no CSS can scope a portal. A blank same-origin
   * iframe restores that isolation. It carries no `src`, so it loads no bundle: the react root is
   * created here, in the one realm that already parsed everything, and renders into the child
   * document. That keeps the single-bootstrap win while making each preview a real page again.
   */
  private ensureSurface(key: string, container: HTMLElement) {
    const existing = this.multiSurfaces.get(key);
    if (existing) return existing;

    const frame = window.document.createElement('iframe');
    frame.setAttribute('title', `preview ${key}`);
    frame.style.cssText = 'border:0;display:block;background:transparent;';
    container.appendChild(frame);

    const doc = frame.contentDocument;
    if (!doc) throw new Error('[preview.preview] preview surface has no document');
    doc.open();
    doc.write('<!doctype html><html><head></head><body style="margin:0"></body></html>');
    doc.close();

    // relative urls inside a preview resolve against the document, and an about:blank document has
    // no useful base of its own
    const base = doc.createElement('base');
    base.href = window.location.href;
    doc.head.appendChild(base);
    this.syncStyles(doc);

    const mount = doc.createElement('div');
    doc.body.appendChild(mount);

    const surface = { container, frame, mount };
    this.multiSurfaces.set(key, surface);
    return surface;
  }

  private applyRect(
    key: string,
    rect: { top: number; left: number; width: number; height: number },
    viewport?: number
  ) {
    const surface = this.multiSurfaces.get(key);
    if (!surface) return;
    surface.container.style.cssText =
      `position:absolute;overflow:hidden;contain:layout paint style;` +
      `top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;`;

    // a composition renders at the viewport width it was authored for, then gets scaled into the
    // card - the same thing the per-card path does by scaling its iframe
    const width = viewport && viewport > 0 ? viewport : rect.width;
    const scale = rect.width / width;
    surface.frame.style.width = `${width}px`;
    surface.frame.style.height = `${scale > 0 ? rect.height / scale : rect.height}px`;
    surface.frame.style.transform = `scale(${scale})`;
    surface.frame.style.transformOrigin = 'top left';
  }

  private async renderOneInto(item: any) {
    const { key, id, preview: previewName, rect } = item;
    const componentId = ComponentID.tryFromString(id);
    const name = previewName || this.getDefault();
    const preview = this.getPreview(name);
    if (!preview || !componentId) return;

    let surface = this.multiSurfaces.get(key);
    if (!surface) {
      const container = window.document.createElement('div');
      this.multiRoot().appendChild(container);
      surface = this.ensureSurface(key, container);
    }
    this.applyRect(key, rect, item.viewport);
    if (this.multiRendered.has(key)) return; // already mounted; the rect update above is enough

    this.multiRendered.add(key);
    try {
      const previewModule = await this.getPreviewModule(name, componentId);
      const context = this.getRenderingContext(undefined);
      // the mounter reads `container` off the rendering context and keeps one react root per
      // container, so previews live side by side instead of replacing each other
      Object.assign(context as any, { container: surface.mount });
      await preview.render(componentId, item.envId || '', previewModule, [], context);
      window.parent?.postMessage({ type: 'bit-preview-rendered', key }, '*');
    } catch (err: any) {
      this.multiRendered.delete(key);
      // eslint-disable-next-line no-console
      console.error('[preview][multi:render:fail]', id, err);
    }
  }

  private startMultiMode() {
    window.document.body.style.margin = '0';
    // This realm is an overlay stretched across the host's viewport: anything it paints outside a
    // preview container would cover the grid underneath it. The preview html gives the document an
    // opaque background, which is right for a single preview filling its own iframe and wrong here.
    window.document.documentElement.style.background = 'transparent';
    window.document.body.style.background = 'transparent';
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || data.type !== 'bit-preview-set' || !Array.isArray(data.items)) return;

      const wanted = new Set<string>(data.items.map((i: any) => i.key));
      for (const [key, surface] of this.multiSurfaces) {
        if (wanted.has(key)) continue;
        surface.container.remove();
        this.multiSurfaces.delete(key);
        this.multiRendered.delete(key);
      }
      for (const item of data.items) void this.renderOneInto(item);
    });
    window.parent?.postMessage({ type: 'bit-preview-multi-ready' }, '*');
  }

  /**
   * render the preview.
   */
  render = async (rootExt?: string) => {
    // fit content always.
    window.document.body.style.width = 'auto';

    if (this.isMultiMode()) {
      if (rootExt) this.isDev = rootExt === 'teambit.workspace/workspace';
      this.startMultiMode();
      return undefined;
    }

    const { previewName, componentId, envId } = this.getLocation();
    const name = previewName || this.getDefault();
    if (rootExt) this.isDev = rootExt === 'teambit.workspace/workspace';

    const preview = this.getPreview(name);
    if (!preview || !componentId) {
      throw new PreviewNotFound(previewName);
    }

    const includesAll = await Promise.all(
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

    const relevantModel = PREVIEW_MODULES.get(previewName);
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

    window.addEventListener('hashchange', () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      preview.render();
    });

    return preview;
  }
}

PreviewAspect.addRuntime(PreviewPreview);
