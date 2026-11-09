/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { auth, db, doc, getDoc, setDoc } from "./firebase";

export interface SavedDriveAccount {
  email: string;
  displayName?: string;
  photoURL?: string;
  accessToken?: string;
  connectedAt: string;
  autoBackupEnabled: boolean;
  lastBackupAt?: string;
  backupIntervalHours?: number;
}

const DRIVE_ACCOUNT_STORAGE_KEY = "smart_business_drive_account";
const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/drive.file");

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let currentGoogleUser: { email: string; displayName?: string; photoURL?: string } | null = null;

// Read saved account from localStorage
export const getSavedDriveAccount = (): SavedDriveAccount | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRIVE_ACCOUNT_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("Failed to parse saved drive account:", e);
  }
  return null;
};

// Save drive account locally and in Firestore
export const saveDriveAccount = async (account: SavedDriveAccount) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(DRIVE_ACCOUNT_STORAGE_KEY, JSON.stringify(account));
  }
  if (account.accessToken) {
    cachedAccessToken = account.accessToken;
  }
  currentGoogleUser = {
    email: account.email,
    displayName: account.displayName,
    photoURL: account.photoURL
  };

  // Sync to Firestore cloud config so all admin sessions know Drive is connected
  try {
    const configRef = doc(db, "businesses", "main-business", "config", "drive_backup");
    await setDoc(configRef, {
      email: account.email,
      displayName: account.displayName || "",
      connectedAt: account.connectedAt,
      autoBackupEnabled: account.autoBackupEnabled !== false,
      lastBackupAt: account.lastBackupAt || null,
      backupIntervalHours: account.backupIntervalHours || 6,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn("Could not sync drive account to Firestore:", err);
  }
};

// Load saved drive account from Firestore cloud config
export const fetchCloudDriveAccount = async (): Promise<SavedDriveAccount | null> => {
  try {
    const configRef = doc(db, "businesses", "main-business", "config", "drive_backup");
    const snap = await getDoc(configRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data && data.email) {
        const local = getSavedDriveAccount();
        const merged: SavedDriveAccount = {
          email: data.email,
          displayName: data.displayName || local?.displayName || "",
          photoURL: local?.photoURL || "",
          accessToken: local?.accessToken || undefined,
          connectedAt: data.connectedAt || new Date().toISOString(),
          autoBackupEnabled: data.autoBackupEnabled !== false,
          lastBackupAt: data.lastBackupAt || local?.lastBackupAt,
          backupIntervalHours: data.backupIntervalHours || 6
        };
        if (typeof window !== "undefined") {
          localStorage.setItem(DRIVE_ACCOUNT_STORAGE_KEY, JSON.stringify(merged));
        }
        currentGoogleUser = {
          email: merged.email,
          displayName: merged.displayName,
          photoURL: merged.photoURL
        };
        return merged;
      }
    }
  } catch (err) {
    console.warn("Failed to fetch cloud drive account:", err);
  }
  return getSavedDriveAccount();
};

export const disconnectDriveAccount = async () => {
  cachedAccessToken = null;
  currentGoogleUser = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem(DRIVE_ACCOUNT_STORAGE_KEY);
  }
  try {
    const configRef = doc(db, "businesses", "main-business", "config", "drive_backup");
    await setDoc(configRef, {
      email: null,
      disconnectedAt: new Date().toISOString(),
      autoBackupEnabled: false
    }, { merge: true });
  } catch (e) {
    console.warn("Failed to clear cloud drive account:", e);
  }
};

export const initDriveAuth = (
  onAuthSuccess?: (user: { email: string; displayName?: string; photoURL?: string }, token: string) => void,
  onAuthFailure?: () => void
) => {
  // Check local saved account first
  const saved = getSavedDriveAccount();
  if (saved && saved.email) {
    currentGoogleUser = {
      email: saved.email,
      displayName: saved.displayName,
      photoURL: saved.photoURL
    };
    if (saved.accessToken) {
      cachedAccessToken = saved.accessToken;
      if (onAuthSuccess) onAuthSuccess(currentGoogleUser, saved.accessToken);
    }
  }

  // Also check Firestore in background
  fetchCloudDriveAccount().then(cloudAcc => {
    if (cloudAcc && cloudAcc.email) {
      currentGoogleUser = {
        email: cloudAcc.email,
        displayName: cloudAcc.displayName,
        photoURL: cloudAcc.photoURL
      };
      if (cloudAcc.accessToken && onAuthSuccess) {
        onAuthSuccess(currentGoogleUser, cloudAcc.accessToken);
      }
    }
  });

  return onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
    if (user && user.email) {
      currentGoogleUser = {
        email: user.email,
        displayName: user.displayName || undefined,
        photoURL: user.photoURL || undefined
      };
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(currentGoogleUser, cachedAccessToken);
      }
    }
  });
};

export const googleDriveSignIn = async (): Promise<{ user: { email: string; displayName?: string; photoURL?: string }; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("গুগল ড্রাইভ অ্যাক্সেস টোকেন পাওয়া যায়নি");
    }

    cachedAccessToken = credential.accessToken;
    const gUser = {
      email: result.user.email || "Google User",
      displayName: result.user.displayName || undefined,
      photoURL: result.user.photoURL || undefined
    };
    currentGoogleUser = gUser;

    const savedAcc: SavedDriveAccount = {
      email: gUser.email,
      displayName: gUser.displayName,
      photoURL: gUser.photoURL,
      accessToken: cachedAccessToken,
      connectedAt: new Date().toISOString(),
      autoBackupEnabled: true,
      backupIntervalHours: 6
    };
    await saveDriveAccount(savedAcc);

    return { user: gUser, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Google Drive Sign-in error:", error);
    let msg = error.message || "গুগল ড্রাইভ সাইন-ইন সম্পন্ন হয়নি";
    const currentHost = typeof window !== "undefined" ? window.location.hostname : "";

    if (error.code === "auth/unauthorized-domain") {
      msg = `ডোমেইন অনুমোদন প্রয়োজন: আপনার বর্তমান ওয়েবসাইট (${currentHost}) Firebase-এর অনুমোদিত ডোমেইন তালিকায় যুক্ত করা নেই। Firebase Console -> Authentication -> Settings -> Authorized Domains-এ '${currentHost}' যোগ করতে হবে।`;
    } else if (error.code === "auth/popup-blocked") {
      msg = "মোবাইল ব্রাউজার গুগল পপআপ ব্লক করেছে! ব্রাউজারের উপরে 'Pop-up blocked' নোটিফিকেশনে ট্যাপ করে Allow (অনুমতি) দিন।";
    } else if (error.code === "auth/popup-closed-by-user") {
      msg = "গুগল সাইন-ইন উইন্ডোটি সম্পন্ন করার আগেই বন্ধ করা হয়েছে।";
    } else if (error.code === "auth/cancelled-popup-request") {
      msg = "আগের সাইন-ইন রিকোয়েস্ট বাতিল করা হয়েছে। দয়া করে আবার বাটনে ট্যাপ করুন।";
    }
    throw new Error(msg);
  } finally {
    isSigningIn = false;
  }
};

export const getDriveAccessToken = (): string | null => {
  if (cachedAccessToken) return cachedAccessToken;
  const saved = getSavedDriveAccount();
  return saved?.accessToken || null;
};

export const getGoogleUser = (): { email: string; displayName?: string; photoURL?: string } | null => {
  if (currentGoogleUser) return currentGoogleUser;
  const saved = getSavedDriveAccount();
  if (saved && saved.email) {
    return {
      email: saved.email,
      displayName: saved.displayName,
      photoURL: saved.photoURL
    };
  }
  return null;
};

export const uploadFileToDrive = async (
  fileName: string,
  mimeType: string,
  content: Blob | string
): Promise<{ id: string; name: string }> => {
  const token = getDriveAccessToken();
  if (!token) {
    throw new Error("গুগল ড্রাইভ কানেক্ট করা নেই। অনুগ্রহ করে প্রথমে Google দিয়ে সাইন-ইন করুন।");
  }

  const contentBlob = typeof content === "string" ? new Blob([content], { type: mimeType }) : content;

  // Single-request Multipart Upload (Google Drive API v3)
  const boundary = "-------HishabPatiDrive" + Date.now();
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelim = "\r\n--" + boundary + "--";

  const metadata = {
    name: fileName,
    mimeType: mimeType,
    description: "HishabPati Smart ERP & POS Backup",
  };

  const multipartBody = new Blob(
    [
      delimiter,
      "Content-Type: application/json; charset=UTF-8\r\n\r\n",
      JSON.stringify(metadata),
      delimiter,
      `Content-Type: ${mimeType}\r\n\r\n`,
      contentBlob,
      closeDelim,
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );

  try {
    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      }
    );

    if (uploadRes.ok) {
      const data = await uploadRes.json();
      return { id: data.id, name: data.name || fileName };
    }

    const errData = await uploadRes.json().catch(() => ({}));
    console.warn("[Drive Multipart Warning]:", errData);
    
    // If unauthorized / token expired, notify
    if (uploadRes.status === 401) {
      throw new Error("গুগল ড্রাইভ টোকেনের মেয়াদ শেষ হয়েছে। অনুগ্রহ করে একবার 'পুনরায় কানেক্ট' বাটনে ট্যাপ করুন।");
    }
  } catch (mpErr: any) {
    if (mpErr.message?.includes("মেয়াদ শেষ")) throw mpErr;
    console.warn("[Drive Multipart Exception]:", mpErr);
  }

  // Fallback: 2-step Create + Media Patch
  const metaRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}));
    if (metaRes.status === 401) {
      throw new Error("গুগল ড্রাইভ টোকেনের মেয়াদ শেষ হয়েছে। অনুগ্রহ করে একবার 'পুনরায় কানেক্ট' বাটনে ট্যাপ করুন।");
    }
    throw new Error(err.error?.message || "Google Drive ফাইল তৈরিতে ব্যর্থ হয়েছে");
  }

  const metaData = await metaRes.json();
  const fileId = metaData.id;

  const patchRes = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": mimeType,
      },
      body: contentBlob,
    }
  );

  if (!patchRes.ok) {
    const err = await patchRes.json().catch(() => ({}));
    throw new Error(err.error?.message || "Google Drive ফাইল আপলোডে ব্যর্থ হয়েছে");
  }

  return { id: fileId, name: fileName };
};
