// lib/auth-middleware.js - API route authentication
import { adminAuth } from './firebase-admin';
import { logInfo, logWarning } from './logger';

const ADMIN_EMAIL = 'me.sharif.hasan@gmail.com';

/**
 * Verify Firebase Auth token from request
 * @param {Request} req - Next.js API request
 * @returns {Promise<{uid: string, email: string, isAdmin: boolean}>} - Decoded token
 */
export async function verifyAuthToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized: No token provided');
  }
  
  const token = authHeader.split('Bearer ')[1];
  
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const isAdmin = decodedToken.email === ADMIN_EMAIL;
    
    logInfo(`Auth verified: ${decodedToken.email}${isAdmin ? ' (ADMIN)' : ' (USER)'}`);
    
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      isAdmin
    };
  } catch (error) {
    logWarning('Token verification failed', error.message);
    throw new Error('Unauthorized: Invalid token');
  }
}

/**
 * Middleware wrapper for protected API routes
 * @param {Function} handler - API route handler
 * @param {boolean} requireAdmin - Whether route requires admin access
 * @returns {Function} - Wrapped handler
 */
export function withAuth(handler, requireAdmin = false) {
  return async (req, res) => {
    try {
      const user = await verifyAuthToken(req);
      
      if (requireAdmin && !user.isAdmin) {
        logWarning(`Access denied: ${user.email} not admin`);
        return res.status(403).json({ error: 'Forbidden: Admin access required' });
      }
      
      req.user = user;
      return handler(req, res);
    } catch (error) {
      return res.status(401).json({ error: error.message });
    }
  };
}
