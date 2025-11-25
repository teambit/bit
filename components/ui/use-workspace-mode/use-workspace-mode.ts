import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export const useWorkspaceMode = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const isMinimal = searchParams.get('minimal-mode') === 'true';

  const setMinimalMode = useCallback(
    (value: boolean) => {
      const newParams = new URLSearchParams(searchParams);
      newParams.set('minimal-mode', value.toString());
      setSearchParams(newParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const toggleMinimalMode = useCallback(() => {
    setMinimalMode(!isMinimal);
  }, [isMinimal, setMinimalMode]);

  return { isMinimal, setMinimalMode, toggleMinimalMode };
};
