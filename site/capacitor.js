// Simplified Capacitor plugin implementation for haptic feedback in PWAs
window.Capacitor = window.Capacitor || {};
window.Capacitor.Plugins = window.Capacitor.Plugins || {};

// Implement a simple haptics plugin for iOS
window.Capacitor.Plugins.Haptics = {
    // Impact feedback function (light, medium, heavy)
    impact: function(options) {
        const style = (options && options.style) || 'medium';
        
        // Try to use the native iOS haptic API if available
        if ('ImpactFeedbackGenerator' in window) {
            try {
                const impactFeedback = new window.ImpactFeedbackGenerator(style);
                impactFeedback.prepare();
                impactFeedback.impact();
                return Promise.resolve();
            } catch (e) {
                console.log('Native haptics error:', e);
            }
        }
        
        // Fallback to vibration API for Android
        if (window.navigator && window.navigator.vibrate) {
            let duration = 50; // default medium
            
            if (style === 'light') {
                duration = 25;
            } else if (style === 'heavy') {
                duration = 100;
            }
            
            window.navigator.vibrate(duration);
            return Promise.resolve();
        }
        
        // No haptic feedback available
        return Promise.resolve();
    },
    
    // Notification feedback (success, warning, error)
    notification: function(options) {
        const type = (options && options.type) || 'success';
        
        // Try to use the native iOS haptic API if available
        if ('NotificationFeedbackGenerator' in window) {
            try {
                const notificationFeedback = new window.NotificationFeedbackGenerator();
                notificationFeedback.prepare();
                notificationFeedback.notification(type);
                return Promise.resolve();
            } catch (e) {
                console.log('Native haptics error:', e);
            }
        }
        
        // Fallback to vibration API for Android
        if (window.navigator && window.navigator.vibrate) {
            let pattern;
            
            switch (type) {
                case 'success':
                    pattern = [50, 50, 100];
                    break;
                case 'warning':
                    pattern = [30, 40, 30, 40, 30];
                    break;
                case 'error':
                    pattern = [100, 50, 100, 50, 100];
                    break;
                default:
                    pattern = 50;
            }
            
            window.navigator.vibrate(pattern);
            return Promise.resolve();
        }
        
        // No haptic feedback available
        return Promise.resolve();
    },
    
    // Selection changed feedback (for iOS)
    selectionChanged: function() {
        // Try to use the native iOS haptic API if available
        if ('SelectionFeedbackGenerator' in window) {
            try {
                const selectionFeedback = new window.SelectionFeedbackGenerator();
                selectionFeedback.prepare();
                selectionFeedback.selectionChanged();
                return Promise.resolve();
            } catch (e) {
                console.log('Native haptics error:', e);
            }
        }
        
        // Minimal vibration for Android
        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(10);
            return Promise.resolve();
        }
        
        // No haptic feedback available
        return Promise.resolve();
    },
    
    // Vibration with specific pattern
    vibrate: function(options) {
        const duration = (options && options.duration) ? options.duration : 300;
        
        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(duration);
            return Promise.resolve();
        }
        
        return Promise.resolve();
    }
};

// iOS-specific polyfills for testing in browser
if (typeof window !== 'undefined' && !('ImpactFeedbackGenerator' in window) && 
    /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    
    window.ImpactFeedbackGenerator = class ImpactFeedbackGenerator {
        constructor(style) {
            this.style = style;
        }
        
        prepare() {}
        
        impact() {
            console.log('iOS haptic impact:', this.style);
        }
    };
    
    window.NotificationFeedbackGenerator = class NotificationFeedbackGenerator {
        prepare() {}
        
        notification(type) {
            console.log('iOS haptic notification:', type);
        }
    };
    
    window.SelectionFeedbackGenerator = class SelectionFeedbackGenerator {
        prepare() {}
        
        selectionChanged() {
            console.log('iOS haptic selection changed');
        }
    };
}
