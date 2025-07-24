class PlaidService {
  constructor() {
    // Dynamically determine API base URL based on environment
    this.baseUrl = this.determineApiUrl();
    this.accessTokens = {}; // In production, don't store sensitive tokens in localStorage
  }
  
  // Determine the API URL based on environment
  determineApiUrl() {
    // For local development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:5000';
    }
    
    // For production - assuming your API is hosted at api.yourdomain.com
    return 'https://plaid-api-production.up.railway.app';
  }
  
  // Load saved institution info from localStorage (not tokens in production)
  async initialize() {
    const savedInstitutions = localStorage.getItem('plaid_institutions');
    if (savedInstitutions) {
      const institutions = JSON.parse(savedInstitutions);
      // In real app, you'd fetch tokens securely from your backend
      this.institutions = institutions;
    }
  }
  
  // Save institution info to localStorage
  saveInstitutionInfo(institutions) {
    localStorage.setItem('plaid_institutions', JSON.stringify(institutions));
    this.institutions = institutions;
  }
  
  // Start the Plaid Link flow
  async openPlaidLink(userId) {
    try {
      // 1. Request a link token from your backend server
      const response = await fetch(`${this.baseUrl}/api/create_link_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      const linkToken = data.link_token;
      
      // 2. Initialize Plaid Link with the token
      return new Promise((resolve, reject) => {
        const handler = Plaid.create({
          token: linkToken,
          onSuccess: async (public_token, metadata) => {
            try {
              // 3. Exchange the public token for an access token via your backend
              const exchangeResponse = await fetch(`${this.baseUrl}/api/exchange_public_token`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ public_token }),
              });
              
              if (!exchangeResponse.ok) {
                throw new Error(`Exchange failed: ${exchangeResponse.status}`);
              }
              
              const exchangeData = await exchangeResponse.json();
              
              // Store institution info
              const institutionInfo = {
                id: exchangeData.institution_id,
                name: exchangeData.institution_name,
                accessToken: exchangeData.access_token // In production, store tokens server-side
              };
              
              // Save the new institution
              const existingInstitutions = this.institutions || [];
              const updatedInstitutions = [...existingInstitutions, institutionInfo];
              this.saveInstitutionInfo(updatedInstitutions);
              
              // Return success with institution info
              resolve({
                success: true,
                institution: {
                  id: institutionInfo.id,
                  name: institutionInfo.name
                }
              });
            } catch (error) {
              console.error('Token exchange error:', error);
              reject(error);
            }
          },
          onExit: (err, metadata) => {
            if (err != null) {
              console.log('Link exit error:', err);
              reject(err);
            } else {
              console.log('Link exit metadata:', metadata);
              resolve({ success: false, metadata });
            }
          },
        });
        
        handler.open();
      });
    } catch (error) {
      console.error('Error in openPlaidLink:', error);
      throw error;
    }
  }
  
  // Fetch transactions from connected accounts
  async fetchTransactions() {
    if (!this.institutions || this.institutions.length === 0) {
      return [];
    }
    
    const allTransactions = [];
    
    for (const institution of this.institutions) {
      try {
        const response = await fetch(`${this.baseUrl}/api/transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ access_token: institution.accessToken }),
        });
        
        if (!response.ok) {
          throw new Error(`Transactions fetch failed: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.transactions) {
          // Format transactions to match your app's format
          const formattedTransactions = data.transactions.map(transaction => {
            return {
              amount: Math.abs(transaction.amount),
              category: mapPlaidCategoryToApp(transaction.category?.[0] || 'other'),
              description: transaction.name,
              date: transaction.date,
              timestamp: new Date(transaction.date).getTime(),
              created: new Date().getTime(),
              accountName: transaction.account_name,
              institution: institution.name,
              plaidId: transaction.transaction_id
            };
          });
          
          allTransactions.push(...formattedTransactions);
        }
      } catch (error) {
        console.error(`Error fetching transactions for ${institution.name}:`, error);
        // Continue with other institutions even if one fails
      }
    }
    
    return allTransactions;
  }
  
  // Get connected financial institutions
  getConnectedInstitutions() {
    return (this.institutions || []).map(institution => ({
      id: institution.id,
      name: institution.name
    }));
  }
}

// Helper function to map Plaid categories to your app's categories
function mapPlaidCategoryToApp(plaidCategory) {
  const categoryMap = {
    'Food and Drink': 'dining',
    'Restaurants': 'dining',
    'Groceries': 'groceries',
    'Transportation': 'transportation',
    'Travel': 'transportation',
    'Payment': 'other',
    'Recreation': 'entertainment',
    'Entertainment': 'entertainment',
    'Shopping': 'clothing',
    'Personal Care': 'personal',
    'Health and Medical': 'health',
    'Subscription': 'subscriptions',
    // Add more mappings as needed
  };
  
  return categoryMap[plaidCategory] || 'other';
}

// Create a singleton instance
const plaidService = new PlaidService();

// Export the service
window.plaidService = plaidService;