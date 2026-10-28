#!/usr/bin/env bash
# Exercise Dylint's exact clone form against isolated local repositories.
set -euo pipefail
script_dir=$(cd "$(dirname "$0")" && pwd)
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT
real_git=$(command -v git)
export DYLINT_REAL_GIT=$real_git
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0="url.file://$tmp_dir/source.insteadOf"
export GIT_CONFIG_VALUE_0=https://github.com/rust-lang/rust-clippy
"$real_git" init --quiet -b main "$tmp_dir/source"
"$real_git" -C "$tmp_dir/source" -c user.name=Example -c user.email=example@example.invalid commit --quiet --allow-empty -m first
"$script_dir/dylint-git.sh" clone https://github.com/rust-lang/rust-clippy "$tmp_dir/main-clone" --quiet
[[ $("$real_git" -C "$tmp_dir/main-clone" rev-parse master) == $("$real_git" -C "$tmp_dir/source" rev-parse main) ]]
"$real_git" -C "$tmp_dir/source" branch master
"$real_git" -C "$tmp_dir/source" -c user.name=Example -c user.email=example@example.invalid commit --quiet --allow-empty -m second
"$script_dir/dylint-git.sh" clone https://github.com/rust-lang/rust-clippy "$tmp_dir/master-clone" --quiet
[[ $("$real_git" -C "$tmp_dir/master-clone" rev-parse master) == $("$real_git" -C "$tmp_dir/source" rev-parse master) ]]
"$script_dir/dylint-git.sh" clone "$tmp_dir/source" "$tmp_dir/other-clone" --quiet
! "$real_git" -C "$tmp_dir/other-clone" show-ref --verify --quiet refs/heads/master
"$script_dir/dylint-git.sh" --version >/dev/null
