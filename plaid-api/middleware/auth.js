const { ClerkExpressWithAuth } = require('@clerk/clerk-sdk-node');

// Configure Clerk
const clerkMiddleware = ClerkExpressWithAuth({
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  secretKey: process.env.CLERK_SECRET_KEY,
});

// Auth middleware that requires authentication
const requireAuth = (req, res, next) => {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
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