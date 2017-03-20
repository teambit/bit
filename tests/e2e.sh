#!/bin/bash
set -ex

rm -rf /tmp/scopy

cd /tmp
mkdir scopy && cd scopy
bit init --bare
bit remote add file:///tmp/scopy --global

rm -rf /tmp/test
cd /tmp
mkdir test && cd test
bit init
bit create test
bit commit test "test commit"
bit export @this/test @scopy
