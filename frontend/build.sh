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
npx esbuild knowcodeextra.jsx \
    --bundle \
    --outfile=../static/app.js \
    --minify \
    --format=iife \
    --global-name=App \
    --external:react \
    --external:react-dom \
    --loader:.jsx=jsx \
    --jsx=automatic \
    --jsx-import-source=react

# Copy HTML
cp index.html ../static/

echo "Frontend built to ../static/"
