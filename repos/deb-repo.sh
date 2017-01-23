#!/usr/bin/env bash

#add gpg key
curl http://104.154.76.155:8081/artifactory/api/gpg/key/public | sudo apt-key add -

#add source
sudo sh -c "echo 'deb http://104.154.76.155:8081/artifactory/bit-deb all main' >> /etc/apt/sources.list"

