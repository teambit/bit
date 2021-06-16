Docker containers for bit harmony.

_This dockers are not dealing with legacy bit (pre-harmony) for legacy bit please refer to [bit-docker](https://github.com/teambit/bit-docker)_

## Structure

- Dockerfile-bit: A docker file which installs bvm and then use bvm to install bit. this docker is usually useful for runnig bit commands like tag and export on CI machine
- Dcokerfil-bit-server: A docker file based on the `Dockerfile-bit` (using from) which create a bare scope, and initialized the bit server on it (bit start)
- Dockerfile-symphony: for internal use only

## Using from dockerhub

The docker images hosted on dockerhub on those links [Dockerfile-bit](https://hub.docker.com/repository/docker/bitcli/bit) and [Dockerfile-bit-server](https://hub.docker.com/repository/docker/bitcli/bit-server)

## Building locally

1. `cd scripts/docker-teambit-bit`
1. first build the bit docker - `docker build -f ./Dockerfile-bit -t bitcli/bit:latest .`
1. second build the bit server docker - `docker build -f ./Dockerfile-bit-server -t bitcli/bit-server:latest .`

## Running containers

### Run the cli container

1. `docker run -it bitcli/bit-server:latest /bin/bash`
1. `bit -v` to see bit's version to make sure it works

### Run the server container

1. `docker run -it -p {host-port}:3000 bitcli/bit-server:latest` - replace the host port with the port you want to use on your host machine for example 5000
1. browse `http://localhost:{host-port}` and make sure you see the bit's ui

## Exporting components to bit server

1. make sure you run the server container and validate it works
1. on your local workspace run `bit remote add http://localhost:{host-port}` you should get a message saying remote-scope was added
1. set `remote-scope` on your `workspace.jsonc` as `defaultScope`
1. run `bit export`

## Advanced usage

### Using specific version of bit on the bit server

Bit server is getting a `BIT_VERSION` argument which is used in the `FROM` statement. you can use it with `docker build -f ./Dockerfile-bit-server --build-arg BIT_VERSION={version} -t bitcli/bit-server:{version} .`
This will make your to fetch the cli container from dockerhub with the specificed version

### Change bare scope name and location on the server containter

The scope name is defined by the folder name of the containing scope (`remote-scope` by default).
This name is then later used for setting it up in the `workspace.jsonc` file.
In case you want to change it you can pass the build arg called `SCOPE_PATH` like `--build-arg SCOPE_PATH=/home/root/custom-remote-scope`

### Using volume to make sure data is persisted

In order to persist the scope data, you want the scope folder to be live outside the container in the host machine.
You can use [bind mounts](https://docs.docker.com/storage/bind-mounts/) to do so:
`docker run -it -v {scope-path-on-host}:/home/root/remote-scope -p {host-port}:3000 bitcli/bit-server:latest`

_Usually it's better to use volumes then bind mounts, or even handle the mounts by an orchestrator like kubernetees but this topics is out of the scope in this guide_

### Combining scope volume with scope name/location

When combining change of the scope name/location and volume you have to make sure the location provided in the `SCOPE_PATH` in the build arg is matching the target in the volume:
`docker run -it -v {scope-path-on-host}:/home/root/custom-remote-scope -build-arg SCOPE_PATH=/home/root/custom-remote-scope -p {host-port}:3000 bitcli/bit-server:latest`
See the `/home/root/custom-remote-scope` is used both in the `-v` arg after the `:` and as the `SCOPE_PATH` value.

### Watch bit server logs on host machine

Since the `bit start` command at the moment can't be run as detached, you will need a way to run it as the main command and to monitor the logs at the same time.
In order to do so, we will connect the logs dir on the container to a dir in the host using [bind mounts](https://docs.docker.com/storage/bind-mounts/).
In order to watch the bit logs, you will need to mount the logs directory in the host machine. like this:
`docker run -it -v {logs-dir-on-host}:/home/root/Library/Caches/Bit/logs -p {host-port}:3000 bitcli/bit-server:latest`
An example with actual values (use `/home/root/bit-server-docker-logs` for logs on host and port 5000 on host):
`docker run -it -v /home/root/bit-server-docker-logs:/home/root/Library/Caches/Bit/logs -p 5000:3000 bitcli/bit-server:latest`

_In most cases it make sense to use [tmpfs-mounts](https://docs.docker.com/storage/tmpfs/) for this, but this as well is out of the scope for this guide_

## Important notes:

- Do not mount the same scope directory on the host to multiple bit-server containers.
  Bit is using different in memory cache mechanism, so mount the same dir into different servers instances, might produce unpredictable outcome.

## Troubleshooting

- **problem**: running bit start on the server containter is killed with code 137
  **solution**: increase the memory provided by the host machine (usually 4GB should be enouth - this is also the value we provide for the node process by `NODE_OPTIONS=--max_old_space_size=4096`). for example in mac - [docker for mac resources](https://docs.docker.com/docker-for-mac/#resources)
