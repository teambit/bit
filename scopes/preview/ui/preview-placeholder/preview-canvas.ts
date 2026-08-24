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
  /** the card's element, used once to find the scroller the grid lives in */
  getNode?: () => HTMLElement | undefined;
};

type PooledFrame = {
  /** clips the scaled frame to the card, and is the only box that occupies layout */
  wrapper: HTMLDivElement;
  iframe: HTMLIFrameElement;
  /** the card this frame is currently showing, if any */
  assignedKey?: string;
  /** set once the frame has loaded a document, so later assignments only change the hash */
  booted: boolean;
  /** true once something has actually rendered, which is when it is safe to show */
  ready: boolean;
};

const entries = new Map<string, CanvasEntry>();
const pools = new Map<string, PooledFrame[]>();
const renderedKeys = new Set<string>();
let host: HTMLDivElement | undefined;
let scrollRoot: HTMLElement | undefined;
/** last scroll offset, used to tell which way the grid is moving */
let lastScrollTop = 0;
let scrollingDown = true;
/** frames created but not yet showing anything */
let booting = 0;
let frame: number | undefined;
let listening = false;

/**
 * How far outside the viewport a card is still worth showing. Wide enough that a frame is assigned
 * and positioned well before it scrolls into view: a frame that arrives late keeps its previous
 * card's position for a moment, which reads as a preview jumping into place.
 */
const OVERSCAN_PX = 1400;

/** cards in the direction of travel are worth a frame more than the ones being left behind */
const AHEAD_BIAS = 0.4;
const BEHIND_BIAS = 1.8;

/**
 * Realms contend for one dev server, so the pool fills adaptively. Letting the whole pool start
 * together on a cold page made the *first* preview take tens of seconds: twenty realms fetched and
 * parsed the env bundles simultaneously and none finished early. But once ONE realm has rendered,
 * every asset is in the browser's HTTP cache and a thumbnail realm evaluates in ~30ms - holding the
 * gates closed then just delays the grid (measured: 20 x 29ms of work stretched to 3.7s). So the
 * first realm boots nearly alone to warm the cache, and its render opens the gates.
 */
const COLD_BOOTING_AT_ONCE = 2;
const WARM_BOOTING_AT_ONCE = 12;
const COLD_FRAMES_PER_FLUSH = 1;
const WARM_FRAMES_PER_FLUSH = 6;

let assetsWarmed = false;
function maxBooting() {
  return assetsWarmed ? WARM_BOOTING_AT_ONCE : COLD_BOOTING_AT_ONCE;
}
function maxNewFramesPerFlush() {
  return assetsWarmed ? WARM_FRAMES_PER_FLUSH : COLD_FRAMES_PER_FLUSH;
}

/** a frame stays hidden until its preview is up, so the card's own skeleton shows through */
const REVEAL_AFTER_LOAD_MS = 120;

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

/**
 * The element the grid actually scrolls in, which is rarely the window.
 *
 * Deliberately does not require the container to be scrollable *yet*: when the first card registers
 * the grid is usually still filling, so a height check answers "no" and the overlay would be
 * anchored to the body - which is how previews ended up being repositioned by javascript on every
 * scroll event, drifting behind the cards.
 */
function findScrollRoot(from?: HTMLElement): HTMLElement {
  let node = from?.parentElement || null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY)) return node;
    node = node.parentElement;
  }
  return document.body;
}

/**
 * Any card element currently in the dom. The *first registered* card is not good enough: a grid
 * recycles cards as it scrolls, so that entry is frequently unmounted and hands back nothing, which
 * silently left the overlay anchored to the body.
 */
function anyLiveNode(): HTMLElement | undefined {
  for (const entry of entries.values()) {
    const node = entry.getNode?.();
    if (node && node.isConnected) return node;
  }
  return undefined;
}

/**
 * Re-home the overlay if the grid turned out to scroll somewhere else. The first card can register
 * before the layout that reveals the real scroller exists, and being anchored to the wrong element
 * is exactly the bug this module exists to avoid.
 */
function reanchorIfNeeded(near?: HTMLElement) {
  if (!host || !scrollRoot) return;
  const isScroller = scrollRoot !== document.body && scrollRoot.scrollHeight > scrollRoot.clientHeight + 40;
  if (isScroller) return;

  const candidate = findScrollRoot(near);
  if (candidate === scrollRoot) return;

  scrollRoot = candidate;
  if (scrollRoot !== document.body && window.getComputedStyle(scrollRoot).position === 'static') {
    scrollRoot.style.position = 'relative';
  }
  scrollRoot.appendChild(host);
}

function ensureHost(near?: HTMLElement): HTMLDivElement {
  if (host) return host;
  scrollRoot = findScrollRoot(near);

  // The overlay lives *inside* the scroller and is positioned in its content coordinates, not the
  // viewport's. A fixed overlay has to be repositioned every frame to follow the cards, and it can
  // never keep up with compositor-driven scrolling - the previews visibly drift behind the page and
  // snap back. Anchored in the content instead, native scrolling moves previews and cards together
  // and no javascript runs while the page scrolls.
  if (scrollRoot !== document.body && window.getComputedStyle(scrollRoot).position === 'static') {
    scrollRoot.style.position = 'relative';
  }

  host = document.createElement('div');
  host.id = 'bit-preview-canvas';
  // never swallow clicks: the cards underneath own all interaction
  host.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:0;pointer-events:none;z-index:1;';
  scrollRoot.appendChild(host);
  return host;
}

/** a card's position in the scroller's content box, which does not change as the page scrolls */
function toContentCoords(rect: DOMRect) {
  const root = scrollRoot || document.body;
  if (root === document.body) {
    return { top: rect.top + window.scrollY, left: rect.left + window.scrollX };
  }
  const rootRect = root.getBoundingClientRect();
  return { top: rect.top - rootRect.top + root.scrollTop, left: rect.left - rootRect.left + root.scrollLeft };
}

function previewHash(entry: CanvasEntry): string {
  const theme = new URLSearchParams(window.location.search).get('theme');
  const params = [
    `preview=${entry.preview || 'compositions'}`,
    'disableCta=true',
    'onlyOverview=true',
    // thumbnail mode: the realm boots only what a static grid card needs. Link files for other
    // preview types stay unevaluated (the docs app is most of a realm's boot cost), the pubsub
    // handshake - which this pool never answers - is skipped, and the realm reports its size with
    // a plain postMessage that onMessage below uses as the render signal.
    'thumbnail=true',
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

function markReady(pooled: PooledFrame) {
  if (pooled.ready) return;
  pooled.ready = true;
  booting = Math.max(0, booting - 1);
  // the first rendered preview proves the env assets are cached and the server is responsive -
  // from here on, realm boot is ~30ms of evaluation and the gates can open
  if (!assetsWarmed) {
    assetsWarmed = true;
    schedule();
  }
  if (pooled.assignedKey) {
    renderedKeys.add(pooled.assignedKey);
    document.dispatchEvent(new CustomEvent('bit-preview-canvas-rendered', { detail: { key: pooled.assignedKey } }));
  }
  schedule();
}

function createFrame(serverUrl: string, entry: CanvasEntry): PooledFrame {
  // A scaled iframe still occupies its unscaled box in layout - 1280px wide for a 328px card - so
  // placing frames directly in the scroller inflated its scrollable area. The wrapper is the only
  // thing that takes up space, and it is exactly the size of the card.
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:absolute;overflow:hidden;contain:layout paint size style;visibility:hidden;';

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', `preview ${entry.id}`);
  iframe.style.cssText = 'position:absolute;top:0;left:0;border:0;background:transparent;transform-origin:top left;';
  iframe.src = `${serverUrl}${previewHash(entry)}`;

  wrapper.appendChild(iframe);
  ensureHost(entry.getNode?.()).appendChild(wrapper);
  const pooled: PooledFrame = { wrapper, iframe, assignedKey: entry.key, booted: true, ready: false };

  booting += 1;
  // the preview paints an opaque background before it has rendered anything, so revealing on load
  // would replace the card's skeleton with a blank white box
  iframe.addEventListener('load', () => {
    window.setTimeout(() => markReady(pooled), REVEAL_AFTER_LOAD_MS);
  });

  poolFor(serverUrl).push(pooled);
  return pooled;
}

function assign(pooled: PooledFrame, entry: CanvasEntry) {
  if (pooled.assignedKey === entry.key) return;
  pooled.assignedKey = entry.key;
  // it is showing the previous card's component until the new one renders
  pooled.wrapper.style.visibility = 'hidden';
  pooled.ready = false;
  booting += 1;
  window.setTimeout(() => markReady(pooled), REVEAL_AFTER_LOAD_MS * 4);
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
  const coords = toContentCoords(rect);

  // only touch style when something actually moved: restyling every frame retriggers each realm's
  // ResizeObserver, which the dev server used to report as a resize loop
  const wrap = pooled.wrapper.style;
  const top = `${Math.round(coords.top)}px`;
  const left = `${Math.round(coords.left)}px`;
  const boxW = `${Math.round(rect.width)}px`;
  const boxH = `${Math.round(rect.height)}px`;
  if (wrap.top !== top) wrap.top = top;
  if (wrap.left !== left) wrap.left = left;
  if (wrap.width !== boxW) wrap.width = boxW;
  if (wrap.height !== boxH) wrap.height = boxH;
  const shouldShow = pooled.ready ? 'visible' : 'hidden';
  if (wrap.visibility !== shouldShow) wrap.visibility = shouldShow;

  const style = pooled.iframe.style;
  const w = `${Math.round(width)}px`;
  const h = `${Math.round(rect.height / (scale || 1))}px`;
  if (style.width !== w) style.width = w;
  if (style.height !== h) style.height = h;
  const transform = `scale(${scale})`;
  if (style.transform !== transform) style.transform = transform;
}

function flush() {
  frame = undefined;
  reanchorIfNeeded(anyLiveNode());
  const viewportHeight = window.innerHeight;
  const visibleByServer = new Map<string, Array<{ entry: CanvasEntry; rect: DOMRect; distance: number }>>();

  const currentTop = scrollRoot === document.body ? window.scrollY : scrollRoot?.scrollTop || 0;
  if (currentTop !== lastScrollTop) {
    scrollingDown = currentTop > lastScrollTop;
    lastScrollTop = currentTop;
  }

  for (const entry of entries.values()) {
    const rect = entry.getRect();
    if (!rect || rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom < -OVERSCAN_PX || rect.top > viewportHeight + OVERSCAN_PX) continue;

    const offscreen = rect.top < 0 ? -rect.top : Math.max(0, rect.top - viewportHeight);
    // on screen, everything is equally urgent; off screen, prefer whichever side we are heading
    // towards, so the pool spends its frames on cards about to appear rather than ones just left
    const ahead = rect.top < 0 ? !scrollingDown : scrollingDown;
    const distance = offscreen === 0 ? 0 : offscreen * (ahead ? AHEAD_BIAS : BEHIND_BIAS);

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

    let createdThisFlush = 0;
    for (const { entry, rect } of wanted) {
      let pooled = pool.find((f) => f.assignedKey === entry.key);
      if (!pooled) {
        pooled = free.pop();
        if (pooled) assign(pooled, entry);
        else if (
          pool.length < poolSize &&
          booting < maxBooting() &&
          createdThisFlush < maxNewFramesPerFlush()
        ) {
          pooled = createFrame(serverUrl, entry);
          createdThisFlush += 1;
        }
      }
      if (!pooled) continue;
      place(pooled, rect, entry.viewport);
    }

    // park whatever is left over off-screen rather than destroying it: a retired realm costs a
    // bootstrap to bring back, and keeping it is what makes scrolling cheap
    for (const pooled of free) {
      if (pooled.wrapper.style.visibility === 'hidden') continue;
      pooled.wrapper.style.visibility = 'hidden';
    }
  }

  for (const [serverUrl, pool] of pools) {
    if (visibleByServer.has(serverUrl)) continue;
    pool.forEach((pooled) => {
      pooled.wrapper.style.visibility = 'hidden';
    });
  }

  // creation is rationed per flush; while visible cards still lack frames, keep the pump running
  // instead of waiting for the next scroll or message event
  const wantsMore = [...visibleByServer.values()].some((list) =>
    list.some(({ entry }) => !poolFor(entry.serverUrl).some((f) => f.assignedKey === entry.key))
  );
  if (wantsMore) schedule();
}

function schedule() {
  if (frame !== undefined) return;
  frame = window.requestAnimationFrame(flush);
}

function onMessage(event: MessageEvent) {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  // the preview runtime reports its size once it has rendered; use it as the "this card is live"
  // signal so the card can drop its skeleton and the frame can be revealed - it arrives when the
  // preview really rendered, where the reveal timers below are blind guesses kept as fallback
  if (data.type !== 'preview-size' && data.event !== 'preview-size') return;
  for (const pool of pools.values()) {
    for (const pooled of pool) {
      if (pooled.iframe.contentWindow !== event.source || !pooled.assignedKey) continue;
      markReady(pooled);
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
  // resolve the scroller from the first card we see, before any frame needs placing
  if (!host) ensureHost(entry.getNode?.());
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
