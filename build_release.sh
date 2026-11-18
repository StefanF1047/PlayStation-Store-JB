#!/bin/bash
# Store Installer - Versioned Release Build Script
# Release tree marker: v1.0.0

# 1. Compute full version (stable = base, dev = base + build type + git hash/timestamp)
VERSION=$(python3 tools/gen_version.py --print)

if [ -z "$VERSION" ]; then
    echo "Error: Could not compute version"
    exit 1
fi

# Product branding lives in branding.json (name / ELF prefix).
BRAND_NAME=$(python3 tools/branding.py --get name)
BRAND_PREFIX=$(python3 tools/branding.py --get elf_prefix)
STORE_ELF=$(make -s print-store-elf)
PUBLISH_ELF="${BRAND_PREFIX}_payload.elf"
HOST_PY="store-host_v${VERSION}.py"
IMAGE_NAME="ps5-webkit-autoloader-sdk"

echo "--- Building ${BRAND_NAME} Installer v$VERSION ---"

# 2. Remove old versioned artifacts
rm -f "${BRAND_PREFIX}_V"*.elf "${BRAND_PREFIX}_Restore_V"*.elf "${BRAND_PREFIX}_Clean_V"*.elf "$PUBLISH_ELF"
echo "      Removed old artifacts (${BRAND_PREFIX}_*.elf, ${PUBLISH_ELF})"

# 3. Build/verify the docker image (includes librsvg for image generation)
if [[ "$(docker images -q $IMAGE_NAME 2> /dev/null)" == "" ]]; then
    echo "      Docker image $IMAGE_NAME not found. Building... (this may take a few minutes)"
    docker build -t $IMAGE_NAME -f Dockerfile.sdk .
    if [ $? -ne 0 ]; then
        echo "      !!! Docker image build FAILED!"
        exit 1
    fi
    echo "      Docker image built successfully."
fi

# 4. Build native ELF via Docker (generates image assets + file registry as deps)
#    Note: docker does NOT inherit the host environment, so BUILD_TYPE,
#    FORCE_EXPLOIT and CUSTOM_VERSION must be passed explicitly or defaults
#    ("dev"/"auto"/empty) apply.
echo "[1/2] Building native ELF via Docker..."
docker run --rm -u "$(id -u):$(id -g)" -e "BUILD_TYPE=${BUILD_TYPE:-dev}" -e "FORCE_EXPLOIT=${FORCE_EXPLOIT:-auto}" -e "CUSTOM_VERSION=${CUSTOM_VERSION:-}" -v "$(pwd)":/src -w /src $IMAGE_NAME make clean store

if [ $? -ne 0 ]; then
    echo "      !!! ELF build FAILED!"
    exit 1
fi

if [ -f "$STORE_ELF" ]; then
    cp -f "$STORE_ELF" "$PUBLISH_ELF"
    echo "      Created versioned binary: $STORE_ELF"
    echo "      Published name copy: $PUBLISH_ELF"
else
    echo "      !!! $STORE_ELF not found after build!"
    exit 1
fi

# 5. Build standalone store host .py with the frontend embedded.
#    HOST_PAYLOAD points at the versioned installer ELF built in step 4 (the
#    PC host serves it as the autoload payload instead of the bundled one).
echo "[2/2] Building store host script (embedded frontend)..."
make host HOST_PAYLOAD="$STORE_ELF"
if [ $? -ne 0 ]; then
    echo "      !!! host script build FAILED!"
    exit 1
fi
mv webkit-autoloader-host.py "$HOST_PY"
echo "      Created: $HOST_PY"

echo "--- Build Complete! ---"
echo "Note: publish $PUBLISH_ELF on GitHub Releases."
ls -la "$STORE_ELF" "$PUBLISH_ELF" "$HOST_PY"

