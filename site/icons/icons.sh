#!/bin/bash

# Create icons directory
mkdir -p icons

echo "🎨 Creating app icons..."

# Create main 512x512 icon with modern design
convert -size 512x512 \
  gradient:"#667eea-#764ba2" \
  \( -size 400x400 xc:none \
     -fill "rgba(255,255,255,0.95)" \
     -draw "roundrectangle 50,50 350,350 40,40" \
  \) \
  -gravity center -composite \
  \( -fill "#2c3e50" \
     -font Arial-Bold -pointsize 120 \
     -gravity center \
     -annotate +0-40 '$' \
  \) \
  -composite \
  \( -fill "#27ae60" \
     -font Arial-Bold -pointsize 40 \
     -gravity center \
     -annotate +0+60 'TRACK' \
  \) \
  -composite \
  icons/icon-512x512.png

echo "📱 Generating standard app icons..."

# Generate all standard icon sizes
convert icons/icon-512x512.png -resize 384x384 icons/icon-384x384.png
convert icons/icon-512x512.png -resize 192x192 icons/icon-192x192.png
convert icons/icon-512x512.png -resize 152x152 icons/icon-152x152.png
convert icons/icon-512x512.png -resize 144x144 icons/icon-144x144.png
convert icons/icon-512x512.png -resize 128x128 icons/icon-128x128.png
convert icons/icon-512x512.png -resize 96x96 icons/icon-96x96.png
convert icons/icon-512x512.png -resize 72x72 icons/icon-72x72.png

# iOS specific icons
convert icons/icon-512x512.png -resize 180x180 icons/apple-touch-icon.png
convert icons/icon-512x512.png -resize 167x167 icons/icon-167x167.png

# Favicon sizes
convert icons/icon-512x512.png -resize 32x32 icons/favicon-32x32.png
convert icons/icon-512x512.png -resize 16x16 icons/favicon-16x16.png

echo "🍎 Creating iOS splash screens..."

# Simplified function to create splash screen
create_splash() {
    local width=$1
    local height=$2
    local filename=$3
    
    echo "Creating ${filename} (${width}x${height})..."
    
    # Create gradient background
    convert -size ${width}x${height} gradient:"#667eea-#764ba2" /tmp/bg.png
    
    # Create icon overlay
    convert -size 200x200 xc:none \
        -fill "rgba(255,255,255,0.9)" \
        -draw "roundrectangle 20,20 180,180 20,20" \
        -fill "#2c3e50" \
        -font Arial-Bold -pointsize 60 \
        -gravity center \
        -annotate +0-20 '$' \
        -fill "#27ae60" \
        -font Arial-Bold -pointsize 20 \
        -gravity center \
        -annotate +0+30 'TRACK' \
        /tmp/icon_overlay.png
    
    # Create text overlay
    convert -size ${width}x100 xc:none \
        -fill "rgba(255,255,255,0.9)" \
        -font Arial-Bold -pointsize 24 \
        -gravity center \
        -annotate +0+0 'Expense Tracker' \
        /tmp/text_overlay.png
    
    # Composite everything together
    convert /tmp/bg.png \
        /tmp/icon_overlay.png -gravity center -geometry +0-50 -composite \
        /tmp/text_overlay.png -gravity center -geometry +0+150 -composite \
        icons/${filename}
    
    # Clean up temp files
    rm -f /tmp/bg.png /tmp/icon_overlay.png /tmp/text_overlay.png
}

# iOS Splash Screen Sizes
create_splash 2048 2732 "apple-splash-2048-2732.png"
create_splash 1668 2388 "apple-splash-1668-2388.png"
create_splash 1536 2048 "apple-splash-1536-2048.png"
create_splash 1125 2436 "apple-splash-1125-2436.png"
create_splash 1242 2688 "apple-splash-1242-2688.png"
create_splash 828 1792 "apple-splash-828-1792.png"
create_splash 1242 2208 "apple-splash-1242-2208.png"
create_splash 750 1334 "apple-splash-750-1334.png"
create_splash 640 1136 "apple-splash-640-1136.png"
