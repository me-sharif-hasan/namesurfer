// pages/api/subdomains/index.js - List and create subdomains (AUTO-APPROVED)
import { adminDb } from '../../../lib/firebase-admin';
import { withAuth } from '../../../lib/auth-middleware';
import { checkRateLimit, getClientIP } from '../../../lib/rate-limit';
import { validateSubdomainName, validateEmail, validateIP, validateURL } from '../../../lib/validation';
import { createARecord, createCNAMERecord } from '../../../lib/powerdns-client';
import { logAPI, logInfo, logSuccess, logError } from '../../../lib/logger';

export default async function handler(req, res) {
  const startTime = Date.now();
  
  try {
    if (req.method === 'GET') {
      return await handleGet(req, res, startTime);
    } else if (req.method === 'POST') {
      return await handlePost(req, res, startTime);
    }
    
    logAPI(req.method, '/api/subdomains', 405, Date.now() - startTime);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    logError('API Error /api/subdomains', error);
    logAPI(req.method, '/api/subdomains', 500, Date.now() - startTime);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET - List subdomains (admin sees all, user sees their own)
async function handleGet(req, res, startTime) {
  return withAuth(async (req, res) => {
    try {
      const { limit = 20, startAfter } = req.query;
      const limitNum = parseInt(limit, 10);
      const user = req.user;
      
      logInfo(`Fetching subdomains for ${user.email}${user.isAdmin ? ' (ADMIN - all)' : ' (USER - own)' }`);
      
      let query = adminDb.collection('subdomains')
        .orderBy('createdAt', 'desc')
        .limit(limitNum);
      
      // Regular users see only their own subdomains
      if (!user.isAdmin) {
        query = query.where('userId', '==', user.uid);
      }
      
      if (startAfter) {
        const startDoc = await adminDb.collection('subdomains').doc(startAfter).get();
        if (startDoc.exists) {
          query = query.startAfter(startDoc);
        }
      }
      
      const snapshot = await query.get();
      const subdomains = [];
      
      snapshot.forEach(doc => {
        subdomains.push({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toMillis() || null,
          approvedAt: doc.data().approvedAt?.toMillis() || null
        });
      });
      
      logSuccess(`Fetched ${subdomains.length} subdomains`);
      logAPI(req.method, '/api/subdomains', 200, Date.now() - startTime, user.email);
      
      return res.status(200).json({
        subdomains,
        hasMore: snapshot.size === limitNum,
        lastId: subdomains.length > 0 ? subdomains[subdomains.length - 1].id : null
      });
    } catch (error) {
      logError('Error listing subdomains', error);
      logAPI(req.method, '/api/subdomains', 500, Date.now() - startTime);
      return res.status(500).json({ error: 'Failed to list subdomains' });
    }
  })(req, res);
}

// POST - Create new subdomain (AUTO-APPROVED with DNS creation)
async function handlePost(req, res, startTime) {
  return withAuth(async (req, res) => {
    try {
      const clientIP = getClientIP(req);
      const user = req.user;
      
      // Rate limiting
      if (!checkRateLimit(clientIP, 5, 15 * 60 * 1000)) {
        logAPI(req.method, '/api/subdomains', 429, Date.now() - startTime, user.email);
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }
      
      const { subdomainName, targetUrl, recordType = 'A' } = req.body;
      
      logInfo(`Subdomain request from ${user.email}: ${subdomainName}`);
      
      // Validate subdomain name
      const subdomainValidation = validateSubdomainName(subdomainName);
      if (!subdomainValidation.valid) {
        logAPI(req.method, '/api/subdomains', 400, Date.now() - startTime, user.email);
        return res.status(400).json({ error: subdomainValidation.error });
      }
      
      // Validate target based on record type
      let targetValidation;
      if (recordType === 'A') {
        targetValidation = validateIP(targetUrl);
      } else if (recordType === 'CNAME') {
        targetValidation = validateURL(targetUrl);
      } else {
        logAPI(req.method, '/api/subdomains', 400, Date.now() - startTime, user.email);
        return res.status(400).json({ error: 'Invalid record type. Must be A or CNAME.' });
      }
      
      if (!targetValidation.valid) {
        logAPI(req.method, '/api/subdomains', 400, Date.now() - startTime, user.email);
        return res.status(400).json({ error: targetValidation.error });
      }
      
      // Check if subdomain already exists
      const existingSnapshot = await adminDb.collection('subdomains')
        .where('subdomainName', '==', subdomainValidation.value)
        .limit(1)
        .get();
      
      if (!existingSnapshot.empty) {
        logAPI(req.method, '/api/subdomains', 409, Date.now() - startTime, user.email);
        return res.status(409).json({ error: 'This subdomain is already taken' });
      }
      
      // AUTO-APPROVED: Create DNS record immediately
      let dnsCreated = false;
      let dnsError = null;
      
      try {
        if (recordType === 'A') {
          await createARecord(subdomainValidation.value, targetValidation.value);
        } else if (recordType === 'CNAME') {
          await createCNAMERecord(subdomainValidation.value, targetValidation.value);
        }
        dnsCreated = true;
        logSuccess(`DNS created for ${subdomainValidation.value}`);
      } catch (error) {
        dnsError = error.message;
        logError(`DNS creation failed for ${subdomainValidation.value}`, error);
        // Continue anyway - admin can retry
      }
      
      // Create subdomain document (AUTO-APPROVED)
      const subdomainData = {
        subdomainName: subdomainValidation.value,
        userEmail: user.email,
        userId: user.uid,
        targetUrl: targetValidation.value,
        recordType,
        status: 'approved', // AUTO-APPROVED
        dnsCreated,
        dnsError,
        createdAt: new Date(),
        approvedAt: new Date(), // Approved immediately
      };
      
      const docRef = await adminDb.collection('subdomains').add(subdomainData);
      
      logSuccess(`Subdomain created (auto-approved): ${subdomainValidation.value} by ${user.email}`);
      logAPI(req.method, '/api/subdomains', 201, Date.now() - startTime, user.email);
      
      return res.status(201).json({
        id: docRef.id,
        ...subdomainData,
        createdAt: subdomainData.createdAt.toISOString(),
        approvedAt: subdomainData.approvedAt.toISOString()
      });
      
    } catch (error) {
      logError('Error creating subdomain', error);
      logAPI(req.method, '/api/subdomains', 500, Date.now() - startTime);
      return res.status(500).json({ error: 'Failed to create subdomain request' });
    }
  })(req, res);
}
