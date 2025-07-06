/* 
 * Debug tools and utilities for the PWA
 */

// Test haptic feedback patterns
function testHapticPatterns() {
    const results = document.getElementById('hapticTestResults');
    if (results) results.innerHTML = '';
    
    // Log test initiation
    console.log('Testing haptic feedback patterns...');
    logHapticResult('Starting haptic test sequence');
    
    // Test all haptic types with delays
    setTimeout(() => {
        Haptics.impact('light');
        logHapticResult('Tested: light impact');
    }, 500);
    
    setTimeout(() => {
        Haptics.impact('medium');
        logHapticResult('Tested: medium impact');
    }, 1500);
    
    setTimeout(() => {
        Haptics.impact('heavy');
        logHapticResult('Tested: heavy impact');
    }, 2500);
    
    setTimeout(() => {
        Haptics.notification('success');
        logHapticResult('Tested: success notification');
    }, 3500);
    
    setTimeout(() => {
        Haptics.notification('warning');
        logHapticResult('Tested: warning notification');
    }, 4500);
    
    setTimeout(() => {
        Haptics.notification('error');
        logHapticResult('Tested: error notification');
    }, 5500);
    
    setTimeout(() => {
        Haptics.selectionChanged();
        logHapticResult('Tested: selection changed');
    }, 6500);
    
    // Also try direct Capacitor calls as fallback
    setTimeout(() => {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
            window.Capacitor.Plugins.Haptics.impact({style: 'medium'});
            logHapticResult('Tested: direct Capacitor impact');
        }
    }, 7500);
}

// Log haptic test result
function logHapticResult(message) {
    console.log(message);
    const results = document.getElementById('hapticTestResults');
    if (results) {
        const line = document.createElement('div');
        line.textContent = message;
        results.appendChild(line);
    }
}

// Test user-activated haptic feedback
function testUserActivatedHaptic() {
    // Create a temporary element for user to interact with
    const testElement = document.createElement('div');
    testElement.className = 'haptic-test-element';
    testElement.textContent = 'Tap here for haptic';
    testElement.style.position = 'fixed';
    testElement.style.bottom = '100px';
    testElement.style.left = '50%';
    testElement.style.transform = 'translateX(-50%)';
    testElement.style.background = '#3b82f6';
    testElement.style.color = 'white';
    testElement.style.padding = '12px 24px';
    testElement.style.borderRadius = '8px';
    testElement.style.zIndex = '9999';
    testElement.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    
    // Add event listener
    testElement.addEventListener('click', () => {
        Haptics.impact('medium');
        testElement.textContent = 'Haptic triggered!';
        setTimeout(() => {
            document.body.removeChild(testElement);
        }, 1000);
    });
    
    document.body.appendChild(testElement);
    
    // Remove after 10 seconds if not clicked
    setTimeout(() => {
        if (document.body.contains(testElement)) {
            document.body.removeChild(testElement);
        }
    }, 10000);
}

// Toggle the haptic test panel
function toggleHapticTestPanel() {
    let panel = document.getElementById('hapticTestPanel');
    
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'hapticTestPanel';
        panel.className = 'haptic-test-panel';
        panel.innerHTML = `
            <div class="haptic-test-header">
                <h3>Haptic Feedback Test</h3>
                <button id="closeHapticPanel">✕</button>
            </div>
            <div class="haptic-test-buttons">
                <button id="testLightHaptic">Light Impact</button>
                <button id="testMediumHaptic">Medium Impact</button>
                <button id="testHeavyHaptic">Heavy Impact</button>
                <button id="testSuccessHaptic">Success</button>
                <button id="testWarningHaptic">Warning</button>
                <button id="testErrorHaptic">Error</button>
                <button id="testSelectionHaptic">Selection</button>
                <button id="runAllTests">Run All Tests</button>
            </div>
            <div id="hapticTestResults" class="haptic-test-results"></div>
        `;
        
        // Add styles
        panel.style.position = 'fixed';
        panel.style.bottom = '0';
        panel.style.left = '0';
        panel.style.right = '0';
        panel.style.background = 'white';
        panel.style.borderTopLeftRadius = '12px';
        panel.style.borderTopRightRadius = '12px';
        panel.style.boxShadow = '0 -4px 12px rgba(0,0,0,0.1)';
        panel.style.padding = '16px';
        panel.style.zIndex = '9999';
        panel.style.transform = 'translateY(0)';
        panel.style.transition = 'transform 0.3s ease';
        
        // Header styles
        const header = panel.querySelector('.haptic-test-header');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '16px';
        
        // Button container styles
        const buttons = panel.querySelector('.haptic-test-buttons');
        buttons.style.display = 'grid';
        buttons.style.gridTemplateColumns = 'repeat(2, 1fr)';
        buttons.style.gap = '8px';
        buttons.style.marginBottom = '16px';
        
        // Individual button styles
        panel.querySelectorAll('button').forEach(btn => {
            btn.style.padding = '10px';
            btn.style.borderRadius = '8px';
            btn.style.border = 'none';
            btn.style.background = '#f0f0f0';
            btn.style.cursor = 'pointer';
        });
        
        // Results area styles
        const results = panel.querySelector('.haptic-test-results');
        results.style.maxHeight = '150px';
        results.style.overflow = 'auto';
        results.style.padding = '8px';
        results.style.background = '#f5f5f5';
        results.style.borderRadius = '8px';
        results.style.fontSize = '14px';
        
        document.body.appendChild(panel);
        
        // Add event listeners
        document.getElementById('closeHapticPanel').addEventListener('click', toggleHapticTestPanel);
        document.getElementById('testLightHaptic').addEventListener('click', () => {
            Haptics.impact('light');
            logHapticResult('Light impact triggered');
        });
        document.getElementById('testMediumHaptic').addEventListener('click', () => {
            Haptics.impact('medium');
            logHapticResult('Medium impact triggered');
        });
        document.getElementById('testHeavyHaptic').addEventListener('click', () => {
            Haptics.impact('heavy');
            logHapticResult('Heavy impact triggered');
        });
        document.getElementById('testSuccessHaptic').addEventListener('click', () => {
            Haptics.notification('success');
            logHapticResult('Success notification triggered');
        });
        document.getElementById('testWarningHaptic').addEventListener('click', () => {
            Haptics.notification('warning');
            logHapticResult('Warning notification triggered');
        });
        document.getElementById('testErrorHaptic').addEventListener('click', () => {
            Haptics.notification('error');
            logHapticResult('Error notification triggered');
        });
        document.getElementById('testSelectionHaptic').addEventListener('click', () => {
            Haptics.selectionChanged();
            logHapticResult('Selection changed triggered');
        });
        document.getElementById('runAllTests').addEventListener('click', () => {
            testHapticPatterns();
        });
    } else {
        document.body.removeChild(panel);
    }
}

// Add haptic test button to the UI
function addHapticTestButton() {
    const testButton = document.createElement('button');
    testButton.id = 'hapticTestButton';
    testButton.innerHTML = '📳';
    testButton.title = 'Test Haptic Feedback';
    
    // Style the button
    testButton.style.position = 'fixed';
    testButton.style.bottom = '20px';
    testButton.style.right = '20px';
    testButton.style.width = '50px';
    testButton.style.height = '50px';
    testButton.style.borderRadius = '50%';
    testButton.style.background = '#3b82f6';
    testButton.style.color = 'white';
    testButton.style.border = 'none';
    testButton.style.fontSize = '24px';
    testButton.style.display = 'flex';
    testButton.style.justifyContent = 'center';
    testButton.style.alignItems = 'center';
    testButton.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    testButton.style.cursor = 'pointer';
    testButton.style.zIndex = '9998';
    
    // Add event listener
    testButton.addEventListener('click', toggleHapticTestPanel);
    
    // Append to body (disable for now)
    // document.body.appendChild(testButton);
}

// Initialize haptic testing
document.addEventListener('DOMContentLoaded', function() {
    // Add the test button after a delay to not interfere with main app loading
    setTimeout(addHapticTestButton, 2000);
});
