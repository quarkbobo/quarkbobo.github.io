#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   sudo bash deploy-server.sh your-domain.com /var/www/Quarkbobo
DOMAIN="${1:-}"
PROJECT_ROOT="${2:-/var/www/Quarkbobo}"
APP_DIR="${PROJECT_ROOT}/xiangqi-server"

if [[ -z "${DOMAIN}" ]]; then
  echo "Missing domain. Example: sudo bash deploy-server.sh your-domain.com /var/www/Quarkbobo"
  exit 1
fi

echo "==> Installing dependencies..."
apt update
apt install -y nginx certbot python3-certbot-nginx curl

if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> Installing PM2..."
  npm install -g pm2
fi

echo "==> Installing app deps..."
cd "${APP_DIR}"
npm install

echo "==> Starting app with PM2..."
pm2 delete xiangqi-server >/dev/null 2>&1 || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root || true

echo "==> Configuring Nginx..."
cp deploy-nginx.conf.example "/etc/nginx/sites-available/xiangqi-server"
sed -i "s/your-domain.com/${DOMAIN}/g" "/etc/nginx/sites-available/xiangqi-server"
ln -sf "/etc/nginx/sites-available/xiangqi-server" "/etc/nginx/sites-enabled/xiangqi-server"
nginx -t
systemctl restart nginx

echo "==> Enabling HTTPS..."
certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "admin@${DOMAIN}" --redirect || true
systemctl enable nginx

echo "==> Done."
echo "Health check: https://${DOMAIN}/api/health"
