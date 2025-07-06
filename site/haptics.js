/**
 * Enhanced haptic feedback utility for iOS and Android
 * This provides multiple approaches to trigger haptic feedback
 */

// Detect device type
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const isAndroid = /Android/.test(navigator.userAgent);
const isMobile = isIOS || isAndroid;

// Create a hidden button for iOS haptic workaround
let hiddenButton = null;

// Initialize iOS haptic elements
function initIOSHaptics() {
    if (hiddenButton) return;
    
    // Create a hidden button that can receive "click" events
    // iOS often provides haptic feedback on button clicks
    hiddenButton = document.createElement('button');
    hiddenButton.id = 'hapticButton';
    hiddenButton.setAttribute('aria-hidden', 'true');
    hiddenButton.style.position = 'absolute';
    hiddenButton.style.opacity = '0';
    hiddenButton.style.pointerEvents = 'none';
    hiddenButton.style.left = '-1000px';
    hiddenButton.style.top = '-1000px';
    document.body.appendChild(hiddenButton);
    
    // Create a style for CSS animation-based haptics
    const style = document.createElement('style');
    style.textContent = `
        @keyframes haptic-pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
        .haptic-feedback {
            animation: haptic-pulse 0.15s ease-in-out;
        }
    `;
    document.head.appendChild(style);
    
    return hiddenButton;
}

// Combined approach to trigger haptic feedback
function triggerCombinedHaptic(intensity = 'medium') {
    // Multiple approaches to increase chances of success on iOS
    
    if (isIOS) {
        // 1. Click the hidden button
        const button = initIOSHaptics();
        button.click();
        
        // 2. Use CSS animation trick (can sometimes trigger haptics)
        document.body.classList.add('haptic-feedback');
        setTimeout(() => {
            document.body.classList.remove('haptic-feedback');
        }, 150);
        
        // 3. Dispatch touch events
        try {
            const touchEvent = new TouchEvent('touchend', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            document.body.dispatchEvent(touchEvent);
        } catch (e) {
            // Touch events may not be constructable in all browsers
        }
    }
    
    // Use vibration API for Android
    if (isAndroid && window.navigator && window.navigator.vibrate) {
        let duration = 50;
        if (intensity === 'light') duration = 25;
        if (intensity === 'heavy') duration = 100;
        window.navigator.vibrate(duration);
    }
    
    // Always try the Capacitor plugin if available
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
        window.Capacitor.Plugins.Haptics.impact({ style: intensity });
    }
}

const Haptics = {
    /**
     * Trigger impact feedback with specified intensity
     * @param {'light' | 'medium' | 'heavy'} style - The intensity of the impact
     */
    impact: function(style = 'medium') {
        triggerCombinedHaptic(style);
        return Promise.resolve();
    },

    /**
     * Trigger notification feedback with specified type
     * @param {'success' | 'warning' | 'error'} type - The type of notification
     */
    notification: function(type = 'success') {
        // Try multiple approaches
        triggerCombinedHaptic('medium');
        
        // Also try Capacitor plugin for notification
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
            window.Capacitor.Plugins.Haptics.notification({ type });
        }
        
        // For Android, use vibration patterns
        if (isAndroid && window.navigator && window.navigator.vibrate) {
            const pattern = type === 'success' ? [50, 50, 100] : 
                          type === 'warning' ? [30, 40, 30, 40, 30] :
                          [100, 50, 100];
            window.navigator.vibrate(pattern);
        }
        
        return Promise.resolve();
    },

    /**
     * Trigger selection change feedback
     */
    selectionChanged: function() {
        triggerCombinedHaptic('light');
        
        // Also try Capacitor plugin
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
            window.Capacitor.Plugins.Haptics.selectionChanged();
        }
        
        return Promise.resolve();
    },

    /**
     * Trigger vibration with specified duration
     * @param {number} duration - Duration of vibration in milliseconds
     */
    vibrate: function(duration = 50) {
        // For Android, use vibration API
        if (isAndroid && window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(duration);
        }
        
        // For iOS, try combined approach
        if (isIOS) {
            triggerCombinedHaptic(duration > 75 ? 'heavy' : duration > 30 ? 'medium' : 'light');
        }
        
        // Also try Capacitor plugin
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
            window.Capacitor.Plugins.Haptics.vibrate({ duration });
        }
        
        return Promise.resolve();
    }
};

// Initialize iOS haptics on page load
document.addEventListener('DOMContentLoaded', function() {
    if (isIOS) {
        initIOSHaptics();
    }
});

// Initialize on first user interaction (required for iOS audio/haptics)
document.addEventListener('click', function() {
    if (isIOS) {
        initIOSHaptics();
    }
}, { once: true });

// Make available globally
window.Haptics = Haptics;

// Export a test function
window.testHapticFeedback = function() {
    console.log('Testing haptic feedback...');
    Haptics.impact('medium');
    
    // Test all intensities with delay
    setTimeout(() => Haptics.impact('light'), 1000);
    setTimeout(() => Haptics.impact('medium'), 2000);
    setTimeout(() => Haptics.impact('heavy'), 3000);
    
    // Test notifications
    setTimeout(() => Haptics.notification('success'), 4000);
    
    console.log('Haptic test sequence initiated');
};
