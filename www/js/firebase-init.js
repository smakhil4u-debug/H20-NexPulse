// Firebase Configuration
// Replace the values below with your actual keys from Firebase Console Settings
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
if (window.firebase) {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase initialized.");
    
    // Create the global ReCAPTCHA verifier
    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        'size': 'invisible'
    });
}
