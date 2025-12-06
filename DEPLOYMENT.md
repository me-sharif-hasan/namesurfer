# Ubuntu Deployment Guide - Systemd Service

## Prerequisites

1. **Ubuntu server** with Node.js installed (v18 or higher)
2. **Git** installed
3. **PM2** or systemd for process management (we'll use systemd)

---

## Step 1: Clone and Setup on Ubuntu Server

```bash
# SSH into your Ubuntu server
ssh your-user@your-server-ip

# Install Node.js (if not installed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install build tools
sudo apt-get install -y build-essential

# Create directory for the app
sudo mkdir -p /var/www/opensubdomain
sudo chown -R $USER:$USER /var/www/opensubdomain

# Clone the repository
cd /var/www/opensubdomain
git clone git@github.com:me-sharif-hasan/namesurfer.git .

# Install dependencies
npm install

# Create production environment file
cp .env.local.example .env.local
nano .env.local  # Edit with your actual values
```

---

## Step 2: Upload Firebase Service Account

```bash
# Copy firebase-admin-key.json to server
# On your local machine:
scp firebase-admin-key.json your-user@your-server-ip:/var/www/opensubdomain/

# Or manually create it on server:
nano /var/www/opensubdomain/firebase-admin-key.json
# Paste the JSON content
```

---

## Step 3: Build the Application

```bash
cd /var/www/opensubdomain

# Build for production
npm run build

# Test if it works
npm start
# Should run on http://localhost:3000
# Press Ctrl+C to stop
```

---

## Step 4: Create Systemd Service

```bash
# Create service file
sudo nano /etc/systemd/system/opensubdomain.service
```

Paste this content:

```ini
[Unit]
Description=OpenSubdomain Next.js Application
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/opensubdomain
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=opensubdomain

# Memory limit (200MB as per your requirement)
MemoryLimit=200M

# Optional: Run with limited memory (Node.js args)
# ExecStart=/usr/bin/node --max-old-space-size=200 /var/www/opensubdomain/node_modules/.bin/next start

[Install]
WantedBy=multi-user.target
```

**Alternative with your user instead of www-data:**

```ini
[Unit]
Description=OpenSubdomain Next.js Application
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
Group=YOUR_USERNAME
WorkingDirectory=/var/www/opensubdomain
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=opensubdomain

[Install]
WantedBy=multi-user.target
```

Replace `YOUR_USERNAME` with your actual Ubuntu username.

---

## Step 5: Set Permissions

```bash
# Set ownership
sudo chown -R www-data:www-data /var/www/opensubdomain

# Or if using your user:
sudo chown -R $USER:$USER /var/www/opensubdomain

# Make sure .env.local is readable
chmod 600 /var/www/opensubdomain/.env.local
```

---

## Step 6: Enable and Start Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable opensubdomain

# Start the service
sudo systemctl start opensubdomain

# Check status
sudo systemctl status opensubdomain
```

---

## Managing the Service

### Check Status
```bash
sudo systemctl status opensubdomain
```

### View Logs
```bash
# Real-time logs
sudo journalctl -u opensubdomain -f

# Last 100 lines
sudo journalctl -u opensubdomain -n 100

# Logs from today
sudo journalctl -u opensubdomain --since today
```

### Stop Service
```bash
sudo systemctl stop opensubdomain
```

### Restart Service
```bash
sudo systemctl restart opensubdomain
```

### Disable Service
```bash
sudo systemctl disable opensubdomain
```

---

## Step 7: Setup Nginx Reverse Proxy (Recommended)

```bash
# Install Nginx
sudo apt-get install -y nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/opensubdomain
```

Paste this:

```nginx
server {
    listen 80;
    server_name private.iishanto.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:

```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/opensubdomain /etc/nginx/sites-enabled/

# Test Nginx config
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

---

## Step 8: Setup SSL with Let's Encrypt (Optional but Recommended)

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d private.iishanto.com

# Auto-renewal is set up automatically
# Test renewal
sudo certbot renew --dry-run
```

---

## Updating the Application

```bash
# Navigate to directory
cd /var/www/opensubdomain

# Pull latest changes
git pull origin main

# Install any new dependencies
npm install

# Rebuild
npm run build

# Restart service
sudo systemctl restart opensubdomain

# Check logs
sudo journalctl -u opensubdomain -f
```

---

## Troubleshooting

### Service won't start
```bash
# Check logs
sudo journalctl -u opensubdomain -n 50

# Check file permissions
ls -la /var/www/opensubdomain

# Verify Node.js version
node --version  # Should be v18+
```

### Port already in use
```bash
# Find what's using port 3000
sudo lsof -i :3000

# Kill the process
sudo kill -9 <PID>
```

### Memory issues
```bash
# Check memory usage
free -h

# Monitor the service
sudo systemctl status opensubdomain
```

### Environment variables not loading
```bash
# Verify .env.local exists
cat /var/www/opensubdomain/.env.local

# Check service can read it
sudo -u www-data cat /var/www/opensubdomain/.env.local
```

---

## Performance Monitoring

```bash
# CPU and memory usage
top -p $(pgrep -f "npm start")

# Detailed process info
ps aux | grep npm

# Service resource usage
systemctl status opensubdomain
```

---

## Quick Commands Cheat Sheet

```bash
# Start
sudo systemctl start opensubdomain

# Stop
sudo systemctl stop opensubdomain

# Restart
sudo systemctl restart opensubdomain

# Status
sudo systemctl status opensubdomain

# Logs
sudo journalctl -u opensubdomain -f

# Rebuild and restart
cd /var/www/opensubdomain && git pull && npm install && npm run build && sudo systemctl restart opensubdomain
```

---

Your app will be running at:
- **Direct**: http://your-server-ip:3000
- **With Nginx**: http://private.iishanto.com
- **With SSL**: https://private.iishanto.com

The colorful logs will be visible in journalctl! 🎉
