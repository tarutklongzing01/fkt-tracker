import {
  firebaseEnabled,
  getUserProfile,
  logout,
  saveRiderLocation,
  subscribeAuth,
  subscribeUserProfile,
  setRiderPresence
} from "./firebase-service.js";
import {
  $,
  formatAccuracy,
  formatCoordinates,
  formatDurationThai,
  formatThaiDateTime,
  getRiderMarkerIcon,
  getRoutePath,
  getRoleRedirect,
  setMessage,
  setStatusChip,
  TRACKING_INTERVAL_MS
} from "./app.js";

const riderName = $("#rider-name");
const riderCodeText = $("#rider-code-text");
const trackingStatus = $("#tracking-status");
const latestCoordinates = $("#latest-coordinates");
const latestUpdatedAt = $("#latest-updated-at");
const latestAccuracy = $("#latest-accuracy");
const riderMessage = $("#rider-message");
const selfStatus = $("#self-status");
const logoutButton = $("#logout-button");

let map;
let marker;
let accuracyCircle;
let trackingTimerId = null;
let currentUser = null;
let currentProfile = null;
let isSending = false;
let unsubscribeProfile = null;

function initializeMap() {
  map = L.map("rider-map", {
    zoomControl: true
  }).setView([13.7563, 100.5018], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
}

function updateMap(latitude, longitude, accuracy) {
  const latLng = [latitude, longitude];

  if (!marker) {
    marker = L.marker(latLng, {
      icon: getRiderMarkerIcon({
        online: true
      })
    }).addTo(map);
  } else {
    marker.setLatLng(latLng);
    marker.setIcon(
      getRiderMarkerIcon({
        online: true
      })
    );
  }

  if (!accuracyCircle) {
    accuracyCircle = L.circle(latLng, {
      radius: accuracy || 0,
      color: "#0f766e",
      fillColor: "#99f6e4",
      fillOpacity: 0.22,
      weight: 2
    }).addTo(map);
  } else {
    accuracyCircle.setLatLng(latLng);
    accuracyCircle.setRadius(accuracy || 0);
  }

  map.flyTo(latLng, 16, {
    duration: 0.7
  });
}

function buildPayload(position) {
  const { latitude, longitude, accuracy } = position.coords;

  return {
    uid: currentUser.uid,
    email: currentUser.email || "",
    name: currentProfile?.name || currentUser.email || "ไรเดอร์ไม่ระบุชื่อ",
    riderCode: currentProfile?.riderCode || "-",
    lat: Number(latitude.toFixed(6)),
    lng: Number(longitude.toFixed(6)),
    accuracy: Number.isFinite(accuracy) ? Math.round(accuracy) : null
  };
}

function updateTrackingUI(payload) {
  const timestamp = Date.now();

  trackingStatus.textContent = `กำลังส่งข้อมูลทุก ${formatDurationThai(TRACKING_INTERVAL_MS)}`;
  latestCoordinates.textContent = formatCoordinates(payload.lat, payload.lng);
  latestUpdatedAt.textContent = formatThaiDateTime(timestamp);
  latestAccuracy.textContent = formatAccuracy(payload.accuracy);
  setStatusChip(selfStatus, "online", "ส่งข้อมูลแล้ว");
  setMessage(riderMessage, "ระบบกำลังทำงาน..", "success");
}

async function syncPresence(online) {
  if (!currentUser || !currentProfile) {
    return;
  }

  await setRiderPresence(
    currentUser.uid,
    {
      uid: currentUser.uid,
      email: currentUser.email || "",
      name: currentProfile?.name || currentUser.email || "ไรเดอร์ไม่ระบุชื่อ",
      riderCode: currentProfile?.riderCode || "-"
    },
    online
  );
}

async function sendCurrentLocation() {
  if (!currentUser || !currentProfile || isSending) {
    return;
  }

  if (!navigator.geolocation) {
    setMessage(riderMessage, "อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง GPS", "error");
    setStatusChip(selfStatus, "offline", "ไม่รองรับ GPS");
    return;
  }

  isSending = true;
  trackingStatus.textContent = "กำลังอ่านตำแหน่ง GPS...";
  setStatusChip(selfStatus, "neutral", "กำลังอัปเดต");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const payload = buildPayload(position);
        await saveRiderLocation(currentUser.uid, payload);

        updateMap(payload.lat, payload.lng, payload.accuracy);
        updateTrackingUI(payload);
      } catch (error) {
        setMessage(riderMessage, error.message || "บันทึกตำแหน่งไม่สำเร็จ", "error");
        setStatusChip(selfStatus, "offline", "บันทึกไม่สำเร็จ");
      } finally {
        isSending = false;
      }
    },
    (error) => {
      const errorMessageMap = {
        1: "ผู้ใช้ปฏิเสธการเข้าถึงตำแหน่ง กรุณาอนุญาต GPS แล้วรีเฟรชหน้า",
        2: "ไม่สามารถระบุตำแหน่งปัจจุบันได้ กรุณาลองอีกครั้ง",
        3: "หมดเวลารอการอ่าน GPS กรุณาตรวจสอบสัญญาณและลองใหม่"
      };

      setMessage(riderMessage, errorMessageMap[error.code] || "ไม่สามารถอ่านตำแหน่งได้", "error");
      trackingStatus.textContent =
        error.code === 1 ? "ต้องอนุญาต GPS ก่อนเริ่มส่งข้อมูล" : "รออนุญาต GPS";
      setStatusChip(selfStatus, "offline", "อ่าน GPS ไม่สำเร็จ");

      if (error.code === 1 && trackingTimerId) {
        window.clearInterval(trackingTimerId);
        trackingTimerId = null;
      }

      isSending = false;
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}

function startTracking() {
  if (trackingTimerId) {
    return;
  }

  sendCurrentLocation();
  trackingTimerId = window.setInterval(sendCurrentLocation, TRACKING_INTERVAL_MS);
}

function updateProfileUI(profile, user) {
  currentProfile = profile;
  riderName.textContent = profile?.name || user?.email || "ไรเดอร์";
  riderCodeText.textContent = `รหัสไรเดอร์: ${profile?.riderCode || "-"}`;
}

function handleAuth() {
  if (!firebaseEnabled) {
    riderName.textContent = "ยังไม่ได้ตั้งค่า Firebase";
    trackingStatus.textContent = "ไม่สามารถเริ่มระบบได้";
    setMessage(riderMessage, "กรุณาแก้ไฟล์ firebase-config.js ก่อนใช้งานหน้านี้", "error");
    setStatusChip(selfStatus, "offline", "ยังไม่ได้ตั้งค่า");
    logoutButton.disabled = true;
    return;
  }

  subscribeAuth(async (user) => {
    if (!user) {
      window.location.replace(getRoutePath("login"));
      return;
    }

    try {
      const profile = await getUserProfile(user.uid);

      if (!profile?.role) {
        setMessage(riderMessage, "ไม่พบบทบาทของผู้ใช้นี้ใน Realtime Database", "error");
        return;
      }

      if (profile.role !== "rider") {
        window.location.replace(getRoleRedirect(profile.role));
        return;
      }

      currentUser = user;
      updateProfileUI(profile, user);
      await syncPresence(true);
      trackingStatus.textContent = "ออนไลน์อยู่ในระบบ";
      setStatusChip(selfStatus, "online", "ออนไลน์");

      if (!unsubscribeProfile) {
        unsubscribeProfile = subscribeUserProfile(user.uid, (liveProfile) => {
          if (!liveProfile?.role) {
            return;
          }

          if (liveProfile.role !== "rider") {
            window.location.replace(getRoleRedirect(liveProfile.role));
            return;
          }

          updateProfileUI(liveProfile, user);
        });
      }

      setMessage(
        riderMessage,
        "เข้าสู่ระบบสำเร็จ กรุณาอนุญาตการเข้าถึงตำแหน่งเพื่อเริ่มส่ง GPS",
        "success"
      );
      startTracking();
    } catch (error) {
      setMessage(riderMessage, error.message || "ไม่สามารถโหลดข้อมูลผู้ใช้ได้", "error");
    }
  });
}

logoutButton?.addEventListener("click", async () => {
  if (trackingTimerId) {
    window.clearInterval(trackingTimerId);
  }

  await syncPresence(false);
  await logout();
  window.location.replace(getRoutePath("login"));
});

initializeMap();
handleAuth();

window.addEventListener("beforeunload", () => {
  if (trackingTimerId) {
    window.clearInterval(trackingTimerId);
  }

  if (unsubscribeProfile) {
    unsubscribeProfile();
  }
});
