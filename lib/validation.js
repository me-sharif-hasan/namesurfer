// lib/validation.js - Input validation utilities
import validator from 'validator';

/**
 * Validate subdomain name format
 * Rules: alphanumeric, hyphens only, 3-63 chars, no leading/trailing hyphens
 */
export function validateSubdomainName(subdomain) {
  if (!subdomain || typeof subdomain !== 'string') {
    return { valid: false, error: 'Subdomain name is required' };
  }
  
  const trimmed = subdomain.trim().toLowerCase();
  
  // Length check
  if (trimmed.length < 3 || trimmed.length > 63) {
    return { valid: false, error: 'Subdomain must be between 3 and 63 characters' };
  }
  
  // Format check: alphanumeric and hyphens only
  if (!/^[a-z0-9-]+$/.test(trimmed)) {
    return { valid: false, error: 'Subdomain can only contain lowercase letters, numbers, and hyphens' };
  }
  
  // Cannot start or end with hyphen
  if (trimmed.startsWith('-') || trimmed.endsWith('-')) {
    return { valid: false, error: 'Subdomain cannot start or end with a hyphen' };
  }
  
  // Reserved names
  const reserved = ['www', 'mail', 'ftp', 'admin', 'root', 'api', 'ns1', 'ns2'];
  if (reserved.includes(trimmed)) {
    return { valid: false, error: 'This subdomain name is reserved' };
  }
  
  return { valid: true, value: trimmed };
}

/**
 * Validate email address
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }
  
  if (!validator.isEmail(email)) {
    return { valid: false, error: 'Invalid email address' };
  }
  
  return { valid: true, value: email.toLowerCase().trim() };
}

/**
 * Validate IP address (for A records)
 */
export function validateIP(ip) {
  if (!ip || typeof ip !== 'string') {
    return { valid: false, error: 'IP address is required' };
  }
  
  if (!validator.isIP(ip, 4)) {
    return { valid: false, error: 'Invalid IPv4 address' };
  }
  
  return { valid: true, value: ip.trim() };
}

/**
 * Validate URL/domain (for CNAME records)
 */
export function validateURL(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL/domain is required' };
  }
  
  const trimmed = url.trim();
  
  // Check if it's a valid domain or URL
  if (!validator.isFQDN(trimmed.replace(/^https?:\/\//, '').replace(/\/$/, ''))) {
    return { valid: false, error: 'Invalid domain or URL' };
  }
  
  return { valid: true, value: trimmed };
}

/**
 * Sanitize text input
 */
export function sanitizeText(text, maxLength = 500) {
  if (!text) return '';
  return validator.escape(text.trim().substring(0, maxLength));
}
