// lib/rate-limit.js - Simple in-memory rate limiter
const rateLimit = new Map();

/**
 * Rate limiter for API routes
 * @param {string} identifier - IP address or user ID
 * @param {number} maxRequests - Maximum requests allowed
 * @param {number} windowMs - Time window in milliseconds
 * @returns {boolean} - Whether request is allowed
 */
export function checkRateLimit(identifier, maxRequests = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const key = identifier;
  
  if (!rateLimit.has(key)) {
    rateLimit.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  const record = rateLimit.get(key);
  
  // Reset if window expired
  if (now > record.resetTime) {
    rateLimit.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  // Increment count
  if (record.count < maxRequests) {
    record.count++;
    return true;
  }
  
  return false;
}

/**
 * Get client IP from request
 */
export function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    'unknown'
  );
}

/**
 * Clean up old entries (call periodically)
 */
export function cleanupRateLimit() {
  const now = Date.now();
  for (const [key, record] of rateLimit.entries()) {
    if (now > record.resetTime) {
      rateLimit.delete(key);
    }
  }
}

// Clean up every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimit, 10 * 60 * 1000);
}
