#!/usr/bin/env bash
apt-get install ruby-dev -y
apt-get install -y rubygems
apt-get install rubygems-integration -y
apt-get install -y git-core curl zlib1g-dev build-essential libssl-dev libreadline-dev libyaml-dev libsqlite3-dev sqlite3 libxml2-dev libxslt1-dev libcurl4-openssl-dev python-software-properties libffi-dev
apt-get update -qq
apt-get install -y rpm lintian
gem install fpm
mkdir -p /root/.ssh
if [ ! -f /root/.ssh/id_rsa ]; then
    echo \"-----BEGIN RSA PRIVATE KEY-----\" >> /root/.ssh/id_rsa
    echo $1 >> /root/.ssh/id_rsa
    echo \"-----END RSA PRIVATE KEY-----\" >> /root/.ssh/id_rsa
fi
