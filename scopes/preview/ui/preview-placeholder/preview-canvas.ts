/**
 * One preview realm per env, instead of one per card.
 *
 * A card grid mounts an iframe per component, and each iframe pays the full preview-runtime
 * bootstrap: measured on a 194-component workspace at ~0.22s of main thread and 76-300MB of heap
 * per card, identical whether the card renders a real component or a behaviour with no UI. With 79
 * cards live that is ~17s of blocking work - the reason scrolling a large workspace stutters (64% of
 * a scroll had the main thread blocked, against 0% for the same grid with previews off).
 *
 * Adding a component to an *already booted* realm measured at ~0ms, because the realm already holds
 * every component in its env. So this module keeps a single iframe per env dev server, positioned
 * over the viewport, and tells it which components are on screen and where. Scrolling only moves
 * boxes inside that realm; nothing re-renders and nothing bootstraps twice.
 *
 * Cards register their rect here rather than rendering their own iframe. The env grouping falls out
 * of `server.url`, which is already deduped per dev server by the bundler.
 */

export type CanvasEntry = {
  /** stable identity of the card, used to diff the on-screen set */
  key: string;
  /** component id string, as the preview runtime expects it in `ComponentID.tryFromString` */
  id: string;
  /** preview server path - this is what groups cards into realms */
  serverUrl: string;
  /** which preview to render (compositions/overview) */
  preview?: string;
  /** returns the card's preview area in viewport coordinates, or undefined if unmounted */
  getRect: () => DOMRect | undefined;
  /** width the composition should believe it has, before being scaled into the card */
  viewport?: number;
};

type Realm = {
  iframe: HTMLIFrameElement;
  ready: boolean;
  /** entries queued while the realm was still booting */
  pending: CanvasEntry[];
};

const entries = new Map<string, CanvasEntry>();
/** last rect sent per key, so an unchanged card is not re-sent every frame */
const lastSent = new Map<string, string>();
const realms = new Map<string, Realm>();
const renderedKeys = new Set<string>();
let host: HTMLDivElement | undefined;
let frame: number | undefined;
let listening = false;

/** how far outside the viewport a card is still worth rendering */
const OVERSCAN_PX = 600;

export function isBatchedPreviewEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('batchedPreviews') === 'true';
}

function ensureHost(): HTMLDivElement {
  if (host) return host;
  host = document.createElement('div');
  host.id = 'bit-preview-canvas';
  // covers the viewport so rects can be passed through as plain viewport coordinates. it must never
  // swallow clicks - the cards underneath own all interaction.
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;';
  document.body.appendChild(host);
  return host;
}

function ensureRealm(serverUrl: string): Realm {
  const existing = realms.get(serverUrl);
  if (existing) return existing;

  const iframe = document.createElement('iframe');
  const separator = serverUrl.includes('?') ? '&' : '?';
  iframe.src = `${serverUrl}${separator}multi=true`;
  iframe.setAttribute('title', `bit preview realm ${serverUrl}`);
  iframe.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;color-scheme:normal;';
  // the realm is see-through except where it paints a preview, so the grid underneath stays visible
  iframe.setAttribute('allowtransparency', 'true');
  ensureHost().appendChild(iframe);

  const realm: Realm = { iframe, ready: false, pending: [] };
  realms.set(serverUrl, realm);
  return realm;
}

function onMessage(event: MessageEvent) {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'bit-preview-multi-ready') {
    for (const realm of realms.values()) {
      if (realm.iframe.contentWindow !== event.source) continue;
      realm.ready = true;
      schedule();
    }
  }
  if (data.type === 'bit-preview-rendered' && typeof data.key === 'string') {
    renderedKeys.add(data.key);
    document.dispatchEvent(new CustomEvent('bit-preview-canvas-rendered', { detail: { key: data.key } }));
  }
}

function flush() {
  frame = undefined;
  const viewportHeight = window.innerHeight;
  const byServer = new Map<string, any[]>();
  const seen = new Map<string, string>();

  for (const entry of entries.values()) {
    const rect = entry.getRect();
    if (!rect || rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom < -OVERSCAN_PX || rect.top > viewportHeight + OVERSCAN_PX) continue;

    const items = byServer.get(entry.serverUrl) || [];
    items.push({
      key: entry.key,
      id: entry.id,
      preview: entry.preview,
      viewport: entry.viewport,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    });
    byServer.set(entry.serverUrl, items);
    // rounding to whole pixels keeps sub-pixel scroll jitter from looking like a change: restyling
    // a surface every frame retriggers its ResizeObserver, and a resize loop is what the dev
    // server's error overlay was reporting
    seen.set(entry.key, `${Math.round(rect.top)},${Math.round(rect.left)},${Math.round(rect.width)},${Math.round(rect.height)}`);
  }

  for (const [serverUrl, items] of byServer) {
    const realm = ensureRealm(serverUrl);
    if (!realm.ready) {
      realm.pending = items;
      continue;
    }
    // skip the message entirely when nothing moved, so a settled grid goes quiet
    const unchanged =
      items.length === [...seen.keys()].filter((k) => entries.get(k)?.serverUrl === serverUrl).length &&
      items.every((item: any) => lastSent.get(item.key) === seen.get(item.key));
    if (unchanged) continue;
    realm.iframe.contentWindow?.postMessage({ type: 'bit-preview-set', items }, '*');
  }
  lastSent.clear();
  seen.forEach((value, key) => lastSent.set(key, value));
  // realms whose cards all scrolled away still need to be told, so they can drop their containers
  for (const [serverUrl, realm] of realms) {
    if (byServer.has(serverUrl) || !realm.ready) continue;
    realm.iframe.contentWindow?.postMessage({ type: 'bit-preview-set', items: [] }, '*');
  }
}

function schedule() {
  if (frame !== undefined) return;
  frame = window.requestAnimationFrame(flush);
}

function ensureListeners() {
  if (listening) return;
  listening = true;
  window.addEventListener('message', onMessage);
  // capture:true so the grid's own scroll container is covered, not just the window
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
