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
  
  // Check if the server is running
  async checkServerStatus() {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        console.log('✅ Plaid API server is running!');
        const data = await response.json();
        console.log('Server time:', data.timestamp);
        return true;
      } else {
        console.error('❌ Plaid API server returned an error:', response.status);
        return false;
      }
    } catch (error) {
      console.error('❌ Cannot connect to Plaid API server:', error.message);
      return false;
    }
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

// Add at the end of your updateAccountManagementList() function

function updateAccountManagementList() {
    const listContainer = document.getElementById('accountManagementList');
    if (!listContainer) return;
    
    let accountsHtml = savingsAccounts.map(account => `
        <div class="account-management-list-item">
            <span class="account-management-name">${account.name}</span>
            ${savingsAccounts.length > 1 ? `<button class="account-management-delete-btn" onclick="deleteAccountFromSlideOut('${account.id}')">Delete</button>` : ''}
        </div>
    `).join('');
    
    // Add Plaid connect button at the top
    accountsHtml = `
        <div class="account-management-list-item">
            <span class="account-management-name">Connect Bank Account</span>
            <button class="account-management-add-btn" style="background-color: #5d59af; min-width: 100px;" onclick="connectPlaidAccount()">Connect</button>
        </div>
    ` + accountsHtml;
    
    listContainer.innerHTML = accountsHtml;
}

// Add this function to handle the Plaid integration

async function connectPlaidAccount() {
    try {
        // Generate a unique user ID - in production, use your actual user ID system
        const userId = `user_${Date.now()}`;
        
        // Start Plaid Link flow
        const result = await plaidService.openPlaidLink(userId);
        
        if (result && result.success) {
            // Add the connected institution to our account system
            const institution = result.institution;
            
            // Create a new account entry
            const newAccount = {
                id: `plaid_${institution.id}`,
                name: institution.name,
                type: 'plaid',
                institutionId: institution.id
            };
            
            // Add to accounts list
            savingsAccounts.push(newAccount);
            saveSavingsAccounts(savingsAccounts);
            
            // Update UI
            updateAccountManagementList();
            updateAccountSelector();
            
            // Show success message
            alert(`Successfully connected ${institution.name}!`);
            
            // Fetch transactions if available
            fetchPlaidTransactions();
        } else {
            console.log('Plaid connection cancelled or failed', result);
        }
    } catch (error) {
        console.error('Error connecting to Plaid:', error);
        alert('There was a problem connecting to your bank. Please try again.');
    }
}

// Add function to fetch transactions from Plaid
async function fetchPlaidTransactions() {
    try {
        const transactions = await plaidService.fetchTransactions();
        if (transactions && transactions.length > 0) {
            console.log(`Fetched ${transactions.length} transactions from Plaid`);
            
            // Convert Plaid transactions to your app's format and add them
            const expenses = loadExpenses();
            
            // Group by date
            const transactionsByDate = {};
            transactions.forEach(transaction => {
                const date = transaction.date;
                if (!transactionsByDate[date]) {
                    transactionsByDate[date] = [];
                }
                
                // Convert to your app's expense format
                const expense = {
                    amount: transaction.amount,
                    category: transaction.category,
                    description: transaction.description,
                    timestamp: transaction.timestamp,
                    created: transaction.created,
                    plaidId: transaction.plaidId,  // Store Plaid ID to avoid duplicates
                    institution: transaction.institution
                };
                
                transactionsByDate[date].push(expense);
            });
            
            // Add to expenses object
            Object.keys(transactionsByDate).forEach(date => {
                if (!expenses[date]) {
                    expenses[date] = [];
                }
                
                // Filter out any expenses that already have a plaidId (avoid duplicates)
                const existingPlaidIds = expenses[date]
                    .filter(e => e.plaidId)
                    .map(e => e.plaidId);
                
                // Add only new transactions
                const newTransactions = transactionsByDate[date]
                    .filter(t => !existingPlaidIds.includes(t.plaidId));
                
                expenses[date] = expenses[date].concat(newTransactions);
            });
            
            saveExpenses(expenses);
            
            // Update UI
            updatePeriodView();
            
            alert(`Successfully imported ${transactions.length} transactions from your bank!`);
        } else {
            console.log('No transactions found or available');
        }
    } catch (error) {
        console.error('Error fetching Plaid transactions:', error);
    }
}

// Add this to your document.addEventListener('DOMContentLoaded') function

document.addEventListener('DOMContentLoaded', async function() {
    // Your existing initialization code
    
    // Initialize Plaid service
    if (window.plaidService) {
        try {
            await window.plaidService.initialize();
            console.log('Plaid service initialized');
            
            // Check if server is running
            const serverStatus = await window.plaidService.checkServerStatus();
            if (serverStatus) {
                console.log('Plaid API server is running');
            } else {
                console.warn('Plaid API server is not reachable');
            }
        } catch (error) {
            console.error('Failed to initialize Plaid service:', error);
        }
    }
});

// Add this to your updateSaveScreen function or similar function that updates the accounts screen
