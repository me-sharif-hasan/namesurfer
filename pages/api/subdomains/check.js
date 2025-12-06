// pages/api/subdomains/check.js - Check subdomain availability (PUBLIC)
import { adminDb } from '../../../lib/firebase-admin';
import { validateSubdomainName } from '../../../lib/validation';
import { logAPI } from '../../../lib/logger';

export default async function handler(req, res) {
  const startTime = Date.now();
  
  if (req.method !== 'GET') {
    logAPI(req.method, '/api/subdomains/check', 405, Date.now() - startTime);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { name } = req.query;
    
    if (!name) {
      logAPI(req.method, '/api/subdomains/check', 400, Date.now() - startTime);
      return res.status(400).json({ error: 'Subdomain name is required' });
    }
    
    // Validate format
    const validation = validateSubdomainName(name);
    if (!validation.valid) {
      logAPI(req.method, '/api/subdomains/check', 200, Date.now() - startTime);
      return res.status(200).json({
        available: false,
        reason: validation.error
      });
    }
    
    // Check if exists in Firestore
    const snapshot = await adminDb.collection('subdomains')
      .where('subdomainName', '==', validation.value)
      .limit(1)
      .get();
    
    const available = snapshot.empty;
    
    logAPI(req.method, '/api/subdomains/check', 200, Date.now() - startTime);
    
    return res.status(200).json({
      available,
      reason: available ? null : 'This subdomain is already taken'
    });
    
  } catch (error) {
    console.error('Error checking availability:', error);
    logAPI(req.method, '/api/subdomains/check', 500, Date.now() - startTime);
    return res.status(500).json({ error: 'Failed to check availability' });
  }
}
