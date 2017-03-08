# Installation

## Using NPM

If you have NPM installed, you can use it to install Bit: (recommended)

`npm install bit-bin --global `


## Using brew (macOS)

Homebrew - Bit can be installed via Homebrew package manager:

`brew install bit`

## Debian/Ubuntu Linux

On Debian or Ubuntu Linux, you can install Bit via our Debian package repository. Configure it using this command

```
curl https://bitsrc.jfrog.io/bitsrc/api/gpg/key/public | sudo apt-key add -
sudo sh -c "echo 'deb http://bitsrc.jfrog.io/bitsrc/bit-deb all main' >> /etc/apt/sources.list"
```

Then simply install using

`sudo apt-get update && sudo apt-get install bit`

## CentOS / Fedora / RHEL

On CentOS, Fedora and RHEL, you can install Bit via our RPM package repository.

`sudo wget http://assets.bitsrc.io/bitsrc.repo -O /etc/yum.repos.d/bitsrc.repo`

Then simply install using

`sudo yum install bit`

## installer/Chocolatey (Windows)

(currently unavailable)

## Tarball Release

You can simply download the application packages in a tarball
[here](https://api.bitsrc.io/release/tar/latest).

## Using Yarn

If you have Yarn installed, you can use it to install Bit:

`yarn global add bit-bin`
