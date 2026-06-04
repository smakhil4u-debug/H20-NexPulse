// Firebase Configuration
// REAL H2O NEXPULSE KEYS
const firebaseConfig = {
  apiKey: "AIzaSyAHMVJ_kuOvTZlmqQVD6LVBjI-iVyybAvs",
  authDomain: "h20-nexpulse.firebaseapp.com",
  projectId: "h20-nexpulse",
  storageBucket: "h20-nexpulse.firebasestorage.app",
  messagingSenderId: "817190069993",
  appId: "1:817190069993:web:bba260970770c905bfb278",
  measurementId: "G-5XGTE3Z4V7"
};

// Initialize Firebase (Compat SDK)
if (window.firebase) {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase Production Instance Initialized.");
}

/**
 * Ensures the ReCAPTCHA verifier is ready for use.
 * This MUST be called after the DOM is ready.
 */
function initRecaptcha() {
    if (window.recaptchaVerifier) return window.recaptchaVerifier;

    try {
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
            'size': 'invisible'
        });
        console.log("ReCAPTCHA Verifier Ready.");
        return window.recaptchaVerifier;
    } catch (err) {
        console.error("Failed to init ReCAPTCHA:", err);
        return null;
    }
}
