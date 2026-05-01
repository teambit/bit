const NS_HUES: Record<string, number> = {
  actions: 264,
  content: 200,
  surfaces: 162,
  feedback: 38,
  inputs: 220,
  charts: 142,
  navigation: 280,
  envs: 250,
};

function hashToHue(ns: string): number {
  let hash = 0;
  for (let i = 0; i < ns.length; i++) {
    hash = ((hash << 5) - hash + ns.charCodeAt(i)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}

export function getHue(ns: string): number {
  return NS_HUES[ns] ?? hashToHue(ns);
}

export function getAccent(ns: string): string {
  return `oklch(58% 0.18 ${getHue(ns)})`;
}

export function getTint(ns: string): string {
  return `oklch(96% 0.04 ${getHue(ns)})`;
}
