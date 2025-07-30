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
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  preflightContinue: false // Explicitly prevent preflight continuation issues
}));

// Note: Using direct token verification per endpoint instead of global middleware

// Handle preflight requests - more specific handling to avoid path-to-regexp issues
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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

// Monthly Overview Endpoint
app.get('/api/transactions/monthly-overview', clerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    // Returns [{ month: '2025-07', total: 1234.56, categories: {...}, ... }]
    const summary = await database.getMonthlyTransactionSummary(clerkUserId);
    res.json({ summary });
  } catch (error) {
    console.error('Error getting monthly overview:', error);
    res.status(500).json({ error: error.message });
  }
});

// Time-Range Optimized Transactions Endpoint
app.get('/api/transactions/range', clerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const { start_date, days, category_summary } = req.query;
    if (!start_date || !days) {
      return res.status(400).json({ error: 'start_date and days are required' });
    }
    const startDate = new Date(start_date);
    const parsedDays = parseInt(days);

    // Get transactions in range - passing startDate and days directly to match DB method signature
    const transactions = await database.getTransactionsByDateRange(
      clerkUserId,
      startDate.toISOString().split('T')[0],
      parsedDays
    );

    let categories = undefined;
    if (category_summary === 'true') {
      categories = await database.getTransactionCategoriesByRange(
        clerkUserId,
        startDate.toISOString().split('T')[0],
        parsedDays
      );
    }

    res.json({ transactions, categories });
  } catch (error) {
    console.error('Error getting transactions by range:', error);
    res.status(500).json({ error: error.message });
  }
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
// Enhanced: supports start_date, days, include_categories, limit, offset
app.get('/api/transactions', clerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const { start_date, days, include_categories, limit, offset } = req.query;

    let transactions, stats, categories;
    if (start_date && days) {
      const startDate = new Date(start_date);
      const parsedDays = parseInt(days);
      transactions = await database.getTransactionsByDateRange(
        clerkUserId,
        startDate.toISOString().split('T')[0],
        parsedDays
      );
      // Optionally, you can adjust getUserStats to accept a date range if needed
      stats = await database.getUserStats(clerkUserId, startDate, new Date(startDate.getTime() + (parsedDays - 1) * 24 * 60 * 60 * 1000));
      if (include_categories === 'true') {
        categories = await database.getTransactionCategoriesByRange(
          clerkUserId,
          startDate.toISOString().split('T')[0],
          parsedDays
        );
      }
    } else {
      // Default: last 30 days or all if no params
      transactions = await database.getUserTransactions(
        clerkUserId,
        limit ? parseInt(limit) : null,
        offset ? parseInt(offset) : 0
      );
      stats = await database.getUserStats(clerkUserId);
      if (include_categories === 'true') {
        categories = await database.getTransactionsByCategory(clerkUserId);
      }
    }

    res.json({
      transactions,
      stats,
      categories,
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

// Get user accounts (without transactions for performance)
app.get('/api/accounts', clerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    console.log(`Loading accounts for user: ${clerkUserId}`);
    
    const accounts = await database.getUserAccounts(clerkUserId);
    console.log(`Found ${accounts.length} accounts for user`);
    
    // Return accounts with basic info only - transactions loaded separately when needed
    res.json({ accounts });
  } catch (error) {
    console.error('Error getting user accounts:', error);
    res.status(500).json({ 
      error: 'Failed to load accounts. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get transactions for a specific account
app.get('/api/accounts/:accountId/transactions', clerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const accountId = req.params.accountId;
    const limit = parseInt(req.query.limit) || 50; // Default to 50 transactions
    
    console.log(`Loading transactions for account ${accountId}, limit: ${limit}`);
    
    const transactions = await database.getAccountTransactions(clerkUserId, accountId, limit);
    console.log(`Found ${transactions.length} transactions for account ${accountId}`);
    
    res.json({ transactions });
  } catch (error) {
    console.error('Error getting account transactions:', error);
    res.status(500).json({ 
      error: 'Failed to load transactions. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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

// Clear all user data
app.delete('/api/user/data', clerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    console.log(`Clearing all data for user: ${clerkUserId}`);
    
    // Delete all user data from database
    await database.clearUserData(clerkUserId);
    
    console.log(`Successfully cleared all data for user: ${clerkUserId}`);
    res.json({ success: true, message: 'All user data cleared successfully' });
  } catch (error) {
    console.error('Error clearing user data:', error);
    res.status(500).json({ 
      error: 'Failed to clear user data. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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

// Seed sample data for testing/demo purposes
app.post('/api/seed/sample-data', clerkAuth, async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    console.log(`Seeding sample data for user: ${clerkUserId}`);
    
    // Ensure user exists in database
    await database.createUser(clerkUserId);
    
    // Define sample accounts
    const sampleAccounts = [
      { 
        account_id: `sample_checking_${clerkUserId}`,
        name: 'Checking',
        original_name: 'Checking',
        type: 'depository',
        subtype: 'checking',
        institution_name: 'Sample Bank',
        mask: '0000',
        current_balance: 2500.00,
        currency: 'USD',
        access_token: 'sample_token_checking'
      },
      {
        account_id: `sample_savings_${clerkUserId}`,
        name: 'Savings',
        original_name: 'Savings',
        type: 'depository',
        subtype: 'savings',
        institution_name: 'Sample Bank',
        mask: '0001',
        current_balance: 15000.00,
        currency: 'USD',
        access_token: 'sample_token_savings'
      },
      {
        account_id: `sample_investment_${clerkUserId}`,
        name: 'Brokerage Account',
        original_name: 'Brokerage Account',
        type: 'investment',
        subtype: 'brokerage',
        institution_name: 'Sample Investment',
        mask: '0002',
        current_balance: 45000.00,
        currency: 'USD',
        access_token: 'sample_token_investment'
      },
      {
        account_id: `sample_credit_${clerkUserId}`,
        name: 'Credit Card',
        original_name: 'Credit Card',
        type: 'credit',
        subtype: 'credit_card',
        institution_name: 'Sample Credit',
        mask: '0003',
        current_balance: -1250.00,
        currency: 'USD',
        access_token: 'sample_token_credit'
      }
    ];
    
    // Add sample accounts to database
    const addedAccounts = [];
    for (const account of sampleAccounts) {
      try {
        const result = await database.addAccount(clerkUserId, account);
        addedAccounts.push(result);
        console.log(`Added sample account: ${account.name}`);
      } catch (error) {
        console.error(`Error adding sample account ${account.name}:`, error);
      }
    }
    
    // Generate sample transactions for the past 30 days
    const sampleTransactions = [];
    const today = new Date();
    
    for (let i = 0; i < 30; i++) {
      const transactionDate = new Date(today);
      transactionDate.setDate(transactionDate.getDate() - i);
      const dateStr = transactionDate.toISOString().split('T')[0];
      
      // Generate 1-3 transactions per day
      const transactionsToday = Math.floor(Math.random() * 3) + 1;
      
      for (let j = 0; j < transactionsToday; j++) {
        const categories = ['FOOD_AND_DRINK', 'TRANSPORTATION', 'SHOPPING', 'ENTERTAINMENT', 'UTILITIES'];
        const category = categories[Math.floor(Math.random() * categories.length)];
        const amount = Math.round((Math.random() * 100 + 10) * 100) / 100; // $10-110
        
        const transaction = {
          transaction_id: `sample_txn_${clerkUserId}_${i}_${j}`,
          account_id: sampleAccounts[0].account_id, // Use checking account
          amount: amount,
          iso_currency_code: 'USD',
          name: `Sample ${category.toLowerCase().replace('_', ' ')} transaction`,
          merchant_name: `Sample Merchant ${j + 1}`,
          date: dateStr,
          personal_finance_category: {
            primary: category,
            detailed: category
          },
          pending: false,
          location: {
            city: 'Sample City',
            region: 'Sample State',
            country: 'US'
          }
        };
        
        sampleTransactions.push(transaction);
      }
    }
    
    // Add sample transactions to database
    const addedTransactions = await database.addTransactions(clerkUserId, sampleTransactions);
    
    console.log(`Sample data seeded successfully: ${addedAccounts.length} accounts, ${addedTransactions.length} transactions`);
    
    res.json({
      success: true,
      message: 'Sample data seeded successfully',
      accounts: addedAccounts.length,
      transactions: addedTransactions.length
    });
    
  } catch (error) {
    console.error('Error seeding sample data:', error);
    res.status(500).json({ 
      error: 'Failed to seed sample data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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