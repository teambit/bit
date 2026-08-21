/**
 * A recycled pool of preview iframes, instead of one per card.
 *
 * Every preview iframe is a JS realm that boots the env's preview runtime: measured on a
 * 194-component workspace at ~0.22s of main thread and 76-300MB of heap each, the same whether the
 * card shows a real component or a behaviour with no UI. Mounting one per card meant scrolling a
 * grid grew that without bound - 79 live realms, 1.2GB of heap, and 65% of a scroll with the main
 * thread blocked, against 0% for the same grid with previews off.
 *
 * Sharing a single realm between cards removes the repeated bootstrap but cannot work: a component
 * that portals into `document.body` - drawers, modals, scrims - lands in the shared realm's body,
 * outside every card. Measured: the drawer preview put a 1440x900 scrim over the whole workspace.
 *
 * So keep the isolation and recycle the realms. A pool of real preview iframes is booted once and
 * re-pointed at whichever components are on screen by changing each iframe's hash - the document is
 * not reloaded, so a scroll costs a render rather than a bootstrap. Each preview still has its own
 * document and its own `location`, so portals, live controls and fixed positioning behave exactly as
 * they do today.
 */

export type CanvasEntry = {
  /** stable identity of the card */
  key: string;
  /** component id string, as it appears in a preview url hash */
  id: string;
  /** preview server path - cards sharing one are served by the same env, so they share a pool */
  serverUrl: string;
  /** which preview to render (compositions/overview) */
  preview?: string;
  /** width the composition should believe it has, before being scaled into the card */
  viewport?: number;
  /** the card's preview area in viewport coordinates, or undefined once unmounted */
  getRect: () => DOMRect | undefined;
};

type PooledFrame = {
  iframe: HTMLIFrameElement;
  /** the card this frame is currently showing, if any */
  assignedKey?: string;
  /** set once the frame has loaded a document, so later assignments only change the hash */
  booted: boolean;
};

const entries = new Map<string, CanvasEntry>();
const pools = new Map<string, PooledFrame[]>();
const renderedKeys = new Set<string>();
let host: HTMLDivElement | undefined;
let frame: number | undefined;
let listening = false;

/** how far outside the viewport a card is still worth showing */
const OVERSCAN_PX = 400;

function getPoolSize(): number {
  if (typeof window === 'undefined') return 12;
  const override = Number(new URLSearchParams(window.location.search).get('previewPoolSize'));
  if (Number.isFinite(override) && override > 0) return override;
  const cores = navigator.hardwareConcurrency || 8;
  // enough to cover a viewport of cards plus the overscan band, without booting realms nobody sees
  return Math.max(8, Math.min(20, cores * 2));
}

export function isPooledPreviewEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('batchedPreviews') === 'true';
}

function ensureHost(): HTMLDivElement {
  if (host) return host;
  host = document.createElement('div');
  host.id = 'bit-preview-canvas';
  // covers the viewport so card rects can be used as-is. it must never swallow clicks: the cards
  // underneath own all interaction.
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;overflow:hidden;';
  document.body.appendChild(host);
  return host;
}

function previewHash(entry: CanvasEntry): string {
  const theme = new URLSearchParams(window.location.search).get('theme');
  const params = [
    `preview=${entry.preview || 'compositions'}`,
    'disableCta=true',
    'onlyOverview=true',
    `viewport=${entry.viewport || 1280}`,
    theme ? `theme=${theme}` : '',
  ].filter(Boolean);
  return `#${entry.id}?${params.join('&')}`;
}

function poolFor(serverUrl: string): PooledFrame[] {
  const existing = pools.get(serverUrl);
  if (existing) return existing;
  const pool: PooledFrame[] = [];
  pools.set(serverUrl, pool);
  return pool;
}

function createFrame(serverUrl: string, entry: CanvasEntry): PooledFrame {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', `preview ${entry.id}`);
  iframe.style.cssText = 'position:absolute;border:0;background:transparent;transform-origin:top left;';
  iframe.src = `${serverUrl}${previewHash(entry)}`;
  ensureHost().appendChild(iframe);
  const pooled: PooledFrame = { iframe, assignedKey: entry.key, booted: true };
  poolFor(serverUrl).push(pooled);
  return pooled;
}

function assign(pooled: PooledFrame, entry: CanvasEntry) {
  if (pooled.assignedKey === entry.key) return;
  pooled.assignedKey = entry.key;
  pooled.iframe.setAttribute('title', `preview ${entry.id}`);
  const hash = previewHash(entry);
  try {
    // changing only the fragment re-renders inside the realm without reloading the document, which
    // is the whole point of the pool
    const view = pooled.iframe.contentWindow;
    if (view) view.location.hash = hash;
    else pooled.iframe.src = `${entry.serverUrl}${hash}`;
  } catch {
    pooled.iframe.src = `${entry.serverUrl}${hash}`;
  }
}

function place(pooled: PooledFrame, rect: DOMRect, viewport?: number) {
  const width = viewport && viewport > 0 ? viewport : rect.width;
  const scale = rect.width / width;
  const style = pooled.iframe.style;
  const top = `${Math.round(rect.top)}px`;
  const left = `${Math.round(rect.left)}px`;
  // only touch style when something actually moved: restyling every frame retriggers each realm's
  // ResizeObserver, which is what the dev server used to report as a resize loop
  if (style.top !== top) style.top = top;
  if (style.left !== left) style.left = left;
  const w = `${Math.round(width)}px`;
  const h = `${Math.round(rect.height / (scale || 1))}px`;
  if (style.width !== w) style.width = w;
  if (style.height !== h) style.height = h;
  const transform = `scale(${scale})`;
  if (style.transform !== transform) style.transform = transform;
  // each frame is clipped to its card by a wrapper-free approach: the card's own box is the clip,
  // so keep the frame hidden until it is placed
  if (style.visibility !== 'visible') style.visibility = 'visible';
}

function flush() {
  frame = undefined;
  const viewportHeight = window.innerHeight;
  const visibleByServer = new Map<string, Array<{ entry: CanvasEntry; rect: DOMRect; distance: number }>>();

  for (const entry of entries.values()) {
    const rect = entry.getRect();
    if (!rect || rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom < -OVERSCAN_PX || rect.top > viewportHeight + OVERSCAN_PX) continue;
    const distance = rect.top < 0 ? -rect.top : Math.max(0, rect.top - viewportHeight);
    const list = visibleByServer.get(entry.serverUrl) || [];
    list.push({ entry, rect, distance });
    visibleByServer.set(entry.serverUrl, list);
  }

  const poolSize = getPoolSize();
  for (const [serverUrl, list] of visibleByServer) {
    // nearest the viewport wins a realm when there are more visible cards than frames
    list.sort((a, b) => a.distance - b.distance);
    const wanted = list.slice(0, poolSize);
    const pool = poolFor(serverUrl);
    const wantedKeys = new Set(wanted.map((w) => w.entry.key));

    // keep frames already showing a wanted card where they are, so scrolling back is free
    const free: PooledFrame[] = [];
    for (const pooled of pool) {
      if (pooled.assignedKey && wantedKeys.has(pooled.assignedKey)) continue;
      free.push(pooled);
    }

    for (const { entry, rect } of wanted) {
      let pooled = pool.find((f) => f.assignedKey === entry.key);
      if (!pooled) {
        pooled = free.pop();
        if (pooled) assign(pooled, entry);
        else if (pool.length < poolSize) pooled = createFrame(serverUrl, entry);
      }
      if (!pooled) continue;
      place(pooled, rect, entry.viewport);
    }

    // park whatever is left over off-screen rather than destroying it: a retired realm costs a
    // bootstrap to bring back, and keeping it is what makes scrolling cheap
    for (const pooled of free) {
      if (pooled.iframe.style.visibility === 'hidden') continue;
      pooled.iframe.style.visibility = 'hidden';
    }
  }

  for (const [serverUrl, pool] of pools) {
    if (visibleByServer.has(serverUrl)) continue;
    pool.forEach((pooled) => {
      pooled.iframe.style.visibility = 'hidden';
    });
  }
}

function schedule() {
  if (frame !== undefined) return;
  frame = window.requestAnimationFrame(flush);
}

function onMessage(event: MessageEvent) {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  // the preview runtime reports its size once it has rendered; use it as the "this card is live"
  // signal so the card can drop its skeleton
  if (data.type !== 'preview-size' && data.event !== 'preview-size') return;
  for (const pool of pools.values()) {
    for (const pooled of pool) {
      if (pooled.iframe.contentWindow !== event.source || !pooled.assignedKey) continue;
      renderedKeys.add(pooled.assignedKey);
      document.dispatchEvent(
        new CustomEvent('bit-preview-canvas-rendered', { detail: { key: pooled.assignedKey } })
      );
    }
  }
}

function ensureListeners() {
  if (listening) return;
  listening = true;
  window.addEventListener('message', onMessage);
  // capture:true so a grid inside its own scroll container is covered, not just the window
  window.addEventListener('scroll', schedule, { capture: true, passive: true });
  window.addEventListener('resize', schedule, { passive: true });
}

export function registerPreview(entry: CanvasEntry) {
  ensureListeners();
  entries.set(entry.key, entry);
  schedule();
}

export function unregisterPreview(key: string) {
  entries.delete(key);
  renderedKeys.delete(key);
  schedule();
}

export function hasRendered(key: string): boolean {
  return renderedKeys.has(key);
}
