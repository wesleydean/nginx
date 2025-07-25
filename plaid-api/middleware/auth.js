const { ClerkExpressWithAuth } = require('@clerk/clerk-sdk-node');

// Configure Clerk for Railway deployment
const clerkMiddleware = ClerkExpressWithAuth({
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  secretKey: process.env.CLERK_SECRET_KEY,
  // Railway-specific configuration
  apiVersion: 'v1',
  skipJwtValidation: false,
  jwtKey: process.env.CLERK_JWT_KEY || process.env.CLERK_SECRET_KEY,
  authorizedParties: ['https://nginx-production-d92e.up.railway.app']
});

// Auth middleware that requires authentication
const requireAuth = (req, res, next) => {
  console.log('=== AUTH MIDDLEWARE DEBUG ===');
  console.log('req.auth:', req.auth);
  console.log('Authorization header:', req.headers.authorization);
  console.log('All headers:', Object.keys(req.headers));
  console.log('Origin:', req.headers.origin);
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  
  // Check if we have auth object from Clerk middleware
  if (!req.auth) {
    console.log('❌ No req.auth object found');
    return res.status(401).json({ 
      error: 'Unauthorized - No auth object',
      message: 'Clerk middleware did not set req.auth. Check your Authorization header format.',
      expected: 'Authorization: Bearer <clerk-session-token>'
    });
  }
  
  // Check if we have userId
  if (!req.auth.userId) {
    console.log('❌ No userId in req.auth:', req.auth);
    return res.status(401).json({ 
      error: 'Unauthorized - No user ID',
      message: 'Valid Clerk session token required',
      auth_debug: req.auth
    });
  }
  
  console.log('✅ Auth success for user:', req.auth.userId);
  next();
};

// Optional auth middleware (for public endpoints that can benefit from user context)
const optionalAuth = (req, res, next) => {
  // User info available in req.auth.userId if logged in, but not required
  next();
};

module.exports = {
  clerkMiddleware,
  requireAuth,
  optionalAuth
};