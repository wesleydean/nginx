// New updateSaveBalanceHistory function to replace in index.html
function updateSaveBalanceHistory() {
    const balances = loadAccountBalances();
    const historyContainer = document.getElementById('saveBalanceHistory');
    
    if (!historyContainer) return;
    
    // Group balance records by account for the selected month
    const selectedMonthKey = getSelectedSaveMonthKey();
    const previousMonth = new Date(selectedSaveMonthDate);
    previousMonth.setMonth(previousMonth.getMonth() - 1);
    const previousMonthKey = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`;

    // Ensure savingsAccounts is initialized
    if (!savingsAccounts || savingsAccounts.length === 0) {
        const savedAccounts = localStorage.getItem('savingsAccounts');
        if (savedAccounts) {
            savingsAccounts = JSON.parse(savedAccounts);
        }
    }
    
    // Group accounts by type
    const accountTypes = {
        'cash': { title: 'Cash Accounts', accounts: [] },
        'investment': { title: 'Investments', accounts: [] },
        'liability': { title: 'Debt', accounts: [] },
        'other': { title: 'Other Accounts', accounts: [] }
    };
    
    console.log('savingsAccounts:', savingsAccounts);
    console.log('balances:', balances);

    // Prepare grouped data
    const grouped = {};
    savingsAccounts.forEach(account => {
        // Determine account type - default to 'other' if not specified
        const accountType = account.type || 'other';
        
        const accountBalances = balances[account.id] || {};
        // Get all updates for the selected month, sort by date (chronologically, not alphabetically)
        const monthUpdates = Object.keys(accountBalances)
            .filter(date => date.startsWith(selectedMonthKey))
            .map(date => {
                const entry = accountBalances[date];
                return {
                    date,
                    amount: entry.amount !== undefined ? entry.amount : entry,
                    created: entry.created || new Date(date).getTime(),
                    updated: entry.updated || entry.created || new Date(date).getTime()
                };
            })
            .sort((a, b) => {
                // Sort by date (most recent first)
                return new Date(b.date) - new Date(a.date);
            });
        // Get last value from previous month
        const prevMonthDates = Object.keys(accountBalances)
            .filter(date => date.startsWith(previousMonthKey))
            .sort();
        const prevMonthLastDate = prevMonthDates.length > 0 ? prevMonthDates[prevMonthDates.length - 1] : null;
        const prevMonthLastValue = prevMonthLastDate ? (accountBalances[prevMonthLastDate].amount !== undefined ? accountBalances[prevMonthLastDate].amount : accountBalances[prevMonthLastDate]) : 0;
        
        grouped[account.id] = {
            name: account.name,
            type: accountType,
            monthUpdates,
            prevMonthLastValue
        };
        
        // Only add to type group if it has updates this month
        if (monthUpdates.length > 0) {
            // Add to the appropriate type group
            if (accountTypes[accountType]) {
                accountTypes[accountType].accounts.push(account.id);
            } else {
                accountTypes.other.accounts.push(account.id);
            }
        }
    });

    // Render account sections by type
    let html = '';
    let anyData = false;
    
    // Process each account type section
    Object.keys(accountTypes).forEach(type => {
        const { title, accounts } = accountTypes[type];
        
        // Skip types with no accounts
        if (accounts.length === 0) return;
        
        // Create section header
        html += `
        <div class="account-type-section">
            <div class="card-header">
                <h3 class="section-title">${title}</h3>
            </div>
            <div class="card-body">
        `;
        
        // Add accounts for this section
        accounts.forEach(accountId => {
            const { name, monthUpdates } = grouped[accountId];
            anyData = true;
            
            // Latest value for the selected month (should be first in the array since we sorted by date descending)
            const latest = monthUpdates[0];
            console.log(`Latest balance for ${name} (${accountId}): ${formatCurrency(latest.amount)} on ${latest.date}`);
            
            // Calculate all-time percent (from first ever value)
            const accountBalances = balances[accountId] || {};
            const allDates = Object.keys(accountBalances).sort(); // Sort chronologically
            const firstValue = allDates.length > 0 ? 
                (accountBalances[allDates[0]].amount !== undefined ? 
                    accountBalances[allDates[0]].amount : accountBalances[allDates[0]]) : 0;
            const allTimePercent = firstValue && latest.amount ? ((latest.amount - firstValue) / firstValue) * 100 : 0;
            
            // Accordion header: account name, latest value
            html += `<div class="modern-account-accordion" data-account-id="${accountId}">
                <div class="modern-account-accordion-header" onclick="toggleAccountAccordion('${accountId}')">
                    <div class="modern-account-header-left">
                        <div class="modern-account-title">${name}</div>
                    </div>
                    <div class="modern-account-header-right">
                        <div class="modern-account-balance">${formatCurrency(latest.amount)}</div>
                    </div>
                    <div class="account-chevron"><i data-lucide="chevron-down" class="modern-account-chevron" id="chevron-${accountId}"></i></div>
                </div>
                <div class="modern-account-accordion-body" id="accordion-body-${accountId}">
                    <div class="modern-account-updates">
            `;
            
            // Sort updates by date in descending order (newest first)
            const sortedUpdates = [...monthUpdates].sort((a, b) => {
                return new Date(b.date) - new Date(a.date);
            });
            
            // Process updates in chronological order for display
            let prevValue = null;
            let prevDate = null;
            
            // First pass to determine previous values
            const updatesWithPercents = sortedUpdates.map((update, index) => {
                // Calculate percent change from previous value (next in array)
                let percent = null;
                let arrow = '';
                
                // If we have a next item (which is the previous date's value)
                const nextItem = sortedUpdates[index + 1];
                if (nextItem) {
                    const previousAmount = nextItem.amount;
                    if (previousAmount !== null && previousAmount !== 0) {
                        percent = ((update.amount - previousAmount) / Math.abs(previousAmount)) * 100;
                        if (percent > 0.01) {
                            arrow = '<i data-lucide="arrow-up-right" class="balance-arrow positive"></i>';
                        } else if (percent < -0.01) {
                            arrow = '<i data-lucide="arrow-down-right" class="balance-arrow negative"></i>';
                        } else {
                            arrow = '<i data-lucide="arrow-right" class="balance-arrow neutral"></i>';
                        }
                    }
                }
                
                const percentClass = percent > 0 ? 'positive' : percent < 0 ? 'negative' : 'neutral';
                
                const [year, month, day] = update.date.split('-').map(Number);
                const dateObj = new Date(year, month - 1, day);
                const displayDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                
                return {
                    ...update,
                    displayDate,
                    percent,
                    percentClass,
                    arrow
                };
            });
            
            // Render updates
            updatesWithPercents.forEach(update => {
                html += `<div class="swipe-container" data-type="balance" data-account-id="${accountId}" data-date="${update.date}">
                    <div class="swipe-content">
                        <div class="modern-account-update-row">
                            <div class="modern-update-date">${update.displayDate}</div>
                            <div class="modern-update-amount-stack">
                            <div class="modern-update-diff">${formatCurrency(update.amount)}</div>
                            <div class="modern-update-percent ${update.percentClass}">${update.percent !== null ? `${update.arrow}${update.percent >= 0 ? '+' : ''}${update.percent.toFixed(2)}%` : '--'}</div>
                            </div>
                        </div>
                    </div>
                    <div class="swipe-action" onclick="handleBalanceDelete(this); event.stopPropagation(); return false;"><i data-lucide="x" class="w-4 h-4"></i></div>
                </div>`;
            });
            
            html += `</div></div></div>`;
        });
        
        html += `</div></div>`;
    });
    
    if (!anyData) {
        const selectedMonthName = selectedSaveMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        html = `<div style="text-align: center; color: #7f8c8d; padding: 20px;">No balance records for ${selectedMonthName}</div>`;
    }
    
    historyContainer.innerHTML = html;
    
    // Ensure Lucide icons are rendered
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}
