#!/bin/bash

echo "compare $1 to $2"
if [ $1 == $2 ]; then
  echo "Versions match"
  exit 0;
else
  echo "Versions not match"
  exit 1;
fi