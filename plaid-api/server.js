const express = require('express');
const cors = require('cors');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
require('dotenv').config();

const app = express();

// Middleware order is important - json parsing first
app.use(express.json());

// Then CORS configuration
console.log('Setting up CORS configuration');
app.use(cors({
  origin: '*', // Allow all origins for development
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  preflightContinue: false // Explicitly prevent preflight continuation issues
}));

// Handle preflight requests
app.options('*', cors());

// Configure Plaid client
console.log('PLAID_ENV:', process.env.PLAID_ENV);

// Safely handle the environment path
let basePath;
try {
  basePath = process.env.PLAID_ENV === 'production' 
    ? PlaidEnvironments.production 
    : PlaidEnvironments.sandbox;
  console.log('PLAID environment path:', basePath);
} catch (error) {
  console.error('Error determining Plaid environment:', error);
  // Default to sandbox in case of error
  basePath = 'https://sandbox.plaid.com';
  console.log('Defaulting to:', basePath);
}

const configuration = new Configuration({
  basePath: basePath,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});
const plaidClient = new PlaidApi(configuration);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create a link token and send to client
app.post('/api/create_link_token', async (req, res) => {
  try {
    // Check if userId exists to prevent potential errors
    if (!req.body.userId) {
      console.warn('Missing userId in request body');
      req.body.userId = 'default-user-id'; // Provide a fallback
    }
    
    // Log the request data for debugging
    console.log('Creating link token with user ID:', req.body.userId);
    
    const createTokenResponse = await plaidClient.linkTokenCreate({
      user: { client_user_id: req.body.userId },
      client_name: 'Expense Tracker',
      products: ['transactions'],
      country_codes: ['US', 'CA'],
      language: 'en'
    });
    
    console.log('Link token created successfully');
    res.json(createTokenResponse.data);
  } catch (error) {
    console.error('Error creating link token:', error);
    console.error('Error details:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Exchange public token for access token
app.post('/api/exchange_public_token', async (req, res) => {
  try {
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: req.body.public_token
    });
    
    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;
    
    // Get institution information
    const itemResponse = await plaidClient.itemGet({
      access_token: accessToken
    });
    
    const institutionId = itemResponse.data.item.institution_id;
    let institutionName = "Connected Bank";
    
    if (institutionId) {
      const institutionResponse = await plaidClient.institutionsGetById({
        institution_id: institutionId,
        country_codes: ['US', 'CA']
      });
      institutionName = institutionResponse.data.institution.name;
    }
    
    // In production you would store these in your database associated with the user
    // For this example, we'll return them directly (NOT recommended for production)
    res.json({ 
      access_token: accessToken, 
      item_id: itemId,
      institution_id: institutionId,
      institution_name: institutionName
    });
  } catch (error) {
    console.error('Error exchanging public token:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fetch transactions endpoint
app.post('/api/transactions', async (req, res) => {
  try {
    // Access token should be securely stored and retrieved in a real app
    const accessToken = req.body.access_token;
    
    if (!accessToken) {
      return res.status(400).json({ error: 'Access token is required' });
    }
    
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30); // Get 30 days of transactions
    
    const response = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: startDate.toISOString().split('T')[0],
      end_date: now.toISOString().split('T')[0],
    });
    
    const transactions = response.data.transactions;
    res.json({ transactions });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  console.error('Stack trace:', err.stack);
  
  // Special handling for path-to-regexp errors
  if (err.message && err.message.includes('Missing parameter name')) {
    console.warn('Detected path-to-regexp error with URL parsing. This might be caused by a URL containing a colon that\'s not a route parameter.');
    
    // Check if this is a CORS preflight request that might be malformed
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
  }
  
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message
  });
});

const PORT = process.env.PORT || 5000;

// Print all registered routes for debugging
console.log('Registered routes:');
app._router.stack.forEach(function(r){
  if (r.route && r.route.path){
    console.log(`${Object.keys(r.route.methods)} ${r.route.path}`);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});