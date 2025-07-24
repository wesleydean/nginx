const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet());
app.use(compression());

// Configure CORS to only allow requests from your frontend domain
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://your-pwa-domain.com',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Configure Plaid client
const configuration = new Configuration({
  basePath: process.env.PLAID_ENV === 'production' 
    ? PlaidEnvironments.production 
    : PlaidEnvironments.sandbox,
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
    const createTokenResponse = await plaidClient.linkTokenCreate({
      user: { client_user_id: req.body.userId },
      client_name: 'Expense Tracker',
      products: ['transactions'],
      country_codes: ['US', 'CA'],
      language: 'en'
    });
    res.json(createTokenResponse.data);
  } catch (error) {
    console.error('Error creating link token:', error);
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));