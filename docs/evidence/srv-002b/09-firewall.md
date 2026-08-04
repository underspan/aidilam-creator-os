# Firewall

- **firewalld:** NOT AVAILABLE (not installed or not running)
- **iptables policies:** INPUT ACCEPT, FORWARD DROP, OUTPUT ACCEPT
- **Docker chains present:** DOCKER, DOCKER-ISOLATION-STAGE-1/2, DOCKER-USER
- **DOCKER-USER:** empty (returns immediately)
- **NAT:** Docker masquerade for 172.17.0.0/16
- **No restrictive INPUT rules**

## Assessment

Host is wide open on INPUT. AIĐiLàm containers will be accessible on their exposed ports without additional firewall configuration. Consider adding INPUT restrictions for production.
