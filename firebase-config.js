// Firebase settings for the shared family log. See SETUP-FIREBASE.md.
// Pump Track shares the Twin Track Firebase project (same sign-in, same family list);
// its entries live in their own `pumps` collection.
// These identify the project; they are not secret. Access is controlled by firestore.rules.
const PUMP_TRACK_FIREBASE = {
  apiKey: 'AIzaSyB4D8HeTFU25yxhL4EhmugH2c_B96tOMRs',
  authDomain: 'twin-track-e6830.firebaseapp.com',
  projectId: 'twin-track-e6830',
  storageBucket: 'twin-track-e6830.firebasestorage.app',
  messagingSenderId: '189507790684',
  appId: '1:189507790684:web:a9c59d857745e6c0544399',
};

// Set this to null to switch the shared log off and keep entries only on each device.
window.FIREBASE_CONFIG = PUMP_TRACK_FIREBASE;
