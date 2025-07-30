class PlaidService {
  constructor() {
    // Dynamically determine API base URL based on environment
    this.baseUrl = this.determineApiUrl();
    this.accessTokens = {}; // In production, don't store sensitive tokens in localStorage
    this.authTokenPromise = null; // Cache for ongoing auth requests
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
  
  // Wait for Clerk to be available
  async waitForClerk() {
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max wait
    
    while (typeof window.Clerk === 'undefined' && attempts < maxAttempts) {
      console.log(`Waiting for Clerk to load... (attempt ${attempts + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (typeof window.Clerk === 'undefined') {
      throw new Error('Clerk failed to load after waiting 5 seconds');
    }
    
    return true;
  }

  // Get Clerk session token
  async getClerkSessionToken() {
    // Return cached promise if auth is already in progress
    if (this.authTokenPromise) {
      console.log('🔄 Using cached auth promise');
      return this.authTokenPromise;
    }

    // Create new auth promise
    this.authTokenPromise = this._performAuthentication();
    
    try {
      const token = await this.authTokenPromise;
      return token;
    } finally {
      // Clear cache after completion (success or failure)
      this.authTokenPromise = null;
    }
  }

  // Internal method to perform actual authentication
  async _performAuthentication() {
    try {
      console.log('=== GETTING CLERK SESSION TOKEN ===');
      
      // Wait for Clerk to be available
      await this.waitForClerk();
      
      console.log('✅ Clerk is now available');
      
      console.log('✅ window.Clerk exists:', !!window.Clerk);
      console.log('Clerk loaded:', window.Clerk.loaded);
      console.log('Clerk user:', window.Clerk.user);
      
      // Wait for Clerk to be loaded if it isn't already
      if (!window.Clerk.loaded) {
        console.log('Waiting for Clerk to load...');
        await window.Clerk.load();
      }
      
      // Check if user is signed in
      if (!window.Clerk.user) {
        console.error('❌ No user found in window.Clerk.user');
        throw new Error('User is not signed in. Please sign in to continue.');
      }
      
      console.log('✅ User found:', window.Clerk.user.id);
      
      // Try different methods to get the token
      let token = null;
      
      // Method 1: Direct session token
      if (window.Clerk.session) {
        console.log('Trying session.getToken()...');
        token = await window.Clerk.session.getToken();
      }
      
      // Method 2: User getToken method
      if (!token && window.Clerk.user.getToken) {
        console.log('Trying user.getToken()...');
        token = await window.Clerk.user.getToken();
      }
      
      // Method 3: Session from user
      if (!token && window.Clerk.user.session) {
        console.log('Trying user.session.getToken()...');
        token = await window.Clerk.user.session.getToken();
      }
      
      console.log('Token result:', token ? 'Got token' : 'No token');
      
      if (!token) {
        throw new Error('Could not get session token. Please try signing in again.');
      }
      
      return token;
    } catch (error) {
      console.error('Error getting Clerk session token:', error);
      
      // Show user-friendly error message
      if (error.message.includes('not signed in')) {
        alert('Please sign in to connect your bank account.');
      } else if (error.message.includes('Clerk is not loaded')) {
        alert('Authentication service is not available. Please refresh the page and try again.');
      } else {
        alert('Authentication error. Please try signing in again.');
      }
      
      throw error;
    }
  }
  
  // Start the Plaid Link flow
  async openPlaidLink(userId) {
    try {
      // Get Clerk session token
      const sessionToken = await this.getClerkSessionToken();
      
      // 1. Request a link token from your backend server
      const response = await fetch(`${this.baseUrl}/api/create_link_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ userId }),
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      const linkToken = data.link_token;
      
      // Determine if we're using sandbox mode
      const isSandbox = this.baseUrl.includes('localhost') || 
                       (data.environment && data.environment === 'sandbox') ||
                       this.isSandboxMode();
      console.log(`Using Plaid in ${isSandbox ? 'sandbox' : 'production'} mode`);
      
      // If we're in sandbox mode, log test credentials
      if (isSandbox) {
        console.log('========= PLAID SANDBOX TEST CREDENTIALS =========');
        console.log('Username: user_good');
        console.log('Password: pass_good');
        console.log('For MFA prompt, use any 4-digit code, like: 1234');
        console.log('For phone verification, use: 1234567890');
        console.log('=================================================');
      }
      
      // 2. Initialize Plaid Link with the token
      return new Promise((resolve, reject) => {
        // Create Plaid handler
        const handler = Plaid.create({
          token: linkToken,
          receivedRedirectUri: null,
          onLoad: () => {
            console.log('Plaid Link loaded');
          },
          onSuccess: async (public_token, metadata) => {
            try {
              // Get Clerk session token
              const sessionToken = await this.getClerkSessionToken();
              
              // 3. Exchange the public token for an access token via your backend
              const exchangeResponse = await fetch(`${this.baseUrl}/api/exchange_public_token`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${sessionToken}`,
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
        // Get Clerk session token
        const sessionToken = await this.getClerkSessionToken();
        
        const response = await fetch(`${this.baseUrl}/api/transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken}`,
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
  
  // Helper function to determine if we're using sandbox mode
  isSandboxMode() {
    return this.baseUrl.includes('localhost') || 
           this.baseUrl.includes('127.0.0.1') || 
           localStorage.getItem('plaid_force_sandbox') === 'true';
  }
  
  // Enable sandbox mode for testing
  enableSandboxMode() {
    localStorage.setItem('plaid_force_sandbox', 'true');
    console.log('Plaid sandbox mode enabled for testing');
  }
  
  // Disable sandbox mode
  disableSandboxMode() {
    localStorage.removeItem('plaid_force_sandbox');
    console.log('Plaid sandbox mode disabled');
  }
  
  // Get sandbox test credentials (for reference)
  getSandboxCredentials() {
    return {
      username: 'user_good',
      password: 'pass_good',
      phoneNumber: '1234567890',
      mfaCode: '1234'
    };
  }
  
  // Log sandbox testing instructions to console
  logSandboxInstructions() {
    console.log('=== PLAID SANDBOX TESTING INSTRUCTIONS ===');
    console.log('1. For any institution, use these credentials:');
    console.log('   Username: user_good');
    console.log('   Password: pass_good');
    console.log('2. For phone verification, enter: 1234567890');
    console.log('3. For any MFA code prompt, enter: 1234');
    console.log('4. To test specific error cases, use usernames like:');
    console.log('   - user_login_required');
    console.log('   - user_password_reset_required');
    console.log('==========================================');
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
        <div class="account-management-list-item" style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; flex-direction: column; flex: 1;">
                <span class="account-management-name">${account.name}</span>
                ${account.currentBalance !== undefined ? `<span style="font-size: 0.9rem; color: #666; margin-top: 0.25rem;">Balance: ${formatCurrency(account.currentBalance)}</span>` : ''}
            </div>
            ${savingsAccounts.length > 1 ? `<button class="account-management-delete-btn" onclick="deleteAccountFromSlideOut('${account.id}')">Delete</button>` : ''}
        </div>
    `).join('');
    
    // Add Plaid connect button at the top
    accountsHtml = `
        <div class="account-management-list-item" style="display: flex; justify-content: space-between; align-items: center;">
            <span class="account-management-name">Connect Account</span>
            <button class="account-management-add-btn" style="background-color: #5d59af; min-width: 100px;" onclick="connectPlaidAccount()">Connect</button>
        </div>
    ` + accountsHtml;
    
    listContainer.innerHTML = accountsHtml;
}

// Add this function to handle the Plaid integration

async function connectPlaidAccount() {
    // Disable connect button to prevent multiple clicks
    const connectButton = document.querySelector('.account-management-add-btn');
    if (connectButton) {
        connectButton.disabled = true;
        connectButton.textContent = 'Connecting...';
    }

    try {
        // Generate a unique user ID - in production, use your actual user ID system
        const userId = `user_${Date.now()}`;
        
        // First check if server is available
        const serverAvailable = await plaidService.checkServerStatus();
        if (!serverAvailable) {
            if (confirm('Cannot connect to Plaid API server. Would you like to use sandbox test mode?')) {
                plaidService.enableSandboxMode();
                console.log('Sandbox mode enabled for testing');
                // Display sandbox credentials
                plaidService.logSandboxInstructions();
            } else {
                alert('Please try again when the server is available.');
                return;
            }
        }
        
        // If in sandbox mode, show instructions
        if (plaidService.isSandboxMode()) {
            plaidService.logSandboxInstructions();
        }
        
        // Start Plaid Link flow
        console.log('Initiating Plaid Link flow...');
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

            // --- Scroll to Accounts screen and show skeleton loading ---
            // Go to Accounts screen (screen index 2)
            if (typeof goToScreen === 'function') {
                goToScreen(2);
            }
            // Wait for DOM to update, then scroll to accounts section and show skeleton
            setTimeout(() => {
                // Scroll to the accounts list section
                const accountsSection = document.getElementById('saveSavingsSection');
                if (accountsSection) {
                    accountsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                // Show skeleton loading placeholder
                if (typeof showAccountsLoadingPlaceholder === 'function') {
                    showAccountsLoadingPlaceholder();
                }
                // Now update the UI (after skeleton is visible)
                updateAccountManagementList();
                updateAccountSelector();
            }, 300);

            // Simulate loading, then fade in real accounts list
            setTimeout(() => {
                if (typeof renderAccountsList === 'function') {
                    renderAccountsList(savingsAccounts);
                }
                if (typeof hideAccountsLoadingPlaceholder === 'function') {
                    hideAccountsLoadingPlaceholder();
                }
            }, 1200);

            // Fetch transactions if available (no alert)
            fetchPlaidTransactions();
        } else {
            console.log('Plaid connection cancelled or failed', result);
            
            // Check if we should offer sandbox mode
            if ((result && result.error && !plaidService.isSandboxMode()) || 
                (!result && !plaidService.isSandboxMode())) {
                if (confirm('Would you like to try again in sandbox test mode? This will use test credentials that are guaranteed to work.')) {
                    plaidService.enableSandboxMode();
                    plaidService.logSandboxInstructions();
                    // Try again
                    return connectPlaidAccount();
                }
            }
        }
    } catch (error) {
        console.error('Error connecting to Plaid:', error);
        
        // Offer sandbox mode if there's an error
        if (!plaidService.isSandboxMode() && 
            confirm('There was a problem connecting to your bank. Would you like to try sandbox test mode instead? This will use test credentials that are guaranteed to work.')) {
            plaidService.enableSandboxMode();
            plaidService.logSandboxInstructions();
            // Try again
            return connectPlaidAccount();
        } else {
            alert('There was a problem connecting to your bank. Please try again.');
        }
    } finally {
        // Re-enable connect button
        const connectButton = document.querySelector('.account-management-add-btn');
        if (connectButton) {
            connectButton.disabled = false;
            connectButton.textContent = 'Connect';
        }
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

// Enhanced utility function to test Plaid in sandbox mode (can be called from console for testing)
function testPlaidSandboxMode() {
    // Enable sandbox mode
    plaidService.enableSandboxMode();
    
    // Generate a unique user ID
    const userId = `sandbox_test_${Date.now()}`;
    
    // Display sandbox instructions
    plaidService.logSandboxInstructions();
    
    // Trigger the connection flow
    connectPlaidAccount();
    
    return 'Sandbox test initiated. Check console for instructions and status updates.';
}

// Make the test function available globally
window.testPlaidSandbox = testPlaidSandboxMode;

// Direct sandbox credential testing function
window.getPlaidSandboxCredentials = function() {
    return {
        username: 'user_good',
        password: 'pass_good',
        phoneNumber: '1234567890',
        mfaCode: '1234'
    };
};
