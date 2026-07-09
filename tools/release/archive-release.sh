#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(node -e "const fs = require('node:fs'); process.stdout.write(JSON.parse(fs.readFileSync('project-version.json', 'utf8')).version)")"
DIST_DIR="${DIST_DIR:-$ROOT_DIR/dist}"
RELEASE_DIR="${RELEASE_DIR:-$ROOT_DIR/release}"
BUNDLE_DIR="$RELEASE_DIR/civ6-ai-copilot-release"
WORK_DIR="$DIST_DIR/work"

if ! command -v zip >/dev/null 2>&1; then
  echo "release:dist requires zip in PATH." >&2
  exit 2
fi

cleanup() {
  rm -rf "$WORK_DIR" "$BUNDLE_DIR"
}
trap cleanup EXIT

rm -rf "$DIST_DIR" "$BUNDLE_DIR"
mkdir -p "$DIST_DIR" "$WORK_DIR"

npm run rc:check -- --format markdown > "$DIST_DIR/rc-check.md"

npm run release:package -- --output-dir "$RELEASE_DIR" --clean
npm run release:validate -- --bundle-dir "$BUNDLE_DIR"

copy_and_zip() {
  local source_dir="$1"
  local artifact_name="$2"
  local staged_dir="$WORK_DIR/$artifact_name"

  cp -R "$source_dir" "$staged_dir"
  (
    cd "$WORK_DIR"
    zip -qr "$DIST_DIR/$artifact_name.zip" "$artifact_name"
  )
}

copy_and_zip "$BUNDLE_DIR" "civ6-ai-copilot-release-v$VERSION"
copy_and_zip "$BUNDLE_DIR/mod/civ6-ai-copilot" "civ6-ai-copilot-mod-v$VERSION"
copy_and_zip "$BUNDLE_DIR/skill/civ6-ai-copilot" "civ6-ai-copilot-skill-v$VERSION"

cp "$BUNDLE_DIR/civ6-ai-copilot-release-manifest.json" "$DIST_DIR/civ6-ai-copilot-release-manifest-v$VERSION.json"

(
  cd "$DIST_DIR"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum *.zip *.json rc-check.md > checksums.txt
  else
    shasum -a 256 *.zip *.json rc-check.md > checksums.txt
  fi
)

echo "Release artifacts written to $DIST_DIR"
