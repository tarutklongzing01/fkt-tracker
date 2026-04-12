import { firebaseRuntime } from "../firebase-config.js";

export const OFFLINE_THRESHOLD_MS = firebaseRuntime.offlineThresholdMs ?? 30000;
export const TRACKING_INTERVAL_MS = firebaseRuntime.riderPingIntervalMs ?? 5000;

const riderMarkerIconCache = new Map();

const relativeTimeFormatter = new Intl.RelativeTimeFormat("th-TH", {
  numeric: "auto"
});

export function $(selector) {
  return document.querySelector(selector);
}

export function setMessage(element, message, type = "neutral") {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.remove("is-error", "is-success");

  if (type === "error") {
    element.classList.add("is-error");
  }

  if (type === "success") {
    element.classList.add("is-success");
  }
}

export function formatThaiDateTime(value) {
  if (!value) {
    return "ยังไม่มีข้อมูล";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(new Date(Number(value)));
}

export function formatCoordinates(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "-";
  }

  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function formatAccuracy(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${Math.round(value)} เมตร`;
}

export function formatDurationThai(value) {
  const milliseconds = Number(value);

  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "-";
  }

  const totalSeconds = Math.round(milliseconds / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds} วินาที`;
  }

  const totalMinutes = Math.round(totalSeconds / 60);

  if (totalMinutes < 60) {
    return `${totalMinutes} นาที`;
  }

  const totalHours = Math.round(totalMinutes / 60);

  return `${totalHours} ชั่วโมง`;
}
export function isOnline(updatedAt, explicitOnline = null) {
  if (explicitOnline === true) {
    return true;
  }

  if (explicitOnline === false) {
    return false;
  }

  if (!updatedAt) {
    return false;
  }

  return Date.now() - Number(updatedAt) <= OFFLINE_THRESHOLD_MS;
}

export function getStatusLabel(updatedAt, explicitOnline = null) {
  return isOnline(updatedAt, explicitOnline) ? "ออนไลน์" : "ออฟไลน์";
}

export function setStatusChip(element, state, label) {
  if (!element) {
    return;
  }

  element.dataset.state = state;
  element.textContent = label;
}

export function formatRelativeUpdate(updatedAt) {
  if (!updatedAt) {
    return "ยังไม่เคยอัปเดต";
  }

  const elapsedSeconds = Math.round((Date.now() - Number(updatedAt)) / 1000);

  if (elapsedSeconds < 60) {
    return relativeTimeFormatter.format(-elapsedSeconds, "second");
  }

  if (elapsedSeconds < 3600) {
    return relativeTimeFormatter.format(-Math.round(elapsedSeconds / 60), "minute");
  }

  return relativeTimeFormatter.format(-Math.round(elapsedSeconds / 3600), "hour");
}

function shouldUseHtmlRoutes() {
  const { protocol, hostname } = window.location;

  return (
    protocol === "file:" ||
    hostname === "127.0.0.1" ||
    hostname === "localhost"
  );
}

export function getRoutePath(page) {
  if (shouldUseHtmlRoutes()) {
    return page === "login" ? "/index.html" : `/${page}.html`;
  }

  return page === "login" ? "/login" : `/${page}`;
}

export function getRoleRedirect(role) {
  return getRoutePath(role === "admin" ? "admin" : "rider");
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function translateAuthError(error) {
  const code = error?.code ?? "";

  if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
    return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  }

  if (code === "auth/user-disabled") {
    return "บัญชีนี้ถูกปิดใช้งาน";
  }

  if (code === "auth/user-not-found") {
    return "ไม่พบบัญชีผู้ใช้นี้";
  }

  if (code === "auth/too-many-requests") {
    return "มีการพยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่";
  }

  if (code === "auth/network-request-failed") {
    return "ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้ กรุณาลองใหม่";
  }

  if (code === "auth/popup-closed-by-user") {
    return "ปิดหน้าต่าง Google Sign-In ก่อนดำเนินการเสร็จ";
  }

  if (code === "auth/popup-blocked") {
    return "เบราว์เซอร์บล็อกหน้าต่างเข้าสู่ระบบ กรุณาอนุญาต pop-up แล้วลองใหม่";
  }

  if (code === "auth/cancelled-popup-request") {
    return "มีคำขอเข้าสู่ระบบด้วย Google ซ้อนกัน กรุณาลองใหม่อีกครั้ง";
  }

  return error?.message || "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
}

export function renderEmptyState(container, message) {
  if (!container) {
    return;
  }

  container.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function buildRiderMarkerSvg(dimmed = false) {
  const opacity = dimmed ? 0.84 : 1;
  const pinFill = dimmed ? "#e25a52" : "#d92d20";
  const pinRing = dimmed ? "#f27a72" : "#ff4d3d";
  const cabinFill = dimmed ? "#2f86d8" : "#1d6fd1";
  const boxFill = dimmed ? "#7f5f53" : "#6b4c40";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 88" fill="none">
      <defs>
        <filter id="marker-shadow" x="0" y="0" width="72" height="88" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feDropShadow dx="0" dy="4" stdDeviation="3.2" flood-color="#0f172a" flood-opacity="0.36" />
        </filter>
      </defs>
      <g filter="url(#marker-shadow)">
      <g opacity="${opacity}">
        <path
          d="M36 4C20.536 4 8 16.536 8 32c0 18.173 22.659 40.667 26.072 43.96a3 3 0 0 0 3.856 0C41.341 72.667 64 50.173 64 32C64 16.536 51.464 4 36 4Z"
          fill="${pinFill}"
          stroke="#111827"
          stroke-width="4.5"
          stroke-linejoin="round"
        />
        <circle cx="36" cy="31" r="24" fill="${pinRing}" />
        <circle cx="36" cy="31" r="19.5" fill="#FFFFFF" stroke="#111827" stroke-width="4" />
        <g transform="translate(20 18)">
          <rect x="8" y="15" width="18" height="13" rx="3" fill="${boxFill}" stroke="#111827" stroke-width="3.2" />
          <path
            d="M2 19.5V27a3 3 0 0 0 3 3h4v-9.5a3 3 0 0 1 3-3H18v-2.5a3 3 0 0 0-3-3H8.5a5 5 0 0 0-3.536 1.464L2 16.424V19.5Z"
            fill="#FFFFFF"
            stroke="#111827"
            stroke-width="3.2"
            stroke-linejoin="round"
          />
          <path d="M6.5 14.5h8l-1.5 6.5H4.5v-3.379l2-3.121Z" fill="${cabinFill}" stroke="#111827" stroke-width="3.2" stroke-linejoin="round" />
          <circle cx="10" cy="31" r="4.7" fill="#111827" />
          <circle cx="24" cy="31" r="4.7" fill="#111827" />
          <circle cx="10" cy="31" r="1.6" fill="#FFFFFF" />
          <circle cx="24" cy="31" r="1.6" fill="#FFFFFF" />
        </g>
      </g>
      </g>
    </svg>
  `.trim();
}

export function getRiderMarkerIcon({ online = true } = {}) {
  const key = online ? "online" : "offline";

  if (riderMarkerIconCache.has(key)) {
    return riderMarkerIconCache.get(key);
  }

  const icon = L.icon({
    iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
      buildRiderMarkerSvg(!online)
    )}`,
    iconSize: [60, 74],
    iconAnchor: [30, 69],
    popupAnchor: [0, -60],
    className: "rider-map-marker"
  });

  riderMarkerIconCache.set(key, icon);
  return icon;
}
