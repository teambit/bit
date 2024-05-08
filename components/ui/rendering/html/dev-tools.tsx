import React from 'react';

export function CrossIframeDevTools() {
  return (
    <script>
      {'/* Allow to use react dev-tools inside the examples */\n'}
      {'try { window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = window.parent.__REACT_DEVTOOLS_GLOBAL_HOOK__; } catch {}'}
    </script>
  );
}
