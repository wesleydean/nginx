const express = require('express');
const cors = require('cors');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const database = require('./database');
const { clerkAuth } = require('./middleware/auth');
require('dotenv').config();

// Create Express app and explicitly use path-to-regexp options for stable path handling
const app = express();

// Middleware order is important - json parsing first
app.use(express.json());

// Then CORS configuration with proper options
console.log('Setting up CORS configuration');
app.use(cors({
  origin: '*', // Allow all origins for development
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  preflightContinue: false // Explicitly prevent preflight continuation issues
}));

// Note: Using direct token verification per endpoint instead of global middleware

// Handle preflight requests - more specific handling to avoid path-to-regexp issues
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', true);
  res.status(200).end();
});

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

// Test endpoint without auth for debugging
app.post('/api/create_link_token_test', async (req, res) => {
  try {
    const testUserId = 'test-user-id';
    
    console.log('Creating test link token for user:', testUserId);
    
    const environment = process.env.PLAID_ENV === 'production' ? 'production' : 'sandbox';
    console.log('Using Plaid environment:', environment);
    
    const config = {
      user: { client_user_id: testUserId },
      client_name: 'Expense Tracker',
      products: ['transactions'],
      country_codes: ['US', 'CA'],
      language: 'en'
    };
    
    if (environment === 'sandbox') {
      console.log('Adding sandbox-specific configurations');
      config.account_filters = {
        depository: {
          account_subtypes: ['checking', 'savings']
        }
      };
    }
    
    const createTokenResponse = await plaidClient.linkTokenCreate(config);
    
    console.log('Link token created successfully');
    
    const responseData = {
      ...createTokenResponse.data,
      environment: environment
    };
    
    res.json(responseData);
  } catch (error) {
    console.error('Error creating test link token:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a link token and send to client
app.post('/api/create_link_token', clerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    
    // Ensure user exists in database
    await database.createUser(clerkUserId);
    
    // Log the request data for debugging
    console.log('Creating link token for Clerk user:', clerkUserId);
    
    // Determine the current environment
    const environment = process.env.PLAID_ENV === 'production' ? 'production' : 'sandbox';
    console.log('Using Plaid environment:', environment);
    
    // Configure link token creation with options
    const config = {
      user: { client_user_id: clerkUserId },
      client_name: 'Expense Tracker',
      products: ['transactions'],
      country_codes: ['US', 'CA'],
      language: 'en'
    };
    
    // Add sandbox-specific configurations if in sandbox mode
    if (environment === 'sandbox') {
      console.log('Adding sandbox-specific configurations');
      config.account_filters = {
        depository: {
          account_subtypes: ['checking', 'savings']
        }
      };
    }
    
    const createTokenResponse = await plaidClient.linkTokenCreate(config);
    
    console.log('Link token created successfully');
    
    // Add environment info to the response
    const responseData = {
      ...createTokenResponse.data,
      environment: environment
    };
    
    res.json(responseData);
  } catch (error) {
    console.error('Error creating link token:', error);
    console.error('Error details:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Exchange public token for access token
app.post('/api/exchange_public_token', clerkAuth, async (req, res) => {
  try {
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: req.body.public_token
    });
    
    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;
    
    // Get institution and account information
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

    // Get accounts and store them
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken
    });
    
    const clerkUserId = req.auth.userId;
    
    // Store accounts in our database
    for (const account of accountsResponse.data.accounts) {
      await database.addAccount(clerkUserId, {
        ...account,
        access_token: accessToken,
        item_id: itemId,
        institution_id: institutionId,
        institution_name: institutionName
      });
    }

    // Automatically fetch recent transactions for the new accounts
    try {
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30); // Get 30 days of transactions
      
      const transactionsResponse = await plaidClient.transactionsGet({
        access_token: accessToken,
        start_date: startDate.toISOString().split('T')[0],
        end_date: now.toISOString().split('T')[0],
      });
      
      // Store transactions in our database
      const addedTransactions = await database.addTransactions(clerkUserId, transactionsResponse.data.transactions);
      
      console.log(`Automatically stored ${addedTransactions.length} transactions for new accounts`);
    } catch (transactionError) {
      console.error('Error fetching transactions for new accounts:', transactionError);
      // Continue anyway, don't fail the account connection
    }
    
    res.json({ 
      access_token: accessToken, 
      item_id: itemId,
      institution_id: institutionId,
      institution_name: institutionName,
      accounts: accountsResponse.data.accounts
    });
  } catch (error) {
    console.error('Error exchanging public token:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fetch transactions endpoint
app.post('/api/transactions', clerkAuth, async (req, res) => {
  try {
    const accessToken = req.body.access_token;
    const clerkUserId = req.auth.userId;
    
    if (!accessToken) {
      return res.status(400).json({ error: 'Access token is required' });
    }
    
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    
    const response = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: startDate.toISOString().split('T')[0],
      end_date: now.toISOString().split('T')[0],
    });
    
    // Store transactions in our database
    const addedTransactions = await database.addTransactions(clerkUserId, response.data.transactions);
    
    res.json({ 
      transactions: response.data.transactions,
      stored_count: addedTransactions.length 
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get stored transactions for authenticated user
app.get('/api/transactions', clerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const limit = req.query.limit ? parseInt(req.query.limit) : null;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;
    
    const transactions = await database.getUserTransactions(clerkUserId, limit, offset);
    const stats = await database.getUserStats(clerkUserId);
    
    res.json({
      transactions,
      stats,
      count: transactions.length
    });
  } catch (error) {
    console.error('Error getting user transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get transactions by category
app.get('/api/transactions/categories', clerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const categories = await database.getTransactionsByCategory(clerkUserId);
    
    res.json({ categories });
  } catch (error) {
    console.error('Error getting transactions by category:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user accounts with recent transactions
app.get('/api/accounts', clerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const accounts = await database.getUserAccounts(clerkUserId);
    
    // Get recent transactions for each account
    const accountsWithTransactions = await Promise.all(
      accounts.map(async (account) => {
        const recentTransactions = await database.getAccountTransactions(
          clerkUserId, 
          account.account_id, 
          5 // Get 5 most recent transactions
        );
        
        return {
          ...account,
          recent_transactions: recentTransactions,
          transaction_count: recentTransactions.length
        };
      })
    );
    
    res.json({ accounts: accountsWithTransactions });
  } catch (error) {
    console.error('Error getting user accounts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update account name
app.put('/api/accounts/:accountId', clerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const accountId = req.params.accountId;
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Account name is required' });
    }
    
    const result = await database.updateAccountName(clerkUserId, accountId, name);
    
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error updating account name:', error);
    res.status(500).json({ error: error.message });
  }
});

// Refresh account balances
app.post('/api/accounts/refresh', clerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const accounts = await database.getUserAccounts(clerkUserId);
    
    const refreshedAccounts = [];
    
    for (const account of accounts) {
      try {
        // Get fresh balance from Plaid
        const accountsResponse = await plaidClient.accountsGet({
          access_token: account.access_token
        });
        
        // Find the matching account
        const freshAccount = accountsResponse.data.accounts.find(
          acc => acc.account_id === account.account_id
        );
        
        if (freshAccount) {
          // Update balance in database
          await database.updateAccountBalance(
            clerkUserId,
            account.account_id,
            freshAccount.balances.current,
            freshAccount.balances.iso_currency_code
          );
          
          refreshedAccounts.push({
            account_id: account.account_id,
            old_balance: account.current_balance,
            new_balance: freshAccount.balances.current,
            currency: freshAccount.balances.iso_currency_code
          });
        }
      } catch (accountError) {
        console.error(`Error refreshing account ${account.account_id}:`, accountError);
      }
    }
    
    res.json({ 
      success: true, 
      refreshed_accounts: refreshedAccounts,
      count: refreshedAccounts.length 
    });
  } catch (error) {
    console.error('Error refreshing account balances:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update transaction
app.put('/api/transactions/:transactionId', clerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const transactionId = req.params.transactionId;
    const updates = req.body;
    
    const result = await database.updateTransaction(clerkUserId, transactionId, updates);
    
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  console.error('Stack trace:', err.stack);
  
  // Special handling for path-to-regexp errors
  if (err.message && err.message.includes('Missing parameter name')) {
    console.warn('Detected path-to-regexp error with URL parsing.');
    
    // Check if this is a CORS preflight request
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    // For regular requests with path-to-regexp errors, provide more helpful error
    return res.status(400).json({
      error: 'Invalid URL format',
      message: 'The request contains a URL that cannot be processed. This might be caused by a URL with a colon that is not properly escaped.'
    });
  }
  
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message
  });
});

// Print all registered routes for debugging
console.log('Registered routes:');
app._router.stack.forEach(function(r){
  if (r.route && r.route.path){
    console.log(`${Object.keys(r.route.methods)} ${r.route.path}`);
  }
});

// For direct execution
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

// Export app for use with bin/www or testing
module.exports = app;