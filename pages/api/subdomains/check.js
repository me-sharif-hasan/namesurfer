// pages/api/subdomains/check.js - Check subdomain availability
import { adminDb } from '../../../lib/firebase-admin';
import { validateSubdomainName } from '../../../lib/validation';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { name } = req.query;
    
    if (!name) {
      return res.status(400).json({ error: 'Subdomain name is required' });
    }
    
    // Validate format
    const validation = validateSubdomainName(name);
    if (!validation.valid) {
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
    
    return res.status(200).json({
      available: snapshot.empty,
      reason: snapshot.empty ? null : 'This subdomain is already taken'
    });
    
  } catch (error) {
    console.error('Error checking availability:', error);
    return res.status(500).json({ error: 'Failed to check availability' });
  }
}
