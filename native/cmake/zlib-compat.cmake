# Released Node's default deflate stream uses zlib's level 4-6 strategy.
# ZLIB_COMPAT preserves the ABI; this additional setting preserves that strategy.
set(WITH_NEW_STRATEGIES OFF CACHE BOOL "Preserve Node's default deflate bytes" FORCE)
