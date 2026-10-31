#!/usr/bin/env bash
# Builds a production-like Linux AppImage in Docker, as the publish workflow does.
# The updater is disabled (no signing key needed, no update checks). Output: build/appimage/.
set -euo pipefail

root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
workflow="$root/.github/workflows/publish.yml"
out="$root/build/appimage"
image="amber-appimage-builder"

# Reuse the workflow's pins so local builds never drift from CI.
pin() { grep -oP "^\s*$1:\s*\K\S+" "$workflow"; }
tauri_cli_rev="$(pin TAURI_CLI_REV)"
quick_sharun_rev="$(pin QUICK_SHARUN_REV)"

docker build -t "$image" \
    --build-arg TAURI_CLI_REV="$tauri_cli_rev" \
    --build-arg QUICK_SHARUN_REV="$quick_sharun_rev" \
    "$root/scripts/appimage"

mkdir -p "$out"

# Ship tracked + untracked (non-ignored) files, so uncommitted changes are included but
# the host's node_modules/target never reach the container.
git -C "$root" ls-files -coz --exclude-standard \
    | tar -C "$root" --null -T - -c \
    | docker run --rm -i \
        -v amber-appimage-npm:/root/.npm \
        -v amber-appimage-cargo:/root/.cargo/registry \
        -v amber-appimage-target:/cache/target \
        -v "$out":/out \
        -e CARGO_TARGET_DIR=/cache/target \
        -e STORE_BUILD=1 \
        -e HOST_IDS="$(id -u):$(id -g)" \
        "$image" bash -euxc '
            tar -x -C /work
            npm ci
            cargo tauri build --bundles appimage --config "{\"bundle\":{\"createUpdaterArtifacts\":false}}"
            cp /cache/target/release/bundle/appimage/*.AppImage /out/
            chown -R "$HOST_IDS" /out
        '

echo "AppImage written to $out"
