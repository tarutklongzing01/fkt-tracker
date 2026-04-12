import {
  ensureUserProfile,
  firebaseEnabled,
  loginWithGoogle,
  loginWithEmailPassword,
  subscribeAuth
} from "./firebase-service.js";
import {
  $,
  formatDurationThai,
  getRoleRedirect,
  setMessage,
  TRACKING_INTERVAL_MS,
  translateAuthError
} from "./app.js";

const form = $("#login-form");
const emailInput = $("#email");
const passwordInput = $("#password");
const loginButton = $("#login-button");
const googleLoginButton = $("#google-login-button");
const messageBox = $("#login-message");
const trackingIntervalLabel = $("#tracking-interval-label");

let hasRedirected = false;

if (trackingIntervalLabel) {
  trackingIntervalLabel.textContent = `สดทุก ${formatDurationThai(TRACKING_INTERVAL_MS)}`;
}

if (!firebaseEnabled) {
  loginButton.disabled = true;
  if (googleLoginButton) {
    googleLoginButton.disabled = true;
  }
  setMessage(
    messageBox,
    "ยังไม่ได้ตั้งค่า Firebase กรุณาแก้ไฟล์ firebase-config.js แล้ว deploy ใหม่",
    "error"
  );
}

function setAuthButtonsDisabled(disabled) {
  loginButton.disabled = disabled;

  if (googleLoginButton) {
    googleLoginButton.disabled = disabled;
  }
}

function buildMissingRoleMessage(user) {
  const emailText = user?.email ? ` (${user.email})` : "";
  return `ยังไม่พบ role ของผู้ใช้นี้ใน Realtime Database กรุณาตรวจสอบ node users/${user.uid}${emailText}`;
}

async function completeLogin(user, successMessage) {
  const profile = await ensureUserProfile(user);

  if (!profile?.role) {
    setMessage(messageBox, buildMissingRoleMessage(user), "error");
    return;
  }

  setMessage(messageBox, successMessage, "success");
  hasRedirected = true;
  window.location.replace(getRoleRedirect(profile.role));
}

subscribeAuth(async (user) => {
  if (!firebaseEnabled || !user || hasRedirected) {
    return;
  }

  try {
    const profile = await ensureUserProfile(user);

    if (!profile?.role) {
      setMessage(messageBox, `เข้าสู่ระบบสำเร็จ แต่ยังไม่พบข้อมูล role ที่ users/${user.uid}`, "error");
      return;
    }

    hasRedirected = true;
    window.location.replace(getRoleRedirect(profile.role));
  } catch (error) {
    setMessage(messageBox, error.message || "ไม่สามารถโหลดข้อมูลผู้ใช้ได้", "error");
  }
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!firebaseEnabled) {
    return;
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  setAuthButtonsDisabled(true);
  setMessage(messageBox, "กำลังเข้าสู่ระบบ...", "neutral");

  try {
    const credential = await loginWithEmailPassword(email, password);
    await completeLogin(credential.user, "เข้าสู่ระบบสำเร็จ กำลังพาไปยังหน้าที่เกี่ยวข้อง...");
  } catch (error) {
    setMessage(messageBox, translateAuthError(error), "error");
  } finally {
    setAuthButtonsDisabled(false);
  }
});

googleLoginButton?.addEventListener("click", async () => {
  if (!firebaseEnabled) {
    return;
  }

  setAuthButtonsDisabled(true);
  setMessage(messageBox, "กำลังเปิดหน้าต่าง Google Sign-In...", "neutral");

  try {
    const credential = await loginWithGoogle();
    await completeLogin(credential.user, "เข้าสู่ระบบด้วย Google สำเร็จ กำลังพาไปยังหน้าที่เกี่ยวข้อง...");
  } catch (error) {
    setMessage(messageBox, translateAuthError(error), "error");
  } finally {
    setAuthButtonsDisabled(false);
  }
});
