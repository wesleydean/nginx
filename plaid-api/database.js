const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.db = null;
    this.init();
  }

  init() {
    const dbPath = path.join(__dirname, 'plaid_data.sqlite');
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
      } else {
        console.log('Connected to SQLite database');
        this.createTables();
      }
    });
  }

  createTables() {
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        clerk_user_id TEXT PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createAccountsTable = `
      CREATE TABLE IF NOT EXISTS accounts (
        account_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        original_name TEXT NOT NULL,
        type TEXT NOT NULL,
        subtype TEXT,
        institution_name TEXT NOT NULL,
        mask TEXT,
        current_balance REAL,
        currency TEXT DEFAULT 'USD',
        access_token TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (clerk_user_id)
      )
    `;

    const createTransactionsTable = `
      CREATE TABLE IF NOT EXISTS transactions (
        transaction_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        name TEXT NOT NULL,
        original_name TEXT NOT NULL,
        merchant_name TEXT,
        date DATE NOT NULL,
        category TEXT,
        subcategory TEXT,
        category_icon_url TEXT,
        pending BOOLEAN DEFAULT 0,
        location_city TEXT,
        location_region TEXT,
        location_country TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES accounts (account_id),
        FOREIGN KEY (user_id) REFERENCES users (clerk_user_id)
      )
    `;

    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts (user_id)',
      'CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions (user_id)',
      'CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions (account_id)',
      'CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date DESC)',
      'CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions (category)',
      'CREATE INDEX IF NOT EXISTS idx_transactions_pending ON transactions (pending)'
    ];

    this.db.serialize(() => {
      this.db.run(createUsersTable);
      this.db.run(createAccountsTable);
      this.db.run(createTransactionsTable);
      
      // Add subtype column if it doesn't exist (for existing databases)
      this.db.run(`
        ALTER TABLE accounts ADD COLUMN subtype TEXT
      `, (err) => {
        if (err && !err.message.includes('duplicate column')) {
          console.error('Error adding subtype column:', err);
        }
      });
      
      createIndexes.forEach(indexSQL => {
        this.db.run(indexSQL);
      });
      
      console.log('Database tables created successfully');
    });
  }

  // Helper method to format Plaid categories to user-friendly names
  formatPlaidCategory(plaidCategory) {
    if (!plaidCategory) return 'other';
    
    // Convert snake_case to human readable format
    const categoryMap = {
      'FOOD_AND_DRINK': 'dining',
      'RESTAURANTS': 'dining', 
      'FAST_FOOD': 'dining',
      'GROCERIES': 'groceries',
      'TRANSPORTATION': 'transportation',
      'PUBLIC_TRANSPORTATION': 'transportation',
      'TAXI': 'transportation',
      'GAS': 'transportation',
      'TRAVEL': 'travel',
      'LODGING': 'travel',
      'ENTERTAINMENT': 'entertainment',
      'RECREATION': 'entertainment', 
      'SHOPPING': 'clothing',
      'GENERAL_MERCHANDISE': 'clothing',
      'CLOTHING': 'clothing',
      'PERSONAL_CARE': 'personal',
      'HEALTH_AND_MEDICAL': 'health',
      'MEDICAL': 'health',
      'PHARMACY': 'health',
      'SUBSCRIPTION': 'subscriptions',
      'SOFTWARE': 'subscriptions',
      'UTILITIES': 'utilities',
      'RENT': 'housing',
      'MORTGAGE': 'housing',
      'HOME_IMPROVEMENT': 'housing',
      'BANK_FEES': 'fees',
      'ATM_FEE': 'fees',
      'TRANSFER': 'transfer',
      'DEPOSIT': 'income',
      'PAYROLL': 'income',
      'INTEREST_EARNED': 'income'
    };
    
    // Try direct match first
    if (categoryMap[plaidCategory]) {
      return categoryMap[plaidCategory];
    }
    
    // If no direct match, convert snake_case to lowercase and use as fallback
    return plaidCategory.toLowerCase().replace(/_/g, ' ');
  }

  // User operations
  createUser(clerkUserId) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO users (clerk_user_id) VALUES (?)
      `);
      
      stmt.run([clerkUserId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ clerkUserId, changes: this.changes });
        }
      });
      
      stmt.finalize();
    });
  }

  // Account operations
  addAccount(clerkUserId, accountData) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO accounts (
          account_id, user_id, name, original_name, type, subtype,
          institution_name, mask, current_balance, currency, access_token
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const balances = accountData.balances || {};
      
      stmt.run([
        accountData.account_id,
        clerkUserId,
        accountData.name, // user can edit this
        accountData.name, // original from Plaid
        accountData.type,
        accountData.subtype,
        accountData.institution_name,
        accountData.mask,
        balances.current,
        accountData.iso_currency_code || 'USD',
        accountData.access_token
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ accountId: accountData.account_id, changes: this.changes });
        }
      });
      
      stmt.finalize();
    });
  }

  updateAccountName(clerkUserId, accountId, newName) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        UPDATE accounts SET name = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE account_id = ? AND user_id = ?
      `);
      
      stmt.run([newName, accountId, clerkUserId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ accountId, changes: this.changes });
        }
      });
      
      stmt.finalize();
    });
  }

  updateAccountBalance(clerkUserId, accountId, balance, currency) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        UPDATE accounts SET current_balance = ?, currency = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE account_id = ? AND user_id = ?
      `);
      
      stmt.run([balance, currency, accountId, clerkUserId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ accountId, changes: this.changes });
        }
      });
      
      stmt.finalize();
    });
  }

  // Clear all data for a specific user
  clearUserData(clerkUserId) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        const deleteTransactions = this.db.prepare('DELETE FROM transactions WHERE user_id = ?');
        const deleteAccounts = this.db.prepare('DELETE FROM accounts WHERE user_id = ?');
        const deleteUser = this.db.prepare('DELETE FROM users WHERE clerk_user_id = ?');
        
        try {
          // Delete transactions first (due to foreign key constraints)
          deleteTransactions.run([clerkUserId], function(err) {
            if (err) throw err;
            console.log(`Deleted ${this.changes} transactions for user ${clerkUserId}`);
          });
          
          // Delete accounts
          deleteAccounts.run([clerkUserId], function(err) {
            if (err) throw err;
            console.log(`Deleted ${this.changes} accounts for user ${clerkUserId}`);
          });
          
          // Delete user record
          deleteUser.run([clerkUserId], function(err) {
            if (err) throw err;
            console.log(`Deleted user record for ${clerkUserId}`);
          });
          
          this.db.run('COMMIT', (err) => {
            if (err) {
              reject(err);
            } else {
              console.log(`Successfully cleared all data for user ${clerkUserId}`);
              resolve({ 
                userId: clerkUserId,
                success: true 
              });
            }
          });
          
        } catch (error) {
          this.db.run('ROLLBACK');
          console.error('Error during user data deletion, rolled back:', error);
          reject(error);
        } finally {
          deleteTransactions.finalize();
          deleteAccounts.finalize();
          deleteUser.finalize();
        }
      });
    });
  }

  getUserAccounts(clerkUserId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC',
        [clerkUserId],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  getAccountTransactions(clerkUserId, accountId, limit = 5) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM transactions 
        WHERE user_id = ? AND account_id = ? 
        ORDER BY date DESC, created_at DESC 
        LIMIT ?
      `, [clerkUserId, accountId, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // Format transactions for frontend compatibility
          const formattedTransactions = rows.map(transaction => ({
            ...transaction,
            description: transaction.name, // Map name field to description for frontend
            category: this.formatPlaidCategory(transaction.category), // Format category
            type: transaction.amount < 0 ? 'expense' : 'income' // Negative amounts are expenses (outgoing)
          }));
          resolve(formattedTransactions);
        }
      });
    });
  }

  // Transaction operations
  addTransaction(clerkUserId, transactionData) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO transactions (
          transaction_id, account_id, user_id, amount, currency,
          name, original_name, merchant_name, date, category, subcategory,
          category_icon_url, pending, location_city, location_region, location_country
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const pfc = transactionData.personal_finance_category || {};
      const location = transactionData.location || {};
      
      stmt.run([
        transactionData.transaction_id,
        transactionData.account_id,
        clerkUserId,
        transactionData.amount,
        transactionData.iso_currency_code || 'USD',
        transactionData.name, // user can edit this
        transactionData.name, // original from Plaid
        transactionData.merchant_name,
        transactionData.date,
        pfc.primary,
        pfc.detailed,
        transactionData.personal_finance_category_icon_url,
        transactionData.pending ? 1 : 0,
        location.city,
        location.region,
        location.country
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ transactionId: transactionData.transaction_id, changes: this.changes });
        }
      });
      
      stmt.finalize();
    });
  }

  updateTransaction(clerkUserId, transactionId, updates) {
    return new Promise((resolve, reject) => {
      const allowedFields = ['name', 'merchant_name', 'category', 'subcategory'];
      const setFields = [];
      const values = [];
      
      Object.keys(updates).forEach(field => {
        if (allowedFields.includes(field)) {
          setFields.push(`${field} = ?`);
          values.push(updates[field]);
        }
      });
      
      if (setFields.length === 0) {
        return resolve({ transactionId, changes: 0 });
      }
      
      setFields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(transactionId, clerkUserId);
      
      const stmt = this.db.prepare(`
        UPDATE transactions SET ${setFields.join(', ')} 
        WHERE transaction_id = ? AND user_id = ?
      `);
      
      stmt.run(values, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ transactionId, changes: this.changes });
        }
      });
      
      stmt.finalize();
    });
  }

  async addTransactions(clerkUserId, transactions) {
    const results = [];
    for (const transaction of transactions) {
      try {
        const result = await this.addTransaction(clerkUserId, transaction);
        results.push(result);
      } catch (error) {
        console.error(`Error adding transaction ${transaction.transaction_id}:`, error);
      }
    }
    return results;
  }

  getUserTransactions(clerkUserId, limit = null, offset = 0) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, created_at DESC';
      const params = [clerkUserId];
      
      if (limit) {
        query += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);
      }
      
      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // Format transactions for frontend compatibility
          const formattedTransactions = rows.map(transaction => ({
            ...transaction,
            description: transaction.name, // Map name field to description for frontend
            category: this.formatPlaidCategory(transaction.category), // Format category
            type: transaction.amount < 0 ? 'expense' : 'income' // Negative amounts are expenses (outgoing)
          }));
          resolve(formattedTransactions);
        }
      });
    });
  }

  getTransactionsByCategory(clerkUserId) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          category,
          COUNT(*) as count,
          SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_spent,
          AVG(CASE WHEN amount > 0 THEN amount ELSE NULL END) as avg_amount
        FROM transactions 
        WHERE user_id = ? AND amount > 0 AND category IS NOT NULL
        GROUP BY category 
        ORDER BY total_spent DESC
      `, [clerkUserId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // Format categories for frontend display
          const formattedCategories = rows.map(row => ({
            ...row,
            category: this.formatPlaidCategory(row.category)
          }));
          resolve(formattedCategories);
        }
      });
    });
  }

  getUserStats(clerkUserId) {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT 
          COUNT(DISTINCT account_id) as account_count,
          COUNT(*) as transaction_count,
          SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_spent,
          SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_income,
          MAX(date) as last_transaction_date
        FROM transactions 
        WHERE user_id = ?
      `, [clerkUserId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || {});
        }
      });
    });
  }

  // Get monthly transaction summary for optimized overview
  getMonthlyTransactionSummary(clerkUserId, months = 12) {
    return new Promise((resolve, reject) => {
      // Calculate the start date for the number of months requested
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);
      const startDateStr = startDate.toISOString().split('T')[0];

      this.db.all(`
        SELECT 
          strftime('%Y-%m', date) as month,
          COUNT(*) as transaction_count,
          SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_spent,
          SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_income,
          category,
          COUNT(CASE WHEN amount > 0 THEN 1 END) as expense_count
        FROM transactions 
        WHERE user_id = ? AND date >= ?
        GROUP BY strftime('%Y-%m', date), category
        ORDER BY month DESC, total_spent DESC
      `, [clerkUserId, startDateStr], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // Group by month and format the data
          const monthlyData = {};
          rows.forEach(row => {
            if (!monthlyData[row.month]) {
              monthlyData[row.month] = {
                month: row.month,
                total_spent: 0,
                total_income: 0,
                transaction_count: 0,
                categories: []
              };
            }
            
            const monthData = monthlyData[row.month];
            monthData.total_spent += row.total_spent || 0;
            monthData.total_income += row.total_income || 0;
            monthData.transaction_count += row.expense_count || 0;
            
            if (row.category && row.total_spent > 0) {
              monthData.categories.push({
                category: this.formatPlaidCategory(row.category),
                amount: row.total_spent,
                count: row.expense_count
              });
            }
          });

          // Convert to array and sort by month
          const result = Object.values(monthlyData).sort((a, b) => b.month.localeCompare(a.month));
          resolve(result);
        }
      });
    });
  }

  // Get transactions by date range for optimized queries
  getTransactionsByDateRange(clerkUserId, startDate, days, limit = null) {
    return new Promise((resolve, reject) => {
      // Calculate end date
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + days);
      
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      let query = `
        SELECT * FROM transactions 
        WHERE user_id = ? AND date >= ? AND date <= ? 
        ORDER BY date DESC, created_at DESC
      `;
      const params = [clerkUserId, startDateStr, endDateStr];

      if (limit) {
        query += ' LIMIT ?';
        params.push(limit);
      }

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // Format transactions for frontend compatibility
          const formattedTransactions = rows.map(transaction => ({
            ...transaction,
            description: transaction.name,
            category: this.formatPlaidCategory(transaction.category),
            type: transaction.amount < 0 ? 'expense' : 'income'
          }));
          resolve(formattedTransactions);
        }
      });
    });
  }

  // Get transaction categories by date range for category breakdown
  getTransactionCategoriesByRange(clerkUserId, startDate, days) {
    return new Promise((resolve, reject) => {
      // Calculate end date
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + days);
      
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      this.db.all(`
        SELECT 
          category,
          COUNT(*) as count,
          SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_spent,
          AVG(CASE WHEN amount > 0 THEN amount ELSE NULL END) as avg_amount,
          MAX(CASE WHEN amount > 0 THEN amount ELSE 0 END) as max_amount,
          MIN(CASE WHEN amount > 0 THEN amount ELSE NULL END) as min_amount
        FROM transactions 
        WHERE user_id = ? AND date >= ? AND date <= ? AND amount > 0 AND category IS NOT NULL
        GROUP BY category 
        ORDER BY total_spent DESC
      `, [clerkUserId, startDateStr, endDateStr], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // Format categories for frontend display
          const formattedCategories = rows.map(row => ({
            ...row,
            category: this.formatPlaidCategory(row.category),
            percentage: 0 // Will be calculated on frontend based on total
          }));
          resolve(formattedCategories);
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        } else {
          console.log('Database connection closed');
        }
      });
    }
  }
}

module.exports = new Database();