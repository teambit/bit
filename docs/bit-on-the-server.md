# Bit on the Server

// TODO

## The protocols

// TODO

### The Local Protocol

// TODO


### The SSH Protocol

A common transport protocol for Bit when self-hosting is over SSH. This is because SSH access to servers is already set up in most places – and if it isn’t, it’s easy to do. SSH is also an authenticated network protocol; and because it’s ubiquitous, it’s generally easy to set up and use.

## Setting up a server

// TODO

## Generating your SSH public key

These docs will describe the process of creating SSH key pair for Unix, seeing that it's a similar process across all operating systems.

1. Use this command to generate a new SSH key pair

  `ssh-keygen -t rsa -b 4096 -C "your_email@example.com"`

2. View the content of `~/.ssh` directory, and look for a pair of files named `id_rsa` and `id_rsa.pub`.

3. Copy the content of the `id_rsa.pub`, and add it to your server's `authorized_keys`.
