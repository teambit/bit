#!/usr/bin/env bash
cd /tmp
mkdir scopy && cd scopy
bit init --bare
bit remote add file:///tmp/scopy --global

cd /tmp
mkdir test && cd test
bit init
bit create test
bit commit test "test commit"
bit export "@this/test @scopy"
