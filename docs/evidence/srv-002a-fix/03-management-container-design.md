# 03 — Management Container Design

## Target Configuration

| Setting | Value |
|---------|-------|
| Container name | aidilam-management |
| Image | aidilam-management:latest (custom build) |
| Base OS | Ubuntu 24.04 LTS |
| Network mode | host |
| Restart policy | unless-stopped |
| Privileged | false |
| Docker socket | /var/run/docker.sock:/var/run/docker.sock |
| /opt mount | /opt:/opt |
| /data mount | Not mounted (pending host validation) |
| Working directory | /opt/aidilam |
| security_opt | no-new-privileges:true |
| stdin_open | true |
| tty | true |

## Docker Identity

```yaml
labels:
  com.aidilam.role: management
  com.aidilam.owner: operations
  com.aidilam.application-service: "false"
```

## Installed Packages

| Package | Purpose |
|---------|---------|
| docker-ce-cli | Docker CLI for managing containers |
| docker-compose-plugin | Docker Compose v2 |
| git | Version control |
| openssh-client | Git remote access (SSH) |
| build-essential | Native module compilation |
| tmux | Terminal multiplexing |
| curl | HTTP client |
| ca-certificates | TLS trust |
| unzip | Archive extraction |
| wget | File downloads |
| jq | JSON processing |
| iputils-ping | Network diagnostics |
| dnsutils | DNS resolution |
| net-tools | Network utilities |
| vim-tiny | Text editing |
| NVM + Node.js v24 | Kiro CLI runtime |
| Kiro CLI | AI development assistant |

## Configuration Files

| File | Location |
|------|----------|
| Dockerfile | /opt/aidilam/ops/management-container/Dockerfile |
| compose.yaml | /opt/aidilam/ops/management-container/compose.yaml |
| .env.example | /opt/aidilam/ops/management-container/.env.example |
| README.md | /opt/aidilam/ops/management-container/README.md |
| validate script | /opt/aidilam/ops/management-container/validate-management-container.sh |
| rollback script | /opt/aidilam/ops/management-container/rollback-management-container.sh |
| cutover script | /opt/aidilam/ops/management-container/cutover-management-container.sh |
| .dockerignore | /opt/aidilam/ops/management-container/.dockerignore |

## Security Considerations

- Docker socket access grants host-equivalent Docker control
- Mitigated by: steering rules restricting Kiro to AIĐiLàm-owned resources only
- No Docker TCP (socket-only)
- No Docker-in-Docker
- No privileged mode
- no-new-privileges security option applied
