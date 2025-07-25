const { verifyToken } = require('@clerk/clerk-sdk-node');

// Simple direct token verification middleware
async function clerkAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header. Expected: Bearer <token>' 
      });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify the token with Clerk
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY
    });
    
    // Set req.auth for compatibility
    req.auth = {
      userId: payload.sub,
      sessionId: payload.sid
    };
    
    console.log('✅ Authentication successful for user:', payload.sub);
    next();
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }
}

module.exports = {
  clerkAuth
};