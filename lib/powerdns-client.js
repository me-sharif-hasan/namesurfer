// lib/powerdns-client.js - Server-side PowerDNS API client
// Based on PowerDNS HTTP API documentation
import { logDNS, logInfo } from './logger';

const POWERDNS_API_URL = process.env.POWERDNS_API_URL;
const POWERDNS_API_KEY = process.env.POWERDNS_API_KEY;
const POWERDNS_ZONE = process.env.POWERDNS_ZONE;

/**
 * Create an A record in PowerDNS
 * @param {string} subdomain - Subdomain name (without parent domain)
 * @param {string} targetIP - Target IP address
 * @returns {Promise<boolean>} - Success status
 */
export async function createARecord(subdomain, targetIP) {
  const fqdn = `${subdomain}.${POWERDNS_ZONE}`;
  
  logInfo(`Creating A record (${POWERDNS_API_URL}): ${fqdn} → ${targetIP}`);
  
  try {
    const response = await fetch(
      `${POWERDNS_API_URL}/api/v1/servers/localhost/zones/${POWERDNS_ZONE}`,
      {
        method: 'PATCH',
        headers: {
          'X-API-Key': POWERDNS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rrsets: [{
            name: fqdn,
            type: 'A',
            ttl: 3600,
            changetype: 'REPLACE',
            records: [{
              content: targetIP,
              disabled: false
            }]
          }]
        })
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PowerDNS API error (${response.status}): ${errorText}`);
    }
    
    logDNS('CREATE A', fqdn, true);
    return true;
  } catch (error) {
    logDNS('CREATE A', fqdn, false, error.message);
    throw error;
  }
}

/**
 * Create a CNAME record in PowerDNS
 * @param {string} subdomain - Subdomain name (without parent domain)
 * @param {string} target - Target domain (must end with dot)
 * @returns {Promise<boolean>} - Success status
 */
export async function createCNAMERecord(subdomain, target) {
  const fqdn = `${subdomain}.${POWERDNS_ZONE}`;
  const targetWithDot = target.endsWith('.') ? target : `${target}.`;
  
  logInfo(`Creating CNAME record (${POWERDNS_API_URL}): ${fqdn} → ${targetWithDot}`);
  
  try {
    const response = await fetch(
      `${POWERDNS_API_URL}/api/v1/servers/localhost/zones/${POWERDNS_ZONE}`,
      {
        method: 'PATCH',
        headers: {
          'X-API-Key': POWERDNS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rrsets: [{
            name: fqdn,
            type: 'CNAME',
            ttl: 3600,
            changetype: 'REPLACE',
            records: [{
              content: targetWithDot,
              disabled: false
            }]
          }]
        })
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PowerDNS API error (${response.status}): ${errorText}`);
    }
    
    logDNS('CREATE CNAME', fqdn, true);
    return true;
  } catch (error) {
    logDNS('CREATE CNAME', fqdn, false, error.message);
    throw error;
  }
}

/**
 * Delete a DNS record from PowerDNS
 * @param {string} subdomain - Subdomain name (without parent domain)
 * @param {string} recordType - Record type (A, CNAME, etc.)
 * @returns {Promise<boolean>} - Success status
 */
export async function deleteRecord(subdomain, recordType = 'A') {
  const fqdn = `${subdomain}.${POWERDNS_ZONE}`;
  
  logInfo(`Deleting ${recordType} record: ${fqdn}`);
  
  try {
    const response = await fetch(
      `${POWERDNS_API_URL}/api/v1/servers/localhost/zones/${POWERDNS_ZONE}`,
      {
        method: 'PATCH',
        headers: {
          'X-API-Key': POWERDNS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rrsets: [{
            name: fqdn,
            type: recordType,
            changetype: 'DELETE'
          }]
        })
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PowerDNS API error (${response.status}): ${errorText}`);
    }
    
    logDNS(`DELETE ${recordType}`, fqdn, true);
    return true;
  } catch (error) {
    logDNS(`DELETE ${recordType}`, fqdn, false, error.message);
    throw error;
  }
}

/**
 * Update an existing DNS record
 * @param {string} subdomain - Subdomain name
 * @param {string} recordType - Record type
 * @param {string} content - New content
 * @returns {Promise<boolean>} - Success status
 */
export async function updateRecord(subdomain, recordType, content) {
  // Update is the same as REPLACE in PowerDNS
  if (recordType === 'A') {
    return createARecord(subdomain, content);
  } else if (recordType === 'CNAME') {
    return createCNAMERecord(subdomain, content);
  }
  throw new Error(`Unsupported record type: ${recordType}`);
}
