import PubsubAspect, { PubsubPreview } from '@teambit/pubsub';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { ComponentID } from '@teambit/component-id';
import crossFetch from 'cross-fetch';

import { PreviewNotFound } from './exceptions';
import { PreviewType } from './preview-type';
import { PreviewAspect, PreviewRuntime } from './preview.aspect';
import { ClickInsideAnIframeEvent } from './events';
import { PreviewModule } from './types/preview-module';
import { RenderingContext } from './rendering-context';

export type PreviewSlot = SlotRegistry<PreviewType>;

const PREVIEW_MODULES: Record<string, PreviewModule> = {};

export type RenderingContextProvider = () => { [key: string]: any };
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

  /**
   * render the preview.
   */
  render = async () => {
    const { previewName, componentId } = this.getLocation();
    const name = previewName || this.getDefault();

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
          await this.getPreviewModule(prevName, componentId)
        );
      })
    );

    const includes = includesAll.filter((module) => !!module);

    return preview.render(
      componentId.fullName,
      await this.getPreviewModule(name, componentId),
      includes,
      this.getRenderingContext()
    );
  };

  async getPreviewModule(name: string, id: ComponentID): Promise<PreviewModule> {
    if (PREVIEW_MODULES[name].componentMap[id.fullName]) return PREVIEW_MODULES[name];
    // if (!window[name]) throw new PreviewNotFound(name);
    // const isSplitComponentBundle = PREVIEW_MODULES[name].isSplitComponentBundle ?? false;
    // const component = window[id.toStringWithoutVersion()];
    const component: any = await this.fetchComponentPreview(id, name);

    return {
      mainModule: PREVIEW_MODULES[name].mainModule,
      componentMap: {
        [id.fullName]: component,
      },
    };
  }

  async fetchComponentPreview(id: ComponentID, name: string) {
    let previewFile;
    const allFiles = await this.fetchComponentPreviewFiles(id, name);
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

  private async fetchComponentPreviewFiles(id: ComponentID, previewName: string): Promise<string[]> {
    const previewAssetsRoute = `~aspect/preview-assets`;
    const stringId = id.toString();
    const url = `/api/${stringId}/${previewAssetsRoute}`;

    const res = await crossFetch(url);
    if (res.status >= 400) {
      throw new PreviewNotFound(previewName);
    }
    const parsed = await res.json();
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
  getRenderingContext() {
    return new RenderingContext(this.renderingContextSlot);
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

export function linkModules(
  previewName: string,
  defaultModule: any,
  isSplitComponentBundle: boolean,
  componentMap: { [key: string]: any }
) {
  PREVIEW_MODULES[previewName] = {
    mainModule: defaultModule,
    isSplitComponentBundle,
    componentMap,
  };
}

PreviewAspect.addRuntime(PreviewPreview);
