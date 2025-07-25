const { ClerkExpressWithAuth } = require('@clerk/clerk-sdk-node');

// Configure Clerk for Railway deployment
const clerkMiddleware = ClerkExpressWithAuth({
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  secretKey: process.env.CLERK_SECRET_KEY,
  // Railway-specific configuration
  apiVersion: 'v1',
  skipJwtValidation: false,
  jwtKey: process.env.CLERK_JWT_KEY || process.env.CLERK_SECRET_KEY
});

// Auth middleware that requires authentication
const requireAuth = (req, res, next) => {
  console.log('Auth check - req.auth:', req.auth);
  console.log('Authorization header:', req.headers.authorization);
  
  if (!req.auth?.userId) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      debug: {
        hasAuth: !!req.auth,
        userId: req.auth?.userId,
        hasAuthHeader: !!req.headers.authorization
      }
    });
  }
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