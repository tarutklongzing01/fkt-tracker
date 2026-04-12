export const firebaseConfig = {
  apiKey: "AIzaSyB67yOBQGJnR77pDtvuqMF2eGYz1-gy3nA",
  authDomain: "ridercheck-f6802.firebaseapp.com",
  databaseURL: "https://ridercheck-f6802-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "ridercheck-f6802",
  storageBucket: "ridercheck-f6802.firebasestorage.app",
  messagingSenderId: "745728705311",
  appId: "1:745728705311:web:85249ab21ae95bcb77e62a",
  measurementId: "G-PEHGNYSCMW"
};

export const firebaseRuntime = {
  riderPingIntervalMs: 5000,
  offlineThresholdMs: 30000
};

export function isFirebaseConfigReady() {
  const requiredKeys = [
    "apiKey",
    "authDomain",
    "databaseURL",
    "projectId",
    "storageBucket",
    "messagingSenderId",
    "appId"
  ];

  return requiredKeys.every((key) => {
    const value = firebaseConfig[key];
    return typeof value === "string" && value.length > 0 && !value.startsWith("YOUR_");
  });
}
