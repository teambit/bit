import React, { useContext, useEffect, useState, useRef } from 'react';
import { ComponentContext } from '@teambit/component';
import { toPreviewHash, toPreviewServer } from '@teambit/preview';

import styles from './overview.module.scss';

const PREVIEW_NAME = 'overview';

export function Overview() {
  const component = useContext(ComponentContext);

  const currentHash = toPreviewHash(component, PREVIEW_NAME);
  const currentServer = toPreviewServer(component);

  const [servers, setServers] = useState<string[]>([]);

  useEffect(() => {
    if (servers.includes(currentServer)) return;

    setServers(servers.concat(currentServer));
  }, [currentServer, servers]);

  // each iframe should keep its own url hash
  // and avoid unnecessary url changes.
  const { current: hashes } = useRef(new Map<string, string>());
  hashes.set(currentServer, currentHash);

  return (
    <>
      {servers.map((server) => (
        <iframe
          key={server}
          className={server === currentServer ? styles.activePreview : styles.inactivePreview}
          src={`${server}#${hashes.get(server) ?? ''}`}
        />
      ))}
    </>
  );
}
