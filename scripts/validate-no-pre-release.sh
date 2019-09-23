#!/bin/bash

echo "validating $1"
if [ $1 == $2 ]; then
  echo "Version is valid"
  exit 0;
else
  echo "Version contains pre-release tag"
  exit 1;
fi