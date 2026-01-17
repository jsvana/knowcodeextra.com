#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Building frontend..."

# Install esbuild if not present
if ! command -v npx &> /dev/null; then
    echo "Error: npx not found. Install Node.js first."
    exit 1
fi

# Create static directory
mkdir -p ../static

# Bundle JSX
# Use classic JSX transform to work with CDN-loaded React globals
npx esbuild knowcodeextra.jsx \
    --bundle \
    --outfile=../static/app.js \
    --minify \
    --format=iife \
    --global-name=App \
    --loader:.jsx=jsx \
    --jsx=transform \
    --jsx-factory=React.createElement \
    --jsx-fragment=React.Fragment \
    --define:process.env.NODE_ENV=\"production\" \
    --alias:react=./react-shim.js \
    --alias:react-dom=./react-dom-shim.js

# Copy HTML
cp index.html ../static/

echo "Frontend built to ../static/"
