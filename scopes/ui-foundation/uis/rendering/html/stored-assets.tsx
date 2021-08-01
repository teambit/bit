import React from 'react';

export function StoredAssets({ data }: { data: Record<string, string> }) {
  return (
    <div className="state" style={{ display: 'none' }}>
      {Object.entries(data).map(([key, content]) => (
        // TODO - we falsely assume content is html safe
        <script key={key} data-aspect={key} type="application/json" dangerouslySetInnerHTML={{ __html: content }} />
      ))}
    </div>
  );
}

/** read and remove stored data from the dom */
export function popAssets() {
  const rawAssets = new Map<string, string>();

  const inDom = Array.from(document.querySelectorAll('body > .state > *'));

  inDom.forEach((elem) => {
    const aspectName = elem.getAttribute('data-aspect');
    if (!aspectName) return;

    rawAssets.set(aspectName, elem.innerHTML);
  });

  document.querySelector('body > .state')?.remove();

  return rawAssets;
}
