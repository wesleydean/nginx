/**
 * Enhanced haptic feedback utility for iOS and Android
 * This builds on top of Capacitor and provides easy-to-use haptic feedback functions
 */

const Haptics = {
    /**
     * Trigger impact feedback with specified intensity
     * @param {'light' | 'medium' | 'heavy'} style - The intensity of the impact
     */
    impact: function(style = 'medium') {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
            return window.Capacitor.Plugins.Haptics.impact({ style });
        }
        return Promise.resolve();
    },

    /**
     * Trigger notification feedback with specified type
     * @param {'success' | 'warning' | 'error'} type - The type of notification
     */
    notification: function(type = 'success') {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
            return window.Capacitor.Plugins.Haptics.notification({ type });
        }
        return Promise.resolve();
    },

    /**
     * Trigger selection change feedback
     */
    selectionChanged: function() {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
            return window.Capacitor.Plugins.Haptics.selectionChanged();
        }
        return Promise.resolve();
    },

    /**
     * Trigger vibration with specified duration
     * @param {number} duration - Duration of vibration in milliseconds
     */
    vibrate: function(duration = 50) {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
            return window.Capacitor.Plugins.Haptics.vibrate({ duration });
        }
        return Promise.resolve();
    }
};

// Make available globally
window.Haptics = Haptics;
