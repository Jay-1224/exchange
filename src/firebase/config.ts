import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  doc,
  getDocFromServer,
  type Firestore,
} from 'firebase/firestore';
import appletConfig from '../../firebase-applet-config.json';

const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || appletConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || appletConfig.appId,
};

const databaseId =
  import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || appletConfig.firestoreDatabaseId;

export const firebaseApp: FirebaseApp =
  getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(envConfig);

function createFirestoreInstance(): Firestore {
  try {
    return databaseId
      ? initializeFirestore(firebaseApp, { experimentalAutoDetectLongPolling: true }, databaseId)
      : initializeFirestore(firebaseApp, { experimentalAutoDetectLongPolling: true });
  } catch {
    return databaseId ? getFirestore(firebaseApp, databaseId) : getFirestore(firebaseApp);
  }
}

export const db: Firestore = createFirestoreInstance();

export const auth: Auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const CONN_CHECK_KEY = 'nws_fs_conn_checked_v1';

async function testConnection() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(CONN_CHECK_KEY)) {
      return;
    }
    await getDocFromServer(doc(db, 'market_settings', 'global'));
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(CONN_CHECK_KEY, '1');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: Firestore client is offline.');
    }
  }
}

void testConnection();
