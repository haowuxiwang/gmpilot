#!/bin/bash
# Download NotoSerifSC-Regular.otf font for PDF generation
# Run: bash scripts/download-font.sh

FONT_DIR="resources/fonts"
FONT_FILE="$FONT_DIR/NotoSerifSC-Regular.otf"
FONT_URL="https://github.com/googlefonts/noto-cjk/raw/main/Serif/OTF/SimplifiedChinese/NotoSerifSC-Regular.otf"

mkdir -p "$FONT_DIR"

if [ -f "$FONT_FILE" ]; then
  echo "Font already exists: $FONT_FILE"
  exit 0
fi

echo "Downloading NotoSerifSC-Regular.otf..."
curl -L -o "$FONT_FILE" "$FONT_URL"

if [ -f "$FONT_FILE" ]; then
  echo "Downloaded: $FONT_FILE ($(du -h "$FONT_FILE" | cut -f1))"
else
  echo "Download failed. Please download manually from:"
  echo "  $FONT_URL"
  echo "  Place it at: $FONT_FILE"
fi
