# Container Ownership

| Container | Name | Image | Status | Network | Mounts | Classification |
|-----------|------|-------|--------|---------|--------|----------------|
| 3a90ece29953 | kiro | ubuntu:24.04 | Running (41h) | host | bind:/opt→/opt | SHARED_WORKSPACE |

- **RestartCount:** 0
- **RestartPolicy:** no
- **Cmd:** `bash -c 'apt-get update && apt-get install -y curl ca-certificates unzip && curl -fsSL https://cli.kiro.dev/install | bash && exec bash'`
- **Labels:** org.opencontainers.image.version=24.04
- **Runtime stats:** CPU 49%, MEM 6.25GiB/251.8GiB (2.48%), PIDs 1453
- No AIĐiLàm-owned containers exist yet
- No Underspan-separate containers exist (runs inside kiro container)
