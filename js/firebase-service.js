import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  get,
  getDatabase,
  onValue,
  remove,
  ref,
  set,
  serverTimestamp,
  update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  firebaseConfig,
  firebaseRuntime,
  isFirebaseConfigReady
} from "../firebase-config.js";

export const firebaseEnabled = isFirebaseConfigReady();
export const app = firebaseEnabled ? initializeApp(firebaseConfig) : null;
export const auth = firebaseEnabled ? getAuth(app) : null;
export const db = firebaseEnabled ? getDatabase(app) : null;
export const runtimeConfig = firebaseRuntime;
const googleProvider = firebaseEnabled ? new GoogleAuthProvider() : null;

if (googleProvider) {
  googleProvider.setCustomParameters({
    prompt: "select_account"
  });
}

export function subscribeAuth(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, callback);
}

export async function loginWithEmailPassword(email, password) {
  if (!auth) {
    throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  }

  return signInWithEmailAndPassword(auth, email, password);
}

export async function loginWithGoogle() {
  if (!auth || !googleProvider) {
    throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  }

  return signInWithPopup(auth, googleProvider);
}

export async function logout() {
  if (!auth) {
    return;
  }

  await signOut(auth);
}

export async function getUserProfile(uid) {
  if (!db) {
    throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  }

  const snapshot = await get(ref(db, `users/${uid}`));
  return snapshot.exists() ? snapshot.val() : null;
}

export function subscribeUserProfile(uid, callback) {
  if (!db || !uid) {
    callback(null);
    return () => {};
  }

  return onValue(ref(db, `users/${uid}`), (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function getAdminEmailSetting() {
  if (!db) {
    return "";
  }

  const snapshot = await get(ref(db, "settings/adminEmail"));
  return snapshot.exists() ? normalizeEmail(snapshot.val()) : "";
}

function buildDefaultUserProfile(user, adminEmail) {
  const fallbackName =
    user?.displayName ||
    (user?.email ? user.email.split("@")[0] : "") ||
    "ไรเดอร์ใหม่";

  if (normalizeEmail(user?.email) && normalizeEmail(user?.email) === adminEmail) {
    return {
      name: fallbackName,
      role: "admin"
    };
  }

  return {
    name: fallbackName,
    role: "rider",
    riderCode: `RD${String(user?.uid || "")
      .slice(0, 6)
      .toUpperCase()}`
  };
}

export async function ensureUserProfile(user) {
  if (!db) {
    throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  }

  if (!user?.uid) {
    throw new Error("ไม่พบข้อมูลผู้ใช้");
  }

  const existingProfile = await getUserProfile(user.uid);

  if (existingProfile?.role) {
    return existingProfile;
  }

  if (existingProfile) {
    return existingProfile;
  }

  const adminEmail = await getAdminEmailSetting();
  const defaultProfile = buildDefaultUserProfile(user, adminEmail);
  await set(ref(db, `users/${user.uid}`), defaultProfile);
  return defaultProfile;
}

export function subscribeUserProfiles(callback) {
  if (!db) {
    callback({});
    return () => {};
  }

  return onValue(ref(db, "users"), (snapshot) => {
    callback(snapshot.val() ?? {});
  });
}

export async function updateUserProfile(uid, payload) {
  if (!db) {
    throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  }

  await update(ref(db, `users/${uid}`), payload);
}

export async function deleteRider(uid) {
  if (!db) {
    throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  }

  if (!uid) {
    throw new Error("ไม่พบข้อมูลไรเดอร์ที่ต้องการลบ");
  }

  await remove(ref(db, `riders/${uid}`));
  await remove(ref(db, `users/${uid}`));
}

export async function setRiderPresence(uid, payload, online) {
  if (!db) {
    throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  }

  await update(ref(db, `riders/${uid}`), {
    ...payload,
    online,
    lastStatusChangedAt: Date.now()
  });
}

export function subscribeRiders(callback) {
  if (!db) {
    callback({});
    return () => {};
  }

  return onValue(ref(db, "riders"), (snapshot) => {
    callback(snapshot.val() ?? {});
  });
}

export async function saveRiderLocation(uid, payload) {
  if (!db) {
    throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  }

  const riderRef = ref(db, `riders/${uid}`);

  await update(riderRef, {
    ...payload,
    online: true,
    updatedAt: serverTimestamp(),
    clientUpdatedAt: Date.now()
  });
}
