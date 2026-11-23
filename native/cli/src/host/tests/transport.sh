#!/bin/sh
# This executable is immutable while tests run; only per-session response data is written.
[ -s "$1" ] || exit 2
printf '%s\n' "$1" > "$4/host-path"
IFS= read -r request
IFS= read -r response < "$4/response"
printf '%s\n' "$response"
IFS= read -r end
