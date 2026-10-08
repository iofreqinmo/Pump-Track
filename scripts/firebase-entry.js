// The Firebase functions the app uses. Bundled into vendor/firebase.js by build-firebase.sh
// so the app has no CDN dependency and works offline.
export { initializeApp } from 'firebase/app';
export {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signInWithCredential, onAuthStateChanged, signOut, connectAuthEmulator,
} from 'firebase/auth';
export {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch, onSnapshot, query, where,
} from 'firebase/firestore';
