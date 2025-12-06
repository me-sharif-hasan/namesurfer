// lib/logger.js - Backend logging utility
const LOG_COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // Background
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m'
};

function formatTimestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 23);
}

export function logInfo(message, data = null) {
  console.log(
    `${LOG_COLORS.cyan}[INFO]${LOG_COLORS.reset} ${LOG_COLORS.dim}${formatTimestamp()}${LOG_COLORS.reset} ${message}`,
    data ? `\n${JSON.stringify(data, null, 2)}` : ''
  );
}

export function logSuccess(message, data = null) {
  console.log(
    `${LOG_COLORS.green}[SUCCESS]${LOG_COLORS.reset} ${LOG_COLORS.dim}${formatTimestamp()}${LOG_COLORS.reset} ${message}`,
    data ? `\n${JSON.stringify(data, null, 2)}` : ''
  );
}

export function logError(message, error = null) {
  console.error(
    `${LOG_COLORS.red}[ERROR]${LOG_COLORS.reset} ${LOG_COLORS.dim}${formatTimestamp()}${LOG_COLORS.reset} ${message}`,
    error ? `\n${error.stack || error.message || error}` : ''
  );
}

export function logWarning(message, data = null) {
  console.warn(
    `${LOG_COLORS.yellow}[WARNING]${LOG_COLORS.reset} ${LOG_COLORS.dim}${formatTimestamp()}${LOG_COLORS.reset} ${message}`,
    data ? `\n${JSON.stringify(data, null, 2)}` : ''
  );
}

export function logAPI(method, path, status, duration, user = null) {
  const statusColor = status >= 200 && status < 300 ? LOG_COLORS.green :
                      status >= 400 && status < 500 ? LOG_COLORS.yellow :
                      LOG_COLORS.red;
  
  console.log(
    `${LOG_COLORS.blue}[API]${LOG_COLORS.reset} ${LOG_COLORS.dim}${formatTimestamp()}${LOG_COLORS.reset} ` +
    `${LOG_COLORS.bright}${method}${LOG_COLORS.reset} ${path} ` +
    `${statusColor}${status}${LOG_COLORS.reset} ` +
    `${LOG_COLORS.dim}${duration}ms${LOG_COLORS.reset}` +
    (user ? ` ${LOG_COLORS.magenta}${user}${LOG_COLORS.reset}` : '')
  );
}

export function logDNS(action, subdomain, success, error = null) {
  const icon = success ? '✓' : '✗';
  const color = success ? LOG_COLORS.green : LOG_COLORS.red;
  
  console.log(
    `${LOG_COLORS.magenta}[DNS]${LOG_COLORS.reset} ${LOG_COLORS.dim}${formatTimestamp()}${LOG_COLORS.reset} ` +
    `${color}${icon}${LOG_COLORS.reset} ${action} ${LOG_COLORS.cyan}${subdomain}${LOG_COLORS.reset}`,
    error ? `\n${LOG_COLORS.red}${error}${LOG_COLORS.reset}` : ''
  );
}
