import { useState, useContext, useEffect } from 'react';
import { v1 } from 'uuid';
import { LoaderContext } from './loader-context';

export function useLoader(loading: boolean) {
  const [id] = useState(() => v1());
  const ctx = useContext(LoaderContext);
  console.log('useLoader', loading);

  useEffect(() => {
    console.log('useLoader, useEffect', loading);
    ctx.update(id, loading);
    return () => {
      ctx.remove(id);
    };
  }, [loading, ctx, id]);
}
