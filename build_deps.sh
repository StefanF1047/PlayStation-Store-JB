#!/usr/bin/env bash
# Dependency build script for the PS5 Payload SDK (libmicrohttpd only)
# Release tree marker: v1.0.0
#
# Usage:
#   bash build_deps.sh                       # installs into /opt/ps5-payload-sdk
#   SDK=$HOME/.local/ps5-payload-sdk bash build_deps.sh
#   make dependencies SDK=/path/to/sdk       # same thing
set -e

SDK="${SDK:-/opt/ps5-payload-sdk}"
export PATH="$SDK/bin:$PATH"

TEMPDIR=$(mktemp -d)
trap 'rm -rf -- "$TEMPDIR"' EXIT

cd $TEMPDIR

# Common compiler tools mapped to SDK wrappers
export CC=prospero-clang
export CXX=prospero-clang++
export AR=prospero-ar
export NM=prospero-nm
export RANLIB=prospero-ranlib

echo "=== Building libmicrohttpd 1.0.1 for $SDK ==="
wget -O libmicrohttpd.tar.gz https://ftp.gnu.org/gnu/libmicrohttpd/libmicrohttpd-1.0.1.tar.gz
tar xf libmicrohttpd.tar.gz
cd libmicrohttpd-1.0.1
./configure --host=x86_64-pc-freebsd12 \
            --disable-shared --enable-static \
            --disable-curl --disable-examples \
            --disable-dependency-tracking \
            --prefix="$SDK/target"
make -j$(nproc)
make install

echo "libmicrohttpd successfully built and installed into $SDK/target"
