#! /bin/bash
# Update and install dependencies
apt-get update
apt-get install -y curl git unzip

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Install FFmpeg
apt-get install -y ffmpeg

# Install Chrome/Puppeteer dependencies
apt-get install -y ca-certificates fonts-liberation libasound2 \
    libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 \
    libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 \
    libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
    libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
    libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 \
    libxi6 libxrandr2 libxrender1 libxrender1 libxss1 libxtst6 lsb-release \
    wget xdg-utils

# Install Google Chrome Stable
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
dpkg -i google-chrome-stable_current_amd64.deb || apt-get -f install -y

# Clone Repo (Create directory)
mkdir -p /app
# We will upload code manually later
echo "Ready for code upload" > /app/status.txt
