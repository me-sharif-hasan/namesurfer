// pages/api/subdomains/[id].js - Get, update, delete subdomain (user can manage their own)
import { adminDb } from '../../../lib/firebase-admin';
import { withAuth } from '../../../lib/auth-middleware';
import { createARecord, createCNAMERecord, deleteRecord } from '../../../lib/powerdns-client';
import { validateIP, validateURL } from '../../../lib/validation';
import { logAPI, logInfo, logSuccess, logError, logWarning } from '../../../lib/logger';

export default async function handler(req, res) {
  const startTime = Date.now();
  const { id } = req.query;
  
  if (!id) {
    logAPI(req.method, `/api/subdomains/${id}`, 400, Date.now() - startTime);
    return res.status(400).json({ error: 'Subdomain ID is required' });
  }
  
  try {
    if (req.method === 'GET') {
      return await handleGet(req, res, id, startTime);
    } else if (req.method === 'PATCH') {
      return await handlePatch(req, res, id, startTime);
    } else if (req.method === 'DELETE') {
      return await handleDelete(req, res, id, startTime);
    }
    
    logAPI(req.method, `/api/subdomains/${id}`, 405, Date.now() - startTime);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    logError(`API Error /api/subdomains/${id}`, error);
    logAPI(req.method, `/api/subdomains/${id}`, 500, Date.now() - startTime);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET - Get specific subdomain
async function handleGet(req, res, id, startTime) {
  return withAuth(async (req, res) => {
    try {
      const user = req.user;
      const doc = await adminDb.collection('subdomains').doc(id).get();
      
      if (!doc.exists) {
        logAPI(req.method, `/api/subdomains/${id}`, 404, Date.now() - startTime, user.email);
        return res.status(404).json({ error: 'Subdomain not found' });
      }
      
      const data = doc.data();
      
      // Users can only see their own subdomains (admin can see all)
      if (!user.isAdmin && data.userId !== user.uid) {
        logWarning(`Access denied: ${user.email} tried to access ${data.subdomainName}`);
        logAPI(req.method, `/api/subdomains/${id}`, 403, Date.now() - startTime, user.email);
        return res.status(403).json({ error: 'Access denied' });
      }
      
      logAPI(req.method, `/api/subdomains/${id}`, 200, Date.now() - startTime, user.email);
      
      return res.status(200).json({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toMillis() || null,
        approvedAt: data.approvedAt?.toMillis() || null
      });
    } catch (error) {
      logError('Error getting subdomain', error);
      logAPI(req.method, `/api/subdomains/${id}`, 500, Date.now() - startTime);
      return res.status(500).json({ error: 'Failed to get subdomain' });
    }
  })(req, res);
}

// PATCH - Update subdomain (user can update their own, admin can update all)
async function handlePatch(req, res, id, startTime) {
  return withAuth(async (req, res) => {
    try {
      const user = req.user;
      const { targetUrl } = req.body;
      
      // Get current subdomain data
      const docRef = adminDb.collection('subdomains').doc(id);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        logAPI(req.method, `/api/subdomains/${id}`, 404, Date.now() - startTime, user.email);
        return res.status(404).json({ error: 'Subdomain not found' });
      }
      
      const currentData = doc.data();
      
      // Users can only update their own subdomains
      if (!user.isAdmin && currentData.userId !== user.uid) {
        logWarning(`Update denied: ${user.email} tried to update ${currentData.subdomainName}`);
        logAPI(req.method, `/api/subdomains/${id}`, 403, Date.now() - startTime, user.email);
        return res.status(403).json({ error: 'Access denied' });
      }
      
      if (!targetUrl) {
        logAPI(req.method, `/api/subdomains/${id}`, 400, Date.now() - startTime, user.email);
        return res.status(400).json({ error: 'targetUrl is required' });
      }
      
      // Validate new target
      let targetValidation;
      if (currentData.recordType === 'A') {
        targetValidation = validateIP(targetUrl);
      } else if (currentData.recordType === 'CNAME') {
        targetValidation = validateURL(targetUrl);
      }
      
      if (!targetValidation.valid) {
        logAPI(req.method, `/api/subdomains/${id}`, 400, Date.now() - startTime, user.email);
        return res.status(400).json({ error: targetValidation.error });
      }
      
      logInfo(`Updating ${currentData.subdomainName}: ${currentData.targetUrl} → ${targetValidation.value}`);
      
      // Update DNS record
      let dnsCreated = false;
      let dnsError = null;
      
      try {
        if (currentData.recordType === 'A') {
          await createARecord(currentData.subdomainName, targetValidation.value);
        } else if (currentData.recordType === 'CNAME') {
          await createCNAMERecord(currentData.subdomainName, targetValidation.value);
        }
        dnsCreated = true;
        logSuccess(`DNS updated for ${currentData.subdomainName}`);
      } catch (error) {
        dnsError = error.message;
        logError(`DNS update failed for ${currentData.subdomainName}`, error);
      }
      
      // Update Firestore
      const updateData = {
        targetUrl: targetValidation.value,
        dnsCreated,
        dnsError,
        updatedAt: new Date()
      };
      
      await docRef.update(updateData);
      
      // Get updated document
      const updatedDoc = await docRef.get();
      const updatedData = updatedDoc.data();
      
      logSuccess(`Subdomain updated: ${currentData.subdomainName} by ${user.email}`);
      logAPI(req.method, `/api/subdomains/${id}`, 200, Date.now() - startTime, user.email);
      
      return res.status(200).json({
        id: updatedDoc.id,
        ...updatedData,
        createdAt: updatedData.createdAt?.toMillis() || null,
        approvedAt: updatedData.approvedAt?.toMillis() || null,
        updatedAt: updatedData.updatedAt?.toMillis() || null
      });
      
    } catch (error) {
      logError('Error updating subdomain', error);
      logAPI(req.method, `/api/subdomains/${id}`, 500, Date.now() - startTime);
      return res.status(500).json({ error: 'Failed to update subdomain' });
    }
  })(req, res);
}

// DELETE - Delete subdomain (user can delete their own, admin can delete all)
async function handleDelete(req, res, id, startTime) {
  return withAuth(async (req, res) => {
    try {
      const user = req.user;
      const docRef = adminDb.collection('subdomains').doc(id);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        logAPI(req.method, `/api/subdomains/${id}`, 404, Date.now() - startTime, user.email);
        return res.status(404).json({ error: 'Subdomain not found' });
      }
      
      const data = doc.data();
      
      // Users can only delete their own subdomains
      if (!user.isAdmin && data.userId !== user.uid) {
        logWarning(`Delete denied: ${user.email} tried to delete ${data.subdomainName}`);
        logAPI(req.method, `/api/subdomains/${id}`, 403, Date.now() - startTime, user.email);
        return res.status(403).json({ error: 'Access denied' });
      }
      
      logInfo(`Deleting subdomain: ${data.subdomainName} by ${user.email}`);
      
      // Delete DNS record if it was created
      if (data.dnsCreated) {
        try {
          await deleteRecord(data.subdomainName, data.recordType);
          logSuccess(`DNS deleted for ${data.subdomainName}`);
        } catch (dnsError) {
          logError(`DNS delete failed for ${data.subdomainName} (non-blocking)`, dnsError);
          // Don't block deletion if DNS removal fails
        }
      }
      
      // Delete from Firestore
      await docRef.delete();
      
      logSuccess(`Subdomain deleted: ${data.subdomainName} by ${user.email}`);
      logAPI(req.method, `/api/subdomains/${id}`, 200, Date.now() - startTime, user.email);
      
      return res.status(200).json({ success: true, message: 'Subdomain deleted' });
      
    } catch (error) {
      logError('Error deleting subdomain', error);
      logAPI(req.method, `/api/subdomains/${id}`, 500, Date.now() - startTime);
      return res.status(500).json({ error: 'Failed to delete subdomain' });
    }
  })(req, res);
}
