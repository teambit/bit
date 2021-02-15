import { useState, useEffect } from 'react';
import { WebpackAspect, WebpackCompilationDoneEvent, WebpackCompilationStartedEvent } from '@teambit/webpack';
import type { PubsubMain, BitBaseEvent } from '@teambit/pubsub';

export type UsePreviewServerProps = {
  pubsub: PubsubMain;
};

export function usePreviewServer({ pubsub }: UsePreviewServerProps) {
  const [errors, setErrors] = useState<any[]>([]);
  const [warnings, setWarnings] = useState<any[]>([]);
  const [compiling, setCompiling] = useState<boolean>(true);
  const [compilingServers, setCompilingServers] = useState<string[]>([]);

  useEffect(() => {
    pubsub.sub(WebpackAspect.id, (event: BitBaseEvent<any>) => {
      if (event.type === WebpackCompilationDoneEvent.TYPE) {
        setErrors(event.data.stats.compilation.errors);
        setWarnings(event.data.stats.compilation.warnings);
        setCompiling(false);
        setCompilingServers(removeFromArray(event.data.devServerID, compilingServers));
      }

      if (event.type === WebpackCompilationStartedEvent.TYPE) {
        setErrors([]);
        setWarnings([]);
        setCompiling(true);
        setCompilingServers(compilingServers.concat([event.data.devServerID]));
      }
    });
  });

  return {
    errors,
    warnings,
    compiling,
    compilingServers,
  };
}

function removeFromArray<T>(value: T, array: T[]) {
  const index = array.indexOf(value);
  if (index !== -1) {
    array.splice(index, 1);
  }

  return array;
}
