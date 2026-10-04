#!/bin/sh
# Run the repository version against the configured relay and local Jev pilot.
set -eu
cd "$(dirname "$0")"
export REGISTRY_FILE="${REGISTRY_FILE:-$PWD/registry/chains-v01.json}"
exec node director/director.mjs
