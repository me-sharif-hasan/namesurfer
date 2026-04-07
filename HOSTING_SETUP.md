# InTheSpace Free Hosting — Server Setup Guide

This document explains how to configure the server so the onboarding worker can
create Linux users, Apache vhosts, MySQL users, and disk quotas automatically.

---

## 1. Prerequisites

```bash
# Packages required on Ubuntu/Debian
sudo apt update
sudo apt install -y apache2 mysql-server quota quotatool
sudo a2enmod rewrite ssl
```

---

## 2. Sudoers Rule (Option B — Targeted sudo access)

Grant the Node.js runtime user (`www-data`, or whichever user runs Next.js) the
right to execute **only** `provision.sh` as root, without a password prompt.

> **Warning:** Replace `/home/bs01595/namesurfer` with the actual absolute path.

```bash
# Create the sudoers drop-in file
sudo visudo -f /etc/sudoers.d/namesurfer-provision
```

Add exactly this line (no trailing space):
```
www-data ALL=(root) NOPASSWD: /home/bs01595/namesurfer/scripts/provision.sh
```

If you run `worker.js` as **root via pm2**, the sudoers rule is not needed —
but running pm2 as root is also fine and simpler for a single-server setup.

Make the script executable:
```bash
chmod +x /home/bs01595/namesurfer/scripts/provision.sh
```

Verify:
```bash
sudo -u www-data sudo /home/bs01595/namesurfer/scripts/provision.sh create-user testuser123
```

---

## 3. PM2: Run worker.js as root

Install pm2 globally if not already installed:
```bash
sudo npm install -g pm2
```

Start the worker process **as root** so it can run `provision.sh` directly
(without needing the sudoers rule):

```bash
sudo pm2 start /home/bs01595/namesurfer/worker.js \
  --name onboarding-worker \
  --log /var/log/namesurfer/worker.log \
  --error /var/log/namesurfer/worker-error.log

sudo pm2 save
sudo pm2 startup   # follow the printed command to enable on boot
```

Or use a pm2 ecosystem file (`ecosystem.config.js`) for more control:

```js
// ecosystem.config.js (run: sudo pm2 start ecosystem.config.js)
module.exports = {
  apps: [
    {
      name: 'onboarding-worker',
      script: './worker.js',
      instances: 1,          // MUST be 1 — the queue is in-RTDB, not distributed
      autorestart: true,
      watch: false,
      max_restarts: 5,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```

---

## 4. Disk Quotas (500 MB per user)

Quotas require the filesystem to be mounted with `usrquota`. Edit `/etc/fstab`:

```
# Before:
/dev/sda1   /   ext4   defaults   0 1

# After:
/dev/sda1   /   ext4   defaults,usrquota   0 1
```

Remount and initialise quota database:
```bash
sudo mount -o remount /
sudo quotacheck -cum /
sudo quotaon /
```

Verify quotas work:
```bash
sudo repquota -u /
```

If the filesystem is XFS (common on newer installs), use `xfs_quota` instead —
set `QUOTA_FS` accordingly in `provision.sh`.

---

## 5. Apache: Enable required modules

```bash
sudo a2enmod rewrite headers vhost_alias
sudo systemctl restart apache2
```

Ensure Apache is set up to pick up the generated conf files:
```bash
# /etc/apache2/apache2.conf (default) includes:
# IncludeOptional sites-enabled/*.conf
# This is the default — no change needed.
```

---

## 6. MySQL: Create a root-accessible credentials

The worker uses environment variables to connect as MySQL root (for provisioning
only). Set these in your `.env.local`:

```env
MYSQL_HOST=localhost
MYSQL_ROOT_USER=root
MYSQL_ROOT_PASSWORD=your_mysql_root_password
```

If MySQL uses a socket-only root login (Ubuntu default), grant the provisioner
user access instead:

```sql
-- Run once as MySQL root
CREATE USER 'namesurfer_provisioner'@'localhost' IDENTIFIED BY 'strong_password';
GRANT CREATE, CREATE USER, GRANT OPTION ON *.* TO 'namesurfer_provisioner'@'localhost';
FLUSH PRIVILEGES;
```

Then set `MYSQL_ROOT_USER=namesurfer_provisioner` and its password in `.env.local`.

---

## 7. Email (SMTP) for OTP delivery

Add to `.env.local`:

```env
SMTP_HOST=smtp.gmail.com    # or your mail server
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@gmail.com
SMTP_PASS=your_app_password
EMAIL_FROM="InTheSpace Hosting <noreply@inthespace.online>"
```

For Gmail, generate an **App Password** at https://myaccount.google.com/apppasswords.

---

## 8. Firebase RTDB

Enable the Realtime Database in your Firebase project console, then add to `.env.local`:

```env
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app
```

Set RTDB security rules so only the server (admin SDK) can write:
```json
{
  "rules": {
    ".read": false,
    ".write": false
  }
}
```

---

## 9. Verify the full setup

```bash
# 1. Create a test Linux user
sudo /home/bs01595/namesurfer/scripts/provision.sh create-user testuser123
sudo /home/bs01595/namesurfer/scripts/provision.sh create-public-html testuser123
sudo /home/bs01595/namesurfer/scripts/provision.sh deny-sudo testuser123
sudo /home/bs01595/namesurfer/scripts/provision.sh set-disk-quota testuser123 500
sudo /home/bs01595/namesurfer/scripts/provision.sh create-vhost testuser123 testuser123.inthespace.online
sudo /home/bs01595/namesurfer/scripts/provision.sh reload-apache testuser123
sudo /home/bs01595/namesurfer/scripts/provision.sh create-mysql-user testuser123 inthespace_testuser123 secretpassword

# 2. Check the result
ls -la /home/inthespace_testuser123/
curl http://testuser123.inthespace.online/
mysql -u root -e "SELECT User, Host FROM mysql.user WHERE User LIKE 'inthespace%';"

# 3. Start the worker (after filling .env.local)
sudo pm2 start /home/bs01595/namesurfer/worker.js --name onboarding-worker

# 4. Watch logs
sudo pm2 logs onboarding-worker
```

---

## 10. API Quick Reference

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/v2/auth/register` | POST | None | Sign up (email+password), sends OTP |
| `/api/v2/auth/verify-otp` | POST | None | Verify 6-digit OTP |
| `/api/v2/auth/resend-otp` | POST | None | Resend OTP to unverified email |
| `/api/v2/auth/google` | POST | None | Google ID token → register/login |
| `/api/v2/onboarding/start` | POST | Bearer | Queue hosting setup (email must be verified) |
| `/api/v2/onboarding/status/:jobId` | GET | Bearer | SSE stream of real-time progress |
