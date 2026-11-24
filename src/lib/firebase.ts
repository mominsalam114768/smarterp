import { initializeApp } from 'firebase/app';
import { 
  getFirestore,
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  onSnapshot,
  getDocFromServer,
  Timestamp,
  serverTimestamp,
  limit,
  arrayRemove,
  arrayUnion,
  deleteField
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseAppletConfig from '../../firebase-applet-config.json';

const rawEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};

const resolvedFirebaseConfig = {
  apiKey: rawEnv.VITE_FIREBASE_API_KEY || firebaseAppletConfig.apiKey,
  authDomain: rawEnv.VITE_FIREBASE_AUTH_DOMAIN || firebaseAppletConfig.authDomain,
  projectId: rawEnv.VITE_FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId,
  storageBucket: rawEnv.VITE_FIREBASE_STORAGE_BUCKET || firebaseAppletConfig.storageBucket,
  messagingSenderId: rawEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseAppletConfig.messagingSenderId,
  appId: rawEnv.VITE_FIREBASE_APP_ID || firebaseAppletConfig.appId,
  measurementId:
    rawEnv.VITE_FIREBASE_MEASUREMENT_ID ||
    (firebaseAppletConfig as { measurementId?: string }).measurementId ||
    '',
};

export const GOOGLE_OAUTH_CLIENT_ID =
  rawEnv.VITE_GOOGLE_OAUTH_CLIENT_ID ||
  (firebaseAppletConfig as { oauthClientId?: string }).oauthClientId ||
  '';

/**
 * Anti-Cloning Domain Verification:
 * Checks whether the current hostname is authorized when VITE_ALLOWED_DOMAINS is configured,
 * while always permitting official preview/Cloudflare Pages/local development hosts if not overridden.
 */
export function isAuthorizedDomain(): boolean {
  if (typeof window === 'undefined') return true;
  const host = (window.location.hostname || '').toLowerCase();
  if (!host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.run.app')) {
    return true;
  }
  const configuredList = (rawEnv.VITE_ALLOWED_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (configuredList.length === 0) {
    return true;
  }
  return configuredList.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

const app = initializeApp(resolvedFirebaseConfig);
const resolvedDatabaseId =
  rawEnv.VITE_FIREBASE_DATABASE_ID ||
  (firebaseAppletConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  '(default)';
export const db = getFirestore(app, resolvedDatabaseId);
export const auth = getAuth(app);

// Error Handling according to integration rules
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test - Non-blocking
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Offline or Firebase config issue.");
    }
  }
}

export { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  onSnapshot,
  getDocFromServer,
  Timestamp,
  serverTimestamp,
  limit,
  arrayRemove,
  arrayUnion,
  deleteField
};
