#!/usr/bin/env bash
apt-get install ruby-dev -y
apt-get install -y rubygems
#apt-get install rubygems-integration -y
#apt-get install -y git-core curl zlib1g-dev build-essential libssl-dev libreadline-dev libyaml-dev libsqlite3-dev sqlite3 libxml2-dev libxslt1-dev libcurl4-openssl-dev python-software-properties libffi-dev
apt-get update -qq
apt-get install -y rpm lintian
gem install fpm
apt-get install fakeroot -y
npm install -g bit-bin
