# Constraints (Hard)

- Do not hardcode dependency package lists
- Do not disable source maps globally
- Do not use devtool: 'eval'
- Do not degrade runtime to improve boot
- Lazy compilation is acceptable only if the on-demand compile penalty is small (rspack may qualify)
- Do not change watchOptions polling without testing Docker/NFS/VM scenarios

Allowed:

- Rspack as webpack replacement (compatible API, 5x faster compilation)
- builtin:swc-loader, native CSS, HtmlRspackPlugin (rspack builtins)
- Externalization via shared bundles (browser-safe)
- esbuild/swc where compatible
- Deterministic filesystem cache improvements
- Measurement-driven bundle analysis
- Service workers for preview asset caching
- Single-iframe preview architecture (persistent iframe, swap compositions)
