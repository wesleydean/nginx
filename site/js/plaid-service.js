// Simulate the skeleton/scroll/fade-in animation for the accounts list (without adding an account)
window.simulateAccountsSkeletonAnimation = function() {
    // Go to Accounts screen (screen index 2)
    if (typeof goToScreen === 'function') {
        goToScreen(2);
    }
    setTimeout(() => {
        const accountsSection = document.getElementById('saveSavingsSection');
        if (accountsSection) {
            accountsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (typeof showAccountsLoadingPlaceholder === 'function') {
            showAccountsLoadingPlaceholder();
        }
    }, 300);
    setTimeout(() => {
        if (typeof hideAccountsLoadingPlaceholder === 'function') {
            hideAccountsLoadingPlaceholder();
        }
    }, 1200);
}
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
  
  // Cache object for storing API responses
  transactionCache = new Map();

  // Fetch transactions using optimized endpoint with caching
  async fetchTransactions(startDate = null, days = 30, includeCategories = true) {
    // Generate cache key
    const cacheKey = `${startDate || 'default'}-${days}-${includeCategories}`;

    // Check cache first
    if (this.transactionCache.has(cacheKey)) {
      console.log('Returning cached transactions');
      return this.transactionCache.get(cacheKey);
    }

    try {
      // Get Clerk session token
      const sessionToken = await this.getClerkSessionToken();

      // Use the optimized range endpoint
      const params = new URLSearchParams({
        start_date: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        days: days.toString(),
        category_summary: includeCategories.toString()
      });

      const response = await fetch(`${this.baseUrl}/api/transactions/range?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
        }
      });

      if (!response.ok) {
        throw new Error(`Transactions fetch failed: ${response.status}`);
      }

      const data = await response.json();

      // Format transactions to match app's format
      const formattedData = {
        transactions: data.transactions.map(transaction => ({
          amount: Math.abs(transaction.amount),
          category: mapPlaidCategoryToApp(transaction.category || 'other'),
          description: transaction.name,
          date: transaction.date,
          timestamp: new Date(transaction.date).getTime(),
          created: new Date().getTime(),
          accountName: transaction.account_name,
          institution: transaction.institution_name,
          plaidId: transaction.transaction_id
        })),
        categories: data.categories || []
      };

      // Cache the response for 5 minutes
      this.transactionCache.set(cacheKey, formattedData);
      setTimeout(() => this.transactionCache.delete(cacheKey), 5 * 60 * 1000);

      return formattedData;
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw error;
    }
  }

  // Fetch monthly overview with caching
  async fetchMonthlyOverview() {
    const cacheKey = 'monthly-overview';

    if (this.transactionCache.has(cacheKey)) {
      console.log('Returning cached monthly overview');
      return this.transactionCache.get(cacheKey);
    }

    try {
      const sessionToken = await this.getClerkSessionToken();

      const response = await fetch(`${this.baseUrl}/api/transactions/monthly-overview`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
        }
      });

      if (!response.ok) {
        throw new Error(`Monthly overview fetch failed: ${response.status}`);
      }

      const data = await response.json();

      // Cache for 10 minutes
      this.transactionCache.set(cacheKey, data.summary);
      setTimeout(() => this.transactionCache.delete(cacheKey), 10 * 60 * 1000);

      return data.summary;
    } catch (error) {
      console.error('Error fetching monthly overview:', error);
      throw error;
    }
  }

  // Pre-fetch data for spending page
  async prefetchSpendingData(startDate, days) {
    try {
      // Pre-fetch transactions and categories
      await this.fetchTransactions(startDate, days, true);
      
      // Pre-fetch monthly overview if needed
      await this.fetchMonthlyOverview();
      
      console.log('Spending data pre-fetched');
    } catch (error) {
      console.error('Error pre-fetching spending data:', error);
    }
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

// Note: updateAccountManagementList() function is now defined in index.html with API caching

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
            console.log('Plaid connection successful:', result.institution);

            // Show skeleton loader immediately
            if (typeof showAccountsLoadingPlaceholder === 'function') {
                showAccountsLoadingPlaceholder();
            }
            if (typeof goToScreen === 'function') {
                goToScreen(2);
            }
            setTimeout(() => {
                const accountsSection = document.getElementById('saveSavingsSection');
                if (accountsSection) {
                    accountsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                // Note: updateAccountManagementList will be called automatically when fetchPlaidTransactions completes
                if (typeof updateAccountSelector === 'function') {
                    updateAccountSelector();
                }
            }, 300);

            // Clear accounts cache to ensure fresh data after connection
            if (typeof clearAccountsCache === 'function') {
                clearAccountsCache();
            }

            // Show skeleton loader immediately
            if (typeof showAccountsLoadingPlaceholder === 'function') {
                showAccountsLoadingPlaceholder();
            }

            // Fetch transactions and update accounts in a single flow
            fetchPlaidTransactions().finally(async () => {
                try {
                    // Show skeleton while loading accounts data
                    if (typeof showAccountsLoadingPlaceholder === 'function') {
                        showAccountsLoadingPlaceholder();
                    }

                    // Load accounts once after transaction fetch
                    if (typeof loadAccountsWithTransactions === 'function') {
                        await loadAccountsWithTransactions();
                    }
                    
                    // Update UI components
                    if (typeof updateAccountManagementList === 'function') {
                        updateAccountManagementList();
                    }
                    
                    // Refresh the accounts display components (without full screen refresh)
                    if (typeof renderNewAccountsLayout === 'function') {
                        await renderNewAccountsLayout();
                    }
                    if (typeof generateAccountTypeChart === 'function') {
                        generateAccountTypeChart();
                    }
                    
                    // Update home screen (doesn't need additional account loading)
                    if (typeof updateHomeScreen === 'function') {
                        updateHomeScreen();
                    }

                    // Hide skeleton loader after all updates are complete
                    if (typeof hideAccountsLoadingPlaceholder === 'function') {
                        hideAccountsLoadingPlaceholder();
                    }
                } catch (error) {
                    console.error('Error updating UI after Plaid connection:', error);
                    // Always hide skeleton on error
                    if (typeof hideAccountsLoadingPlaceholder === 'function') {
                        hideAccountsLoadingPlaceholder();
                    }
                }
            });
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

async function fetchPlaidTransactions(startDate = null, days = 30) {
  try {
    const data = await plaidService.fetchTransactions(startDate, days, true);
    
    if (data.transactions && data.transactions.length > 0) {
      console.log(`Fetched ${data.transactions.length} transactions from API`);
      
      // Convert to app's format and add them (same as before)
      const expenses = loadExpenses();
      
      // Group by date
      const transactionsByDate = {};
      data.transactions.forEach(transaction => {
        const date = transaction.date;
        if (!transactionsByDate[date]) {
          transactionsByDate[date] = [];
        }
        
        const expense = {
          amount: transaction.amount,
          category: transaction.category,
          description: transaction.description,
          timestamp: transaction.timestamp,
          created: transaction.created,
          plaidId: transaction.plaidId,
          institution: transaction.institution
        };
        
        transactionsByDate[date].push(expense);
      });
      
      // Add to expenses object (same duplicate check)
      Object.keys(transactionsByDate).forEach(date => {
        if (!expenses[date]) {
          expenses[date] = [];
        }
        
        const existingPlaidIds = expenses[date]
          .filter(e => e.plaidId)
          .map(e => e.plaidId);
        
        const newTransactions = transactionsByDate[date]
          .filter(t => !existingPlaidIds.includes(t.plaidId));
        
        expenses[date] = expenses[date].concat(newTransactions);
      });
      
      saveExpenses(expenses);
      
      // Update UI
      updatePeriodView();
      
      // Return data including categories for view switching
      return data;
    } else {
      console.log('No transactions found');
      return { transactions: [], categories: [] };
    }
  } catch (error) {
    console.error('Error fetching Plaid transactions:', error);
    throw error;
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
