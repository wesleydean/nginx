// Enhanced haptic feedback implementation for PWAs
window.Capacitor = window.Capacitor || {};
window.Capacitor.Plugins = window.Capacitor.Plugins || {};

// Detect device
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const isAndroid = /Android/.test(navigator.userAgent);

// Create a hidden audio element for iOS haptic workaround
let hapticAudio = null;

// Initialize audio for iOS haptic workaround
function initHapticAudio() {
    if (hapticAudio) return hapticAudio;
    
    hapticAudio = document.createElement('audio');
    hapticAudio.id = 'hapticAudio';
    hapticAudio.preload = 'auto';
    hapticAudio.volume = 0; // Silent audio
    
    // Create a tiny silent audio file and set it up
    try {
        // We're now allowed to use data URIs with our updated CSP
        hapticAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'; // Empty WAV
    } catch (e) {
        // Fallback: create a short silent mp3 file and add it to the project
        hapticAudio.src = 'silent.mp3';
    }
    
    document.body.appendChild(hapticAudio);
    
    return hapticAudio;
}

// iOS haptic workaround - play and pause audio to engage audio system,
// which sometimes triggers the haptic engine on button clicks
function triggerAudioHaptic() {
    try {
        const audio = initHapticAudio();
        audio.play().then(() => {
            setTimeout(() => {
                audio.pause();
                audio.currentTime = 0;
            }, 20);
        }).catch(e => {});
    } catch (e) {
    }
}

// Implement a more reliable haptics plugin
window.Capacitor.Plugins.Haptics = {
    // Impact feedback function (light, medium, heavy)
    impact: function(options) {
        const style = (options && options.style) || 'medium';
        
        // For iOS - use audio trick + user-activated touch events
        if (isIOS) {
            triggerAudioHaptic();
        }
        
        // For Android - use vibration API
        if (isAndroid && window.navigator && window.navigator.vibrate) {
            let duration = 50; // default medium
            
            if (style === 'light') {
                duration = 25;
            } else if (style === 'heavy') {
                duration = 100;
            }
            
            window.navigator.vibrate(duration);
        }
        
        return Promise.resolve();
    },
    
    // Notification feedback (success, warning, error)
    notification: function(options) {
        const type = (options && options.type) || 'success';
        
        // For iOS - use audio trick + user-activated touch events
        if (isIOS) {
            triggerAudioHaptic();
        }
        
        // For Android - use vibration API with patterns
        if (isAndroid && window.navigator && window.navigator.vibrate) {
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
        }
        
        return Promise.resolve();
    },
    
    // Selection changed feedback (for iOS)
    selectionChanged: function() {
        // For iOS - use a very subtle audio trick
        if (isIOS) {
            triggerAudioHaptic();
        }
        
        // For Android - use minimal vibration
        if (isAndroid && window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(10);
        }
        
        return Promise.resolve();
    },
    
    // Vibration with specific pattern
    vibrate: function(options) {
        const duration = (options && options.duration) ? options.duration : 300;
        
        // For iOS - use audio trick
        if (isIOS) {
            triggerAudioHaptic();
        }
        
        // For Android - use vibration API
        if (isAndroid && window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(duration);
        }
        
        return Promise.resolve();
    }
};

// Add click listener to document to activate iOS audio context 
// (iOS requires user interaction to enable audio)
document.addEventListener('click', function() {
    // Initialize audio on first user interaction
    if (isIOS && !hapticAudio) {
        initHapticAudio();
    }
}, { once: true });

// Add a simple test function
window.testHaptics = function() {
    window.Capacitor.Plugins.Haptics.impact({style: 'medium'})
        .then(() => {})
        .catch(e => {});
};
