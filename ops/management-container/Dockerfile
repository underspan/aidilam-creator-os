# =============================================================================
# AIĐiLàm Management Container
# Ubuntu 24.04 LTS — Operational Workspace
#
# This container is NOT an application service.
# It provides CLI tools for managing the AIĐiLàm Docker Compose project.
# =============================================================================

FROM ubuntu:24.04

LABEL com.aidilam.role="management"
LABEL com.aidilam.owner="operations"
LABEL com.aidilam.application-service="false"
LABEL description="AIĐiLàm Ubuntu Management Container — operational workspace"

# Avoid interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive

# =============================================================================
# System packages
# =============================================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Core utilities
    curl \
    ca-certificates \
    gnupg \
    unzip \
    wget \
    jq \
    # Version control
    git \
    # SSH client (for Git remote access)
    openssh-client \
    # Build essentials (for native node modules if needed)
    build-essential \
    # Process management
    tmux \
    # Network diagnostics
    iputils-ping \
    dnsutils \
    net-tools \
    # Editor
    vim-tiny \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Docker CLI and Docker Compose v2
# Install from official Docker repository — CLI only, no daemon
# =============================================================================
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu noble stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       docker-ce-cli \
       docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# NVM and Node.js (for Kiro CLI runtime)
# =============================================================================
ENV NVM_DIR=/root/.nvm
ENV NODE_VERSION=24

RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash \
    && . "$NVM_DIR/nvm.sh" \
    && nvm install ${NODE_VERSION} \
    && nvm alias default ${NODE_VERSION} \
    && nvm use default

# Add NVM to PATH for non-interactive shells
ENV PATH="/root/.nvm/versions/node/v${NODE_VERSION}/bin:${PATH}"

# =============================================================================
# Kiro CLI
# Installed via official installer script
# =============================================================================
RUN curl -fsSL https://cli.kiro.dev/install | bash

# Ensure kiro-cli is on PATH
ENV PATH="/root/.local/bin:${PATH}"

# =============================================================================
# Shell configuration
# =============================================================================
RUN echo 'export PATH="$HOME/.local/bin:$PATH"' >> /root/.bashrc \
    && echo 'export NVM_DIR="$HOME/.nvm"' >> /root/.bashrc \
    && echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> /root/.bashrc \
    && echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"' >> /root/.bashrc \
    && echo 'export DOCKER_HOST=unix:///var/run/docker.sock' >> /root/.bashrc

# =============================================================================
# Working directory
# =============================================================================
WORKDIR /opt/aidilam

# =============================================================================
# Default command — interactive bash session
# =============================================================================
CMD ["bash"]
