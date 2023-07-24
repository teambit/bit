
# Docker 容器运行 bit harmony

_这些 Docker 容器不处理旧版的 bit (pre-harmony),对于旧版的 bit 请参考 [bit-docker](https://github.com/teambit/bit-docker)_

## 结构

- Dockerfile-bit：一个安装 bvm 然后使用 bvm 安装 bit 的 Dockerfile。这个 Docker 通常用来在 CI 机器上运行如 tag 和 export 的 bit 命令。
- Dockerfile-bit-server：基于 `Dockerfile-bit` 的 Dockerfile。它创建一个空的 scope，并在其上初始化 bit 服务器 (bit start)。
- Dockerfile-symphony：仅供内部使用。

## 从 Dockerhub 使用

Docker 镜像托管在 Dockerhub，链接是 [Dockerfile-bit](https://hub.docker.com/r/bitcli/bit) 和 [Dockerfile-bit-server](https://hub.docker.com/r/bitcli/bit-server)。

## 本地构建

1. `cd scripts/docker-teambit-bit`
2. 首先构建 bit docker - `docker build -f ./Dockerfile-bit -t bitcli/bit:latest .`
3. 其次构建 bit server docker - `docker build -f ./Dockerfile-bit-server -t bitcli/bit-server:latest .`

## 运行容器

### 运行 cli 容器

1. `docker run -it bitcli/bit:latest /bin/bash`
2. `bit -v` 查看 bit 版本以确保工作正常。

### 运行 server 容器 

1. `docker run -it -p {host-port}:3000 bitcli/bit-server:latest` - 将 `{host-port}` 替换为主机要使用的端口，例如 5000。
2. 浏览 `http://localhost:{host-port}` 并确保可以看到 bit 的界面。

## 导出组件到 bit 服务器

1. 确保运行了 server 容器并验证它可用。
2. 在本地工作空间运行 `bit remote add http://localhost:{host-port}`，应该会看到 remote-scope 已添加的消息。
3. 在 `workspace.jsonc` 中将 `remote-scope` 设为 `defaultScope`。
4. 运行 `bit export`。

## 高级用法

### 在 bit 服务器上使用特定版本的 bit

Bit 服务器会读取一个用于 `FROM` 语句的参数 `BIT_VERSION`。你可以通过 `docker build -f ./Dockerfile-bit-server --build-arg BIT_VERSION={version} -t bitcli/bit-server:{version} .` 来使用它。这会让你的服务器从 Dockerhub 获取指定版本的 cli 容器。

### 改变 server 容器上的空 scope 名称和位置

scope 的名称由包含 scope 的文件夹名称定义(默认为 `remote-scope`)。这个名称后来会被设置于 `workspace.jsonc` 文件中。如果要更改，可以传递名为 `SCOPE_PATH` 的构建参数，如 `--build-arg SCOPE_PATH=/root/custom-remote-scope`。

### 通过 volume 确保数据持久化

为了使 scope 数据持久化，你需要将 scope 文件夹放置在容器外的主机上。你可以通过[绑定挂载](https://docs.docker.com/storage/bind-mounts/)来实现：`docker run -it -v {scope-path-on-host}:/root/remote-scope -p {host-port}:3000 bitcli/bit-server:latest`。

_通常使用 volume 比绑定挂载好，甚至可以由诸如 Kubernetes 之类的编排器来处理挂载，但这超出了本指南讨论的范围。_

### 将 scope volume 和 scope 名称/位置相绑定

当同时更改 scope 名称/位置和 volume 时，你需要确保构建参数 `SCOPE_PATH` 中提供的位置与 volume 中的目标匹配：`docker run -it -v {scope-path-on-host}:/root/custom-remote-scope -build-arg SCOPE_PATH=/root/custom-remote-scope -p {host-port}:3000 bitcli/bit-server:latest`。请注意 `/root/custom-remote-scope` 既用在了 `-v` 参数的 `:` 之后，又用于了 `SCOPE_PATH` 的值。

### 在主机上观察 bit 服务器日志

由于目前 `bit start` 命令无法以分离方式运行，因此需要一种方法同时将其作为主命令运行且监控日志。为此，我们将使用[绑定挂载](https://docs.docker.com/storage/bind-mounts/)将容器上的日志目录连接到主机上的目录。为了观察 bit 日志，你需要挂载主机上的日志目录，如：`docker run -it -v {logs-dir-on-host}:/root/Library/Caches/Bit/logs -p {host-port}:3000 bitcli/bit-server:latest`。举一个实际的例子 (在主机上使用 `/root/bit-server-docker-logs` 作为日志目录，主机端口为 5000)：`docker run -it -v /root/bit-server-docker-logs:/root/Library/Caches/Bit/logs -p 5000:3000 bitcli/bit-server:latest`。

_在大多数情况下，最好对此使用 [tmpfs 挂载](https://docs.docker.com/storage/tmpfs/)，但这也超出了本指南讨论的范围。_

## 重要提示

- 不要将同一个 scope 目录挂载到多个 bit server 容器上。  
  Bit 使用不同的内存缓存机制，因此将同一目录挂载到不同的服务器实例上可能会产生不可预测的结果。

## 故障排除

- **问题**：在 server 容器上运行 bit start 时被杀死，代码为 137。  
  **解决方案**：增加主机提供的内存量 (通常 4GB 就足够了——这也是我们为节点进程提供的内存大小 `NODE_OPTIONS=--max_old_space_size=4096`)。例如在 Mac 上：[docker for mac resources](https://docs.docker.com/docker-for-mac/#resources)。
