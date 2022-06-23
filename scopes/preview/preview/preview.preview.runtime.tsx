import PubsubAspect, { PubsubPreview } from '@teambit/pubsub';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { ComponentID } from '@teambit/component-id';
import crossFetch from 'cross-fetch';
import memoize from 'memoizee';

import { PreviewNotFound } from './exceptions';
import { PreviewType } from './preview-type';
import { PreviewAspect, PreviewRuntime } from './preview.aspect';
import { ClickInsideAnIframeEvent } from './events';
import { PreviewModule } from './types/preview-module';
import { RenderingContext } from './rendering-context';
import { fetchComponentAspects } from './gql/fetch-component-aspects';
import { PreviewModules } from './preview-modules';

export type PreviewSlot = SlotRegistry<PreviewType>;

const PREVIEW_MODULES = new PreviewModules();

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
    const { previewName, componentId } = this.getLocation();
    const name = previewName || this.getDefault();
    if (rootExt) this.isDev = rootExt === 'teambit.workspace/workspace';

    const preview = this.getPreview(name);
    if (!preview || !componentId) {
      throw new PreviewNotFound(previewName);
    }

    const includesAll = await Promise.all(
      (preview.include || []).map(async (prevName) => {
        const includedPreview = this.getPreview(prevName);
        if (!includedPreview) return undefined;

        return includedPreview.selectPreviewModel?.(
          componentId.fullName,
          await this.getPreviewModule(prevName, componentId, name)
        );
      })
    );

    const includes = includesAll.filter((module) => !!module);
    // during build / tag, the component is isolated, so all aspects are relevant, and do not require filtering
    const componentAspects = this.isDev ? await this.getComponentAspects(componentId.toString()) : undefined;

    return preview.render(
      componentId,
      await this.getPreviewModule(name, componentId),
      includes,
      this.getRenderingContext(componentAspects)
    );
  };

  async getPreviewModule(name: string, id: ComponentID, parentPreviewName?: string): Promise<PreviewModule> {
    const relevantModel = PREVIEW_MODULES.get(name);
    if (!relevantModel) throw new Error(`[preview.preview] missing preview "${name}"`);
    if (relevantModel.componentMap[id.fullName]) return relevantModel;

    if (parentPreviewName && !PREVIEW_MODULES.has(parentPreviewName))
      throw new Error(`[preview.preview] missing parent preview "${parentPreviewName}"`);

    let component;
    const parentPreview = parentPreviewName ? PREVIEW_MODULES.get(parentPreviewName) : undefined;
    // Handle case when there is overview but no composition on the workspace dev server
    if (parentPreview?.componentMap[id.fullName]) {
      component = await this.fetchComponentPreview(id, name);
    }

    return {
      mainModule: relevantModel.mainModule,
      componentMap: {
        [id.fullName]: component,
      },
    };
  }

  async fetchComponentPreview(id: ComponentID, name: string) {
    let previewFile;
    const allFiles = await this.fetchComponentPreviewFiles(id, name);
    // It's a component bundled with the env
    if (allFiles === null) {
      return Promise.resolve(undefined);
    }
    allFiles.forEach((file) => {
      // We want to run the preview file always last
      if (file.endsWith('-preview.js')) {
        previewFile = file;
      } else {
        this.addComponentFileElement(id, file);
      }
    });
    return new Promise((resolve, reject) => {
      const previewScriptElement = this.getPreviewScriptElement(id, name, previewFile, resolve, reject);
      document.head.appendChild(previewScriptElement);
    });
  }

  private addComponentFileElement(id: ComponentID, previewBundleFileName: string) {
    if (previewBundleFileName.endsWith('.js')) {
      return this.addComponentFileScriptElement(id, previewBundleFileName);
    }
    return this.addComponentFileLinkElement(id, previewBundleFileName);
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
    const script = document.createElement('script');
    script.setAttribute('defer', 'defer');
    const stringId = id.toString();
    const previewRoute = `~aspect/component-preview`;
    const src = `/api/${stringId}/${previewRoute}/${previewBundleFileName}`;
    script.src = src;
    document.head.appendChild(script);
    return script;
  }

  private addComponentFileLinkElement(id: ComponentID, previewBundleFileName: string) {
    const link = document.createElement('link');
    const stringId = id.toString();
    const previewRoute = `~aspect/component-preview`;
    const href = `/api/${stringId}/${previewRoute}/${previewBundleFileName}`;
    link.setAttribute('href', href);
    if (previewBundleFileName.endsWith('.css')) {
      link.setAttribute('rel', 'stylesheet');
    }
    document.head.appendChild(link);
    return link;
  }

  private getPreviewScriptElement(id: ComponentID, name: string, previewBundleFileName: string, resolve, reject) {
    const script = document.createElement('script');
    script.setAttribute('defer', 'defer');
    const stringId = id.toString();
    // const previewRoute = `~aspect/preview`;
    const previewRoute = `~aspect/component-preview`;
    const src = `/api/${stringId}/${previewRoute}/${previewBundleFileName}`;
    script.src = src; // generate path to remote scope. [scope url]/
    script.onload = () => {
      const componentPreview = window[`${id.toStringWithoutVersion()}-preview`];
      if (!componentPreview) return reject(new PreviewNotFound(name));
      const targetPreview = componentPreview[name];
      if (!targetPreview) return resolve(undefined);

      return resolve(targetPreview);
    };
    return script;
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

  private getParam(query: string, param: string) {
    const params = new URLSearchParams(query);
    return params.get(param);
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

export function linkModules(previewName: string, previewModule: PreviewModule) {
  PREVIEW_MODULES.set(previewName, previewModule);
}

PreviewAspect.addRuntime(PreviewPreview);
