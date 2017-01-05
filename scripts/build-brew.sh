#!/bin/bash

set -ex

PACKAGE_TMPDIR=../distribution/brew_pkg
VERSION=$(cat ../package.json | grep version | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | xargs echo -n)
TARBALL_NAME=../bit-$VERSION.tar.gz
tarName="bit_${VERSION}_brew.tar.gz"

if [ ! -e $TARBALL_NAME ]; then
  echo "Hey! Listen! You need to run build-dist.sh first."
  exit 1
fi;


# Extract to a temporary directory
rm -rf $PACKAGE_TMPDIR
mkdir -p $PACKAGE_TMPDIR/bit
umask 0022 # Ensure permissions are correct (0755 for dirs, 0644 for files)
tar zxf $TARBALL_NAME -C $PACKAGE_TMPDIR/bit
PACKAGE_TMPDIR_ABSOLUTE=$(cd $(dirname ".") && pwd -P)/$PACKAGE_TMPDIR/bit/


#### Build DEB (Debian, Ubuntu) package
node ./set-installation-method.js $PACKAGE_TMPDIR_ABSOLUTE/package.json homebrew
cd $PACKAGE_TMPDIR_ABSOLUTE
#eval "$FPM --output-type tar  --architecture noarch --depends nodejs --category 'Development/Languages' ."
eval tar --exclude='./Jenkinsfile' --exclude='./scripts/' -zcvf ${tarName}  *
shasum -a 256 ${tarName}
mv ${tarName} ../
rm -rf ../bit

