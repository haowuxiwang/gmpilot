#!/bin/bash
# Generate app icons from SVG
# Requires: imagemagick (convert) or rsvg-convert
#
# Install on Windows: choco install imagemagick
# Install on macOS: brew install imagemagick
# Install on Linux: sudo apt install imagemagick

SVG="resources/icons/icon.svg"
ICO="resources/icons/icon.ico"
ICNS="resources/icons/icon.icns"
PNG="resources/icons/icon.png"

if [ ! -f "$SVG" ]; then
  echo "SVG not found: $SVG"
  exit 1
fi

# Generate PNG (256x256)
if command -v rsvg-convert &> /dev/null; then
  rsvg-convert -w 256 -h 256 "$SVG" -o "$PNG"
elif command -v convert &> /dev/null; then
  convert -background none -resize 256x256 "$SVG" "$PNG"
else
  echo "No converter found. Install imagemagick or librsvg."
  echo "  Windows: choco install imagemagick"
  echo "  macOS: brew install imagemagick"
  echo "  Linux: sudo apt install librsvg2-bin"
  exit 1
fi

echo "Generated: $PNG"

# Generate ICO (Windows)
if command -v convert &> /dev/null; then
  convert -background none -resize 256x256 "$SVG" \
    -define icon:auto-resize=256,128,96,64,48,32,16 "$ICO"
  echo "Generated: $ICO"
fi

# Generate ICNS (macOS)
if command -v iconutil &> /dev/null; then
  mkdir -p icon.iconset
  for size in 16 32 64 128 256 512; do
    rsvg-convert -w $size -h $size "$SVG" -o "icon.iconset/icon_${size}x${size}.png"
    if [ $size -le 256 ]; then
      rsvg-convert -w $((size*2)) -h $((size*2)) "$SVG" -o "icon.iconset/icon_${size}x${size}@2x.png"
    fi
  done
  iconutil -c icns icon.iconset -o "$ICNS"
  rm -rf icon.iconset
  echo "Generated: $ICNS"
fi

echo "Done!"
