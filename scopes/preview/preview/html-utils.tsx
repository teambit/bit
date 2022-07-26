export function loadScript({ src }: { src: string }) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');

    script.setAttribute('defer', 'defer');
    script.src = src;

    script.onload = () => resolve();
    script.onerror = (message, _, _1, _2, error) =>
      reject(error || new Error(`[preview.preview] failed to load script: ${message}`));

    document.head.appendChild(script);
  });
}

export function loadLink({ href }: { href: string }) {
  return new Promise<void>((resolve, reject) => {
    const link = document.createElement('link');

    if (href.endsWith('.css')) link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', href);

    link.onload = () => resolve();
    link.onerror = (message, _, _1, _2, error) =>
      reject(error || new Error(`[preview.preview] failed to load link: ${message}`));

    document.head.appendChild(link);
  });
}
