import PubsubAspect, { PubsubPreview } from '@teambit/pubsub';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { ComponentID } from '@teambit/component-id';
import crossFetch from 'cross-fetch';
import memoize from 'memoizee';
import { debounce } from 'lodash';

import { PreviewNotFound } from './exceptions';
import { PreviewType } from './preview-type';
import { PreviewAspect, PreviewRuntime } from './preview.aspect';
import { ClickInsideAnIframeEvent } from './events';
import { ModuleFile, PreviewModule } from './types/preview-module';
import { RenderingContext } from './rendering-context';
import { fetchComponentAspects } from './gql/fetch-component-aspects';
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

  private registerClickPubSub() {
    window.addEventListener('click', (e) => {
      const timestamp = Date.now();
      const clickEvent = Object.assign({}, e);
      this.pubsub.pub(PreviewAspect.id, new ClickInsideAnIframeEvent(timestamp, clickEvent));
    });
  }

  private isDev = false;

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
   * render the preview.
   */
  render = async (rootExt?: string) => {
    // fit content always.
    window.document.body.style.width = 'fit-content';

    const { previewName, componentId } = this.getLocation();
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

    const includes = includesAll.filter((module) => !!module);
    // during build / tag, the component is isolated, so all aspects are relevant, and do not require filtering
    const componentAspects = this.isDev ? await this.getComponentAspects(componentId.toString()) : undefined;
    const previewModule = await this.getPreviewModule(name, componentId);
    const render = preview.render(
      componentId,
      previewModule,
      includes,
      this.getRenderingContext(componentAspects)
    );

    this.reportSize();
    this.setViewport();
    return render;
  };

  setViewport() {
    const query = this.getQuery();
    const viewPort = this.getParam(query, 'viewport');
    if (!viewPort) {
      window.document.body.style.width = '100%';
      return;
    }

    window.document.body.style.maxWidth = `${viewPort}px`;
  }

  reportSize() {
    if (!window?.parent || !window?.document) return;
    // TODO: discuss with gilad for a better way to resolve page loaded here.

    const sendPubsubEvent = () => {
      this.pubsub.pub(PreviewAspect.id, new SizeEvent({
        width: window.document.body.offsetWidth,
        height: window.document.body.offsetHeight
      }));  
    }

    window.addEventListener('resize', debounce(sendPubsubEvent, 150));
      
    let counter = 0;
    const interval = setInterval(() => {
      // TODO: think
      counter += 1;
      if (counter > 10) {
        clearInterval(interval);
        return;
      }
      this.pubsub.pub(PreviewAspect.id, new SizeEvent({
        width: window.document.body.offsetWidth,
        height: window.document.body.offsetHeight
      }));  
    }, 200);
  }

  async getPreviewModule(previewName: string, id: ComponentID): Promise<PreviewModule> {
    const compShortId = id.fullName;

    const relevantModel = PREVIEW_MODULES.get(previewName);
    if (!relevantModel) throw new Error(`[preview.preview] missing preview "${previewName}"`);
    if (relevantModel.componentMap[compShortId]) return relevantModel;

    const componentPreviews = await this.fetchComponentPreview(id, previewName);
    PREVIEW_MODULES.loadComponentPreviews(compShortId, componentPreviews);

    const component = componentPreviews[previewName];

    return {
      mainModule: relevantModel.mainModule,
      componentMap: {
        [id.fullName]: component,
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

  private getComponentAspects = memoize(fetchComponentAspects, {
    max: 100,
    maxAge: 12 * 60 * 60 * 1000,
  });

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

    window.addEventListener('hashchange', () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      preview.render();
    });

    return preview;
  }
}

PreviewAspect.addRuntime(PreviewPreview);
