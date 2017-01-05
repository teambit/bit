#!/usr/bin/env bash


SHA=$( curl -s $1 |shasum -b -a 256| cut -d ' ' -f 1 )
sed -i.bak 's#sha256 ""#sha256 "'${SHA}'"#' ./bit.rb
sed -i.bak 's#url ""#url "'$1'"#' ./bit.rb