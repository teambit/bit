const PRIORITY_HIGH = ['ui', 'pages'];
const PRIORITY_MED = ['design'];
const PRIORITY_LOW = ['entities', 'provider', 'hooks', 'icons'];

function root(ns: string) {
  if (!ns) return '';
  return ns.split('/')[0];
}

function priorityOf(ns: string) {
  const r = root(ns);

  if (PRIORITY_HIGH.includes(r)) return 0;
  if (PRIORITY_MED.includes(r)) return 1;
  if (PRIORITY_LOW.includes(r)) return 3;

  return 2;
}

export function sortNamespacesAdvanced(arr: string[]) {
  return [...arr].sort((a, b) => {
    const pa = priorityOf(a);
    const pb = priorityOf(b);

    if (pa !== pb) return pa - pb;

    return a.localeCompare(b);
  });
}
