# Runtime Acceptance Checklist

Must be true before we accept perf changes:

## Core UI

- Workspace page loads and shows component cards
- Global loader dismisses in <500ms (target: <200ms)
- Env icons render after heavy query resolves (may show placeholder briefly)
- Component status indicators appear when status query resolves
- Navigation between workspace sections works

## Preview

- Preview iframe loads, no console errors
- Component compositions render correctly
- No global namespace errors
- HMR works and updates are sane (edit source → preview updates)
- First component view is fast (no "compile-on-first-view" trap)
- Source maps still work for component-authored files (where required)
- Navigation between components works (no stale iframe state)

## Rspack-Specific Checks (for rspack migration branch only)

- `builtin:swc-loader` correctly transpiles JSX/TSX
- Native CSS (`experiments.css: true`) handles component styles
- `@rspack/plugin-react-refresh` delivers HMR for React components
- `HtmlRspackPlugin` generates correct preview HTML
- sass-loader and less-loader still work through rspack (if used by env)
- Source-map-loader still produces usable maps for Bit component files
