import React, { useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';

export const PreserveWorkspaceMode: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [, setSearchParams] = useSearchParams();
  const location = useLocation();

  useEffect(() => {
    const currentParams = new URLSearchParams(location.search);
    const minimalModeParam = currentParams.get('minimal-mode');
    const storedMinimalMode = sessionStorage.getItem('workspace-minimal-mode');

    if (minimalModeParam === 'true') {
      sessionStorage.setItem('workspace-minimal-mode', 'true');
    } else {
      sessionStorage.removeItem('workspace-minimal-mode');
    }

    const shouldRestore = !minimalModeParam && storedMinimalMode;
    if (!shouldRestore) return;

    currentParams.set('minimal-mode', 'true');
    setSearchParams(currentParams, { replace: true });
  }, [location.search, setSearchParams]);

  return <>{children}</>;
};
