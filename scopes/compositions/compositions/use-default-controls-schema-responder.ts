import { useMemo, useRef, useCallback, useEffect } from 'react';
import { useAPI } from '@teambit/api-reference.hooks.use-api';

const DEFAULT_CONTROLS_REQUEST = 'composition-live-controls:request-default-controls';
const DEFAULT_CONTROLS_RESPONSE = 'composition-live-controls:default-controls';

type DefaultControlsRequestPayload = {
  id: string;
  name: string;
};

type PendingDefaultControlsRequest = {
  id: string;
  name: string;
  source: Window;
  origin: string;
};

export function useDefaultControlsSchemaResponder(componentId: string | undefined, enabled = true) {
  const pendingRequestsRef = useRef<PendingDefaultControlsRequest[]>([]);
  const apiComponentId = enabled && componentId ? componentId : undefined;

  const { apiModel } = useAPI(apiComponentId, [], { skipInternals: false });
  const schemaObject = useMemo(() => apiModel?._api?.toObject(), [apiModel]);

  const respondWithSchema = useCallback(
    (request: PendingDefaultControlsRequest) => {
      if (!schemaObject) return false;
      try {
        request.source.postMessage(
          {
            type: DEFAULT_CONTROLS_RESPONSE,
            payload: { id: request.id, name: request.name, schema: schemaObject },
          },
          request.origin || '*'
        );
        return true;
      } catch {
        return false;
      }
    },
    [schemaObject]
  );

  const onDefaultControlsRequest = useCallback(
    (event: MessageEvent) => {
      if (!enabled || !componentId) return;
      const { data } = event;
      if (!data || data.type !== DEFAULT_CONTROLS_REQUEST) return;
      const payload = data.payload as DefaultControlsRequestPayload | undefined;
      if (!payload?.id || !payload?.name) return;
      if (payload.id !== componentId) return;
      const source = event.source as Window | null;
      if (!source || source === window) return;

      const request: PendingDefaultControlsRequest = {
        id: payload.id,
        name: payload.name,
        source,
        origin: event.origin || '*',
      };

      if (!schemaObject) {
        pendingRequestsRef.current.push(request);
        return;
      }

      respondWithSchema(request);
    },
    [componentId, enabled, respondWithSchema, schemaObject]
  );

  useEffect(() => {
    if (!enabled || !componentId) {
      pendingRequestsRef.current = [];
      return;
    }
    window.addEventListener('message', onDefaultControlsRequest);
    return () => {
      window.removeEventListener('message', onDefaultControlsRequest);
    };
  }, [componentId, enabled, onDefaultControlsRequest]);

  useEffect(() => {
    if (!schemaObject || pendingRequestsRef.current.length === 0) return;
    const pending = pendingRequestsRef.current;
    pendingRequestsRef.current = [];
    pending.forEach(respondWithSchema);
  }, [schemaObject, respondWithSchema]);
}
