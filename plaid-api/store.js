const fs = require('fs');
const path = require('path');

class DataStore {
  constructor() {
    this.accounts = new Map();
    this.transactions = new Map();
    this.userAccounts = new Map(); // userId -> [accountIds]
    this.dataFile = path.join(__dirname, 'data.json');
    
    this.loadData();
  }

  // Account management
  addAccount(userId, account) {
    this.accounts.set(account.account_id, {
      ...account,
      userId: userId,
      createdAt: new Date().toISOString()
    });
    
    if (!this.userAccounts.has(userId)) {
      this.userAccounts.set(userId, []);
    }
    this.userAccounts.get(userId).push(account.account_id);
    
    this.saveData();
    return account.account_id;
  }

  getUserAccounts(userId) {
    const accountIds = this.userAccounts.get(userId) || [];
    return accountIds.map(id => this.accounts.get(id)).filter(Boolean);
  }

  // Transaction management
  addTransactions(userId, transactionsData) {
    const addedTransactions = [];
    
    transactionsData.forEach(transaction => {
      this.transactions.set(transaction.transaction_id, {
        ...transaction,
        userId: userId,
        createdAt: new Date().toISOString()
      });
      addedTransactions.push(transaction);
    });

    this.saveData();
    return addedTransactions;
  }

  getUserTransactions(userId, limit = null) {
    const allTransactions = Array.from(this.transactions.values())
      .filter(tx => tx.userId === userId)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return limit ? allTransactions.slice(0, limit) : allTransactions;
  }

  getTransactionsByCategory(userId) {
    const transactions = this.getUserTransactions(userId);
    const categoryGroups = {};
    
    transactions.forEach(tx => {
      const cat = tx.personal_finance_category?.primary || 'UNKNOWN';
      if (!categoryGroups[cat]) {
        categoryGroups[cat] = [];
      }
      categoryGroups[cat].push(tx);
    });
    
    return categoryGroups;
  }

  // Data persistence
  saveData() {
    try {
      const data = {
        accounts: Array.from(this.accounts.entries()),
        transactions: Array.from(this.transactions.entries()),
        userAccounts: Array.from(this.userAccounts.entries()),
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
    }
  }

  loadData() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
        
        this.accounts = new Map(data.accounts || []);
        this.transactions = new Map(data.transactions || []);
        this.userAccounts = new Map(data.userAccounts || []);
        
      }
    } catch (error) {
    }
  }

  getStats(userId) {
    const transactions = this.getUserTransactions(userId);
    return {
      transactionCount: transactions.length,
      totalSpent: transactions.filter(tx => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0),
      totalIncome: transactions.filter(tx => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
    };
  }
}

module.exports = new DataStore();