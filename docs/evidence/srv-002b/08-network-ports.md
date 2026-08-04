# Network & Ports

## Interfaces

- **lo:** 127.0.0.1/8
- **bond01:** 10.0.2.82/24 (UP)
- **docker0:** 172.17.0.1/16 (DOWN, no containers on bridge)

## Routes

- Default: via 10.0.2.254 dev bond01
- 10.0.2.0/24: bond01 (kernel)
- 172.17.0.0/16: docker0 (kernel, linkdown)

## DNS

10.0.2.1, 10.0.2.2 (search: truongthanh.com)

## Listening Ports

| Port | Proto | Binding | Service | Classification |
|------|-------|---------|---------|----------------|
| 22 | TCP | 0.0.0.0 | sshd | Infrastructure |
| 111 | TCP/UDP | 0.0.0.0 | rpcbind | NFS |
| 161 | UDP | 0.0.0.0 | snmpd | Monitoring |
| 199 | TCP | 127.0.0.1 | snmpd | Monitoring (local) |
| 2049 | TCP/UDP | 0.0.0.0 | NFS | NFS server |
| 3350 | TCP | 127.0.0.1 | xrdp-sesman | RDP (local) |
| 3389 | TCP | 0.0.0.0 | xrdp | Remote desktop |
| 4321 | TCP | 0.0.0.0 | Astro/Underspan | PROTECTED |
| 20048 | TCP/UDP | 0.0.0.0 | rpc.mountd | NFS |
| 49078,44328,40366,56963 | TCP | various | NFS dynamic | NFS |

## AIĐiLàm Candidate Ports (all FREE)

3000, 5432, 6379, 6333, 9000, 8080
