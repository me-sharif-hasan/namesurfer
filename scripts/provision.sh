#!/bin/bash
# scripts/provision.sh
# Privileged provisioning script for InTheSpace free hosting.
# Run via sudo by the namesurfer Next.js / worker process.
#
# Usage: sudo /path/to/provision.sh <action> <bare_username> [extra_args...]
#
# Actions:
#   create-user        <username>
#   create-public-html <username>
#   deny-sudo          <username>
#   set-disk-quota     <username> <quota_mb>
#   set-limits         <username> <ram_mb>
#   create-vhost       <username> <domain>
#   reload-apache
#   create-mysql-user  <username> <db_name> <db_password>
#   delete-user        <username>

set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────
PREFIX="inthespace_"
DB_PREFIX="inthespace_db_user_"
MYSQL_HOST="${MYSQL_HOST:-localhost}"
MYSQL_ROOT_USER="${MYSQL_ROOT_USER:-root}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-}"
APACHE_SITES="/etc/apache2/sites-available"
APACHE_ENABLED="/etc/apache2/sites-enabled"

# ── Input validation ───────────────────────────────────────────────────────────
ACTION="${1:-}"
RAW_USERNAME="${2:-}"

if [[ -z "$ACTION" || -z "$RAW_USERNAME" ]]; then
  echo "ERROR: action and username are required" >&2
  exit 1
fi

# Strict username validation — only lowercase letters, digits, underscores; max 20 chars
if ! [[ "$RAW_USERNAME" =~ ^[a-z0-9_]{3,20}$ ]]; then
  echo "ERROR: invalid username '$RAW_USERNAME'" >&2
  exit 1
fi

LINUX_USER="${PREFIX}${RAW_USERNAME}"
HOME_DIR="/home/${LINUX_USER}"
PUBLIC_HTML="${HOME_DIR}/public_html"

# ── Action dispatcher ──────────────────────────────────────────────────────────
case "$ACTION" in

  # ── 1. Create Linux user ────────────────────────────────────────────────────
  create-user)
    if id "$LINUX_USER" &>/dev/null; then
      echo "INFO: user $LINUX_USER already exists — skipping"
      exit 0
    fi
    useradd \
      --create-home \
      --home-dir "$HOME_DIR" \
      --shell /usr/sbin/nologin \
      --comment "InTheSpace hosting: ${RAW_USERNAME}" \
      "$LINUX_USER"
    chmod 750 "$HOME_DIR"
    echo "OK: user $LINUX_USER created"
    ;;

  # ── 2. Create public_html directory ─────────────────────────────────────────
  create-public-html)
    mkdir -p "$PUBLIC_HTML"
    chown "${LINUX_USER}:${LINUX_USER}" "$HOME_DIR" "$PUBLIC_HTML"
    chmod 750 "$HOME_DIR"
    chmod 755 "$PUBLIC_HTML"

    # Default index page
    cat > "${PUBLIC_HTML}/index.html" << HTMLEOF
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Welcome to ${RAW_USERNAME}.inthespace.online</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
min-height:100vh;margin:0;background:#0f0e17;color:#fffffe;}
.box{text-align:center;} h1{color:#ff8906;} p{color:#a7a9be;}</style>
</head>
<body><div class="box">
  <h1>🚀 ${RAW_USERNAME}.inthespace.online</h1>
  <p>Your hosting is live! Upload files to <code>~/public_html</code> to get started.</p>
</div></body></html>
HTMLEOF
    chown "${LINUX_USER}:${LINUX_USER}" "${PUBLIC_HTML}/index.html"
    echo "OK: public_html created at $PUBLIC_HTML"
    ;;

  # ── 3. Deny sudo ─────────────────────────────────────────────────────────────
  deny-sudo)
    SUDOERS_FILE="/etc/sudoers.d/deny_${LINUX_USER}"
    echo "${LINUX_USER} ALL=(ALL) !ALL" > "$SUDOERS_FILE"
    chmod 440 "$SUDOERS_FILE"
    # Verify syntax
    visudo -c -f "$SUDOERS_FILE" || { rm -f "$SUDOERS_FILE"; echo "ERROR: sudoers syntax check failed" >&2; exit 1; }
    echo "OK: sudo denied for $LINUX_USER"
    ;;

  # ── 4. Set disk quota ────────────────────────────────────────────────────────
  set-disk-quota)
    QUOTA_MB="${3:-500}"
    if ! [[ "$QUOTA_MB" =~ ^[0-9]+$ ]]; then
      echo "ERROR: invalid quota_mb '$QUOTA_MB'" >&2; exit 1
    fi
    # Convert MB to 1K blocks
    SOFT_BLOCKS=$(( QUOTA_MB * 1024 ))
    HARD_BLOCKS=$(( (QUOTA_MB + 50) * 1024 )) # 5% grace
    SOFT_INODES=50000
    HARD_INODES=55000

    if command -v setquota &>/dev/null; then
      # setquota -u <user> <soft_blocks> <hard_blocks> <soft_inodes> <hard_inodes> <filesystem>
      QUOTA_FS=$(df --output=target "$HOME_DIR" | tail -1)
      setquota -u "$LINUX_USER" "$SOFT_BLOCKS" "$HARD_BLOCKS" "$SOFT_INODES" "$HARD_INODES" "$QUOTA_FS"
      echo "OK: disk quota set to ${QUOTA_MB}MB for $LINUX_USER on $QUOTA_FS"
    else
      echo "WARN: setquota not found — disk quota not applied (install quota package)"
    fi
    ;;

  # ── 5. Set resource limits ───────────────────────────────────────────────────
  set-limits)
    RAM_MB="${3:-200}"
    if ! [[ "$RAM_MB" =~ ^[0-9]+$ ]]; then
      echo "ERROR: invalid ram_mb '$RAM_MB'" >&2; exit 1
    fi
    RAM_KB=$(( RAM_MB * 1024 ))
    LIMITS_FILE="/etc/security/limits.d/${LINUX_USER}.conf"
    cat > "$LIMITS_FILE" << EOF
${LINUX_USER} soft as ${RAM_KB}
${LINUX_USER} hard as ${RAM_KB}
${LINUX_USER} soft nproc 50
${LINUX_USER} hard nproc 60
${LINUX_USER} soft nofile 256
${LINUX_USER} hard nofile 512
EOF
    echo "OK: resource limits set (RAM=${RAM_MB}MB) for $LINUX_USER"
    ;;

  # ── 6. Create Apache2 virtual host ──────────────────────────────────────────
  create-vhost)
    DOMAIN="${3:-${RAW_USERNAME}.inthespace.online}"
    # Validate domain (simple check)
    if ! [[ "$DOMAIN" =~ ^[a-z0-9._-]+$ ]]; then
      echo "ERROR: invalid domain '$DOMAIN'" >&2; exit 1
    fi
    CONF_FILE="${APACHE_SITES}/${DOMAIN}.conf"
    cat > "$CONF_FILE" << APACHEEOF
<VirtualHost *:80>
    ServerName ${DOMAIN}
    DocumentRoot ${PUBLIC_HTML}

    <Directory ${PUBLIC_HTML}>
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted
    </Directory>

    # Block access to parent directory
    <Directory ${HOME_DIR}>
        Require all denied
    </Directory>

    ErrorLog  /var/log/apache2/${DOMAIN}-error.log
    CustomLog /var/log/apache2/${DOMAIN}-access.log combined
</VirtualHost>
APACHEEOF

    # Enable the site
    a2ensite "${DOMAIN}.conf"
    echo "OK: vhost created for $DOMAIN"
    ;;

  # ── 7. Reload Apache ─────────────────────────────────────────────────────────
  reload-apache)
    apache2ctl configtest && apache2ctl graceful
    echo "OK: apache reloaded"
    ;;

  # ── 8. Create MySQL user + database ─────────────────────────────────────────
  create-mysql-user)
    DB_NAME="${3:-}"
    DB_PASSWORD="${4:-}"
    if [[ -z "$DB_NAME" || -z "$DB_PASSWORD" ]]; then
      echo "ERROR: db_name and db_password are required" >&2; exit 1
    fi
    # Validate db_name
    if ! [[ "$DB_NAME" =~ ^[a-z0-9_]{1,64}$ ]]; then
      echo "ERROR: invalid db_name '$DB_NAME'" >&2; exit 1
    fi
    DB_USER="${DB_PREFIX}${RAW_USERNAME}"
    MYSQL_CMD="mysql -h${MYSQL_HOST} -u${MYSQL_ROOT_USER}"
    [[ -n "$MYSQL_ROOT_PASSWORD" ]] && MYSQL_CMD="$MYSQL_CMD -p${MYSQL_ROOT_PASSWORD}"

    $MYSQL_CMD << SQLEOF
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQLEOF
    echo "OK: MySQL user $DB_USER and database $DB_NAME created"
    ;;

  # ── 9. Remove user (cleanup / account deletion) ──────────────────────────────
  delete-user)
    if id "$LINUX_USER" &>/dev/null; then
      userdel -r "$LINUX_USER" 2>/dev/null || true
    fi
    rm -f "/etc/sudoers.d/deny_${LINUX_USER}" 2>/dev/null || true
    rm -f "/etc/security/limits.d/${LINUX_USER}.conf" 2>/dev/null || true
    echo "OK: user $LINUX_USER removed"
    ;;

  *)
    echo "ERROR: unknown action '$ACTION'" >&2
    exit 1
    ;;
esac
