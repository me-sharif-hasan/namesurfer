// pages/api/auth/login.js - Admin login endpoint
// Note: This is a simple endpoint - actual login is handled by Firebase Auth on client
// This endpoint can be used for additional server-side session management if needed

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Client handles Firebase Auth login
  // This endpoint can be extended for additional server-side logic
  
  return res.status(200).json({
    message: 'Use Firebase Auth client SDK for login'
  });
}
