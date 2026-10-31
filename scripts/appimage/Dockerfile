# Mirrors the ubuntu-24.04 job of .github/workflows/publish.yml for local AppImage builds.
FROM ubuntu:24.04

ARG TAURI_CLI_REV
ARG QUICK_SHARUN_REV
ARG PROTOC_VERSION=29.3
ENV DEBIAN_FRONTEND=noninteractive

# Beyond the workflow's packages: CEF's runtime libraries and xvfb, which GitHub runners preinstall
# and quick-sharun needs to trace libcef.so's dependencies.
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl git build-essential pkg-config libssl-dev file ca-certificates unzip \
        libgtk-4-dev librsvg2-dev patchelf \
        xvfb xauth libnss3 libnspr4 libasound2t64 libxss1 libgbm1 libxkbcommon0 \
        libatk-bridge2.0-0t64 libatk1.0-0t64 libcups2t64 libxcomposite1 libxdamage1 libxrandr2 \
        libxfixes3 libpango-1.0-0 libcairo2 libdrm2 libdbus-1-3 libxshmfence1 libgtk-3-0t64 \
        libvulkan1 libegl1 libgl1 \
    && curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSLo /tmp/protoc.zip "https://github.com/protocolbuffers/protobuf/releases/download/v${PROTOC_VERSION}/protoc-${PROTOC_VERSION}-linux-x86_64.zip" \
    && unzip -o /tmp/protoc.zip -d /usr/local && rm /tmp/protoc.zip

ENV PATH="/root/.cargo/bin:${PATH}"
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal

# Same source-built, patched Tauri CLI as the workflow's "install tauri CLI from source" step.
RUN src=/tmp/tauri \
    && git clone --filter=blob:none https://github.com/tauri-apps/tauri "$src" \
    && git -C "$src" checkout "$TAURI_CLI_REV" \
    && f="$src/crates/tauri-bundler/src/bundle/linux/appimage/sharun_cef.rs" \
    && linux="$src/crates/tauri-bundler/src/bundle/linux" \
    && sed -i "s|[A-Za-z]*/Anylinux-AppImages/refs/heads/main/useful-tools/quick-sharun.sh|pkgforge-dev/Anylinux-AppImages/$QUICK_SHARUN_REV/useful-tools/quick-sharun.sh|" "$f" \
    && grep -q "pkgforge-dev/Anylinux-AppImages/$QUICK_SHARUN_REV/useful-tools/quick-sharun.sh" "$f" \
    && sed -i -e '/^\s*\/\/ ANGLE support$/d' -e '/^\s*"libEGL\.so",$/d' -e '/^\s*"libGLESv2\.so",$/d' "$f" "$linux/debian.rs" "$linux/rpm.rs" \
    && ! grep -q 'libEGL\|libGLESv2' "$f" "$linux/debian.rs" "$linux/rpm.rs" \
    && cargo install --path "$src/crates/tauri-cli" --locked \
    && rm -rf "$src" /root/.cargo/registry /root/.cargo/git

WORKDIR /work
