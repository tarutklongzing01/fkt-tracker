import {
  deleteRider as deleteRiderData,
  firebaseEnabled,
  getUserProfile,
  logout,
  subscribeAuth,
  subscribeRiders,
  subscribeUserProfiles,
  updateUserProfile
} from "./firebase-service.js";
import {
  $,
  escapeHtml,
  formatCoordinates,
  formatRelativeUpdate,
  formatThaiDateTime,
  getRiderMarkerIcon,
  getRoutePath,
  getRoleRedirect,
  getStatusLabel,
  isOnline,
  renderEmptyState,
  setMessage,
  setStatusChip
} from "./app.js";

const HUB_J = {
  name: "Hub J",
  lat: 12.931992,
  lng: 100.902712,
  radiusMeters: 50,
  alertMessage: "กรุณาเปิดไม้กั้น"
};

const HUB_J_ALERT_AUDIO_SRC = "/assets/mee-rot-ma.mp3";
const HUB_J_AUDIO_STORAGE_KEY = "hub-j-alert-sound-enabled";

const adminWelcome = $("#admin-welcome");
const adminStatus = $("#admin-status");
const hubJAlert = $("#hub-j-alert");
const hubJAudioToggle = $("#hub-j-audio-toggle");
const logoutButton = $("#logout-button");
const riderList = $("#rider-list");
const totalCount = $("#total-count");
const onlineCount = $("#online-count");
const offlineCount = $("#offline-count");
const mapUpdatedChip = $("#map-updated");
const riderEditForm = $("#rider-edit-form");
const editRiderName = $("#edit-rider-name");
const editRiderCode = $("#edit-rider-code");
const saveRiderButton = $("#save-rider-button");
const resetRiderButton = $("#reset-rider-button");
const editRiderMessage = $("#edit-rider-message");
const editRiderHint = $("#edit-rider-hint");
const riderEditorModal = $("#rider-editor-modal");
const riderEditorBackdrop = $("#rider-editor-backdrop");
const closeRiderEditorButton = $("#close-rider-editor");

const riderLocationState = new Map();
const riderProfileState = new Map();
const markerState = new Map();
const riderHubZoneState = new Map();
const hubJAlertAudio = new Audio(HUB_J_ALERT_AUDIO_SRC);
hubJAlertAudio.preload = "auto";

let map;
let hubJMarker;
let hubJRadiusCircle;
let hasFittedBounds = false;
let activeRiderId = null;
let refreshTimerId = null;
let unsubscribeRiders = null;
let unsubscribeProfiles = null;
let isSavingRider = false;
let isDeletingRider = false;
let suppressEditorAutoOpen = false;
let hasHubJAudioWarning = false;
let isHubJAlertSoundEnabled = true;

function initializeMap() {
  map = L.map("admin-map", {
    zoomControl: true
  }).setView([13.7563, 100.5018], 11);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  hubJRadiusCircle = L.circle([HUB_J.lat, HUB_J.lng], {
    radius: HUB_J.radiusMeters,
    color: "#f59e0b",
    fillColor: "#fde68a",
    fillOpacity: 0.16,
    weight: 2
  })
    .addTo(map)
    .bindPopup(`${HUB_J.name} (${HUB_J.radiusMeters} เมตร)`);

  hubJMarker = L.circleMarker([HUB_J.lat, HUB_J.lng], {
    radius: 8,
    color: "#ffffff",
    weight: 3,
    fillColor: "#f59e0b",
    fillOpacity: 1
  })
    .addTo(map)
    .bindPopup(`${HUB_J.name}: ${HUB_J.alertMessage}`);
}

function unlockHubJAlertAudio() {
  hubJAlertAudio.muted = true;

  const playAttempt = hubJAlertAudio.play();
  if (playAttempt?.catch) {
    playAttempt.catch(() => {}).finally(() => {
      hubJAlertAudio.pause();
      hubJAlertAudio.currentTime = 0;
      hubJAlertAudio.muted = false;
    });
    return;
  }

  hubJAlertAudio.pause();
  hubJAlertAudio.currentTime = 0;
  hubJAlertAudio.muted = false;
}

function playHubJAlertSound() {
  if (!isHubJAlertSoundEnabled) {
    return;
  }

  hubJAlertAudio.pause();
  hubJAlertAudio.currentTime = 0;

  const playAttempt = hubJAlertAudio.play();
  if (playAttempt?.catch) {
    playAttempt
      .then(() => {
        hasHubJAudioWarning = false;
      })
      .catch(() => {
        if (hasHubJAudioWarning) {
          return;
        }

        hasHubJAudioWarning = true;
        setMessage(adminStatus, "เบราว์เซอร์บล็อกเสียงแจ้งเตือน กรุณาคลิกหน้าแอดมินหนึ่งครั้งเพื่อเปิดเสียง", "error");
      });
  }
}

function readHubJAlertSoundPreference() {
  try {
    return window.localStorage.getItem(HUB_J_AUDIO_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function speakerIconMarkup(enabled) {
  if (enabled) {
    return `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14.25 5.25L9.75 9H6a2.25 2.25 0 0 0-2.25 2.25v1.5A2.25 2.25 0 0 0 6 15h3.75l4.5 3.75V5.25Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M17.25 9.75a3 3 0 0 1 0 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M19.5 7.5a6 6 0 0 1 0 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14.25 5.25L9.75 9H6a2.25 2.25 0 0 0-2.25 2.25v1.5A2.25 2.25 0 0 0 6 15h3.75l4.5 3.75V5.25Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M16.5 9.75l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M21 9.75l-4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  `;
}

function updateHubJAudioToggle() {
  if (!hubJAudioToggle) {
    return;
  }

  hubJAudioToggle.dataset.state = isHubJAlertSoundEnabled ? "on" : "off";
  hubJAudioToggle.setAttribute("aria-pressed", String(isHubJAlertSoundEnabled));
  hubJAudioToggle.setAttribute(
    "aria-label",
    isHubJAlertSoundEnabled ? "ปิดเสียงแจ้งเตือน Hub J" : "เปิดเสียงแจ้งเตือน Hub J"
  );
  hubJAudioToggle.title = isHubJAlertSoundEnabled ? "ปิดเสียงแจ้งเตือน Hub J" : "เปิดเสียงแจ้งเตือน Hub J";
  hubJAudioToggle.innerHTML = speakerIconMarkup(isHubJAlertSoundEnabled);
}

function setHubJAlertSoundEnabled(enabled) {
  isHubJAlertSoundEnabled = enabled;

  try {
    window.localStorage.setItem(HUB_J_AUDIO_STORAGE_KEY, enabled ? "on" : "off");
  } catch {}

  updateHubJAudioToggle();

  if (enabled) {
    unlockHubJAlertAudio();
    setMessage(adminStatus, "เปิดเสียงแจ้งเตือน Hub J แล้ว", "success");
    return;
  }

  hubJAlertAudio.pause();
  hubJAlertAudio.currentTime = 0;
  setMessage(adminStatus, "ปิดเสียงแจ้งเตือน Hub J แล้ว", "neutral");
}

function getRidersForDisplay() {
  return Array.from(riderLocationState.entries()).map(([uid, rider]) => {
    const profile = riderProfileState.get(uid) || {};

    return {
      uid,
      role: profile.role || "rider",
      name: profile.name || rider?.name || "ไรเดอร์ไม่ระบุชื่อ",
      riderCode: profile.riderCode || rider?.riderCode || "-",
      online: typeof rider?.online === "boolean" ? rider.online : null,
      lat: Number(rider?.lat),
      lng: Number(rider?.lng),
      updatedAt: Number(rider?.updatedAt || rider?.clientUpdatedAt || 0)
    };
  });
}

function getActiveRider() {
  return getRidersForDisplay().find((rider) => rider.uid === activeRiderId) || null;
}

function setEditorEnabled(enabled) {
  const isBusy = isSavingRider || isDeletingRider;

  editRiderName.disabled = !enabled || isBusy;
  editRiderCode.disabled = !enabled || isBusy;
  saveRiderButton.disabled = !enabled || isBusy;
  resetRiderButton.disabled = !enabled || isBusy;
}

function openEditorModal() {
  if (riderEditorModal) {
    riderEditorModal.hidden = false;
  }
}

function closeEditorModal(manual = false) {
  if (riderEditorModal) {
    riderEditorModal.hidden = true;
  }

  if (manual) {
    suppressEditorAutoOpen = true;
  }
}

function fillEditorForm(rider) {
  if (!rider) {
    suppressEditorAutoOpen = false;
    editRiderName.value = "";
    editRiderCode.value = "";
    editRiderHint.textContent = "เลือกไรเดอร์จากรายการก่อน";
    setEditorEnabled(false);
    setMessage(editRiderMessage, "เลือกไรเดอร์เพื่อแก้ไขชื่อหรือรหัสประจำตัว", "neutral");
    closeEditorModal();
    return;
  }

  editRiderName.value = rider.name || "";
  editRiderCode.value = rider.riderCode === "-" ? "" : rider.riderCode || "";
  editRiderHint.textContent = `กำลังแก้ไข ${rider.name || "ไรเดอร์"}`;
  setEditorEnabled(true);

  if (!suppressEditorAutoOpen) {
    openEditorModal();
  }
}

function hasUnsavedEditorChanges(rider = getActiveRider()) {
  if (!rider) {
    return false;
  }

  const currentName = editRiderName.value;
  const currentCode = editRiderCode.value.trim().toUpperCase();
  const riderName = rider.name || "";
  const riderCode = rider.riderCode === "-" ? "" : rider.riderCode || "";

  return currentName !== riderName || currentCode !== riderCode;
}

function buildRichPopupContent(rider) {
  const online = isOnline(rider.updatedAt, rider.online);

  return `
    <div class="map-popup-card">
      <div class="map-popup-card__top">
        <div>
          <p class="popup-title">${escapeHtml(rider.name)}</p>
          <p class="map-popup-card__code">${escapeHtml(rider.riderCode)}</p>
        </div>
        <span class="map-popup-card__status map-popup-card__status--${online ? "online" : "offline"}">
          ${escapeHtml(getStatusLabel(rider.updatedAt, rider.online))}
        </span>
      </div>
      <div class="map-popup-card__body">
        <p class="popup-row"><span>พิกัด</span> ${escapeHtml(formatCoordinates(rider.lat, rider.lng))}</p>
        <p class="popup-row"><span>อัปเดตล่าสุด</span> ${escapeHtml(formatThaiDateTime(rider.updatedAt))}</p>
      </div>
    </div>
  `;
}

function upsertMarker(rider) {
  if (!Number.isFinite(rider.lat) || !Number.isFinite(rider.lng)) {
    return;
  }

  const online = isOnline(rider.updatedAt, rider.online);
  let marker = markerState.get(rider.uid);

  if (!marker) {
    marker = L.marker([rider.lat, rider.lng], {
      icon: getRiderMarkerIcon({
        online
      }),
      opacity: online ? 1 : 0.7
    })
      .addTo(map)
      .bindPopup(buildRichPopupContent(rider));

    marker.on("click", () => {
      activeRiderId = rider.uid;
      suppressEditorAutoOpen = true;
      fillEditorForm(getActiveRider() || rider);
      renderSidebar();
    });

    markerState.set(rider.uid, marker);
    return;
  }

  marker.setLatLng([rider.lat, rider.lng]);
  marker.setIcon(
    getRiderMarkerIcon({
      online
    })
  );
  marker.setOpacity(online ? 1 : 0.7);
  marker.setPopupContent(buildRichPopupContent(rider));
}

function removeMissingMarkers() {
  for (const [uid, marker] of markerState.entries()) {
    if (!riderLocationState.has(uid)) {
      map.removeLayer(marker);
      markerState.delete(uid);
    }
  }
}

function fitMapToMarkers() {
  const positions = getRidersForDisplay()
    .filter((rider) => Number.isFinite(rider.lat) && Number.isFinite(rider.lng))
    .map((rider) => [rider.lat, rider.lng]);

  if (!positions.length || hasFittedBounds) {
    return;
  }

  map.fitBounds(positions, {
    padding: [36, 36]
  });
  hasFittedBounds = true;
}

function calculateDistanceMeters(fromLat, fromLng, toLat, toLng) {
  const earthRadius = 6371000;
  const toRadians = (value) => (value * Math.PI) / 180;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistanceMeters(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) {
    return "-";
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} เมตร`;
  }

  return `${(distanceMeters / 1000).toFixed(2)} กม.`;
}

function announceHubJAlert(riders) {
  playHubJAlertSound();
}

function updateHubJAlert(riders = getRidersForDisplay()) {
  const nearbyRiders = [];
  const newlyEnteredRiders = [];
  const nextState = new Map();

  for (const rider of riders) {
    if (!Number.isFinite(rider.lat) || !Number.isFinite(rider.lng)) {
      nextState.set(rider.uid, false);
      continue;
    }

    const distanceMeters = calculateDistanceMeters(rider.lat, rider.lng, HUB_J.lat, HUB_J.lng);
    const isInsideZone = distanceMeters <= HUB_J.radiusMeters;

    nextState.set(rider.uid, isInsideZone);

    if (isInsideZone) {
      nearbyRiders.push({
        ...rider,
        distanceMeters
      });
    }

    if (isInsideZone && !riderHubZoneState.get(rider.uid)) {
      newlyEnteredRiders.push({
        ...rider,
        distanceMeters
      });
    }
  }

  riderHubZoneState.clear();
  nextState.forEach((value, uid) => {
    riderHubZoneState.set(uid, value);
  });

  if (newlyEnteredRiders.length) {
    announceHubJAlert(newlyEnteredRiders);
  }

  if (!hubJAlert) {
    return;
  }

  if (!nearbyRiders.length) {
    hubJAlert.textContent = `ยังไม่มีไรเดอร์เข้าใกล้ ${HUB_J.name}`;
    hubJAlert.classList.remove("is-active");
    return;
  }

  nearbyRiders.sort((left, right) => left.distanceMeters - right.distanceMeters);

  if (nearbyRiders.length === 1) {
    const [rider] = nearbyRiders;
    hubJAlert.textContent = `${rider.name} อยู่ในระยะ ${formatDistanceMeters(
      rider.distanceMeters
    )} จาก ${HUB_J.name} ${HUB_J.alertMessage}`;
    hubJAlert.classList.add("is-active");
    return;
  }

  hubJAlert.textContent = `${nearbyRiders.length} ไรเดอร์อยู่ใกล้ ${HUB_J.name} กรุณาเปิดไม้กั้น`;
  hubJAlert.classList.add("is-active");
}

function createRiderCard(rider) {
  const online = isOnline(rider.updatedAt, rider.online);
  const actionDisabled = isSavingRider || isDeletingRider;

  return `
    <article
      class="rider-item ${activeRiderId === rider.uid ? "is-active" : ""}"
      data-rider-id="${escapeHtml(rider.uid)}"
      tabindex="0"
      role="button"
      aria-label="โฟกัสไรเดอร์ ${escapeHtml(rider.name)} บนแผนที่"
    >
      <div class="rider-item__top">
        <div>
          <div class="rider-item__name">${escapeHtml(rider.name)}</div>
          <div class="rider-item__code">รหัส ${escapeHtml(rider.riderCode)}</div>
        </div>
        <div class="rider-item__actions">
          <span class="status-chip" data-state="${online ? "online" : "offline"}">
            ${online ? "ออนไลน์" : "ออฟไลน์"}
          </span>
          <button
            class="button rider-item__edit"
            type="button"
            data-edit-rider-id="${escapeHtml(rider.uid)}"
            aria-label="แก้ไขข้อมูล ${escapeHtml(rider.name)}"
            ${actionDisabled ? "disabled" : ""}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3.75a2.25 2.25 0 0 1 2.12 1.5l.18.53a1 1 0 0 0 .95.68h.56a2.25 2.25 0 0 1 1.95 1.13l.28.48a1 1 0 0 0 1.16.45l.55-.14a2.25 2.25 0 0 1 2.56 1.11a2.25 2.25 0 0 1-.32 2.77l-.4.4a1 1 0 0 0-.24 1.02l.15.55a2.25 2.25 0 0 1-1.12 2.56l-.48.28a1 1 0 0 0-.5.88v.56a2.25 2.25 0 0 1-1.5 2.12l-.53.18a1 1 0 0 0-.68.95v.56a2.25 2.25 0 0 1-2.25 2.25a2.25 2.25 0 0 1-2.12-1.5l-.18-.53a1 1 0 0 0-.95-.68h-.56a2.25 2.25 0 0 1-1.95-1.13l-.28-.48a1 1 0 0 0-1.16-.45l-.55.14a2.25 2.25 0 0 1-2.56-1.11a2.25 2.25 0 0 1 .32-2.77l.4-.4a1 1 0 0 0 .24-1.02l-.15-.55a2.25 2.25 0 0 1 1.12-2.56l.48-.28a1 1 0 0 0 .5-.88v-.56a2.25 2.25 0 0 1 1.5-2.12l.53-.18a1 1 0 0 0 .68-.95v-.56A2.25 2.25 0 0 1 12 3.75Z" stroke="currentColor" stroke-width="1.5"/>
              <path d="M9.75 12a2.25 2.25 0 1 0 4.5 0a2.25 2.25 0 0 0-4.5 0Z" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
          <button
            class="button rider-item__delete"
            type="button"
            data-delete-rider-id="${escapeHtml(rider.uid)}"
            aria-label="ลบข้อมูล ${escapeHtml(rider.name)}"
            ${actionDisabled ? "disabled" : ""}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4.5 7.5h15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M9.75 3.75h4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M7.5 7.5v9.75A2.25 2.25 0 0 0 9.75 19.5h4.5a2.25 2.25 0 0 0 2.25-2.25V7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M10.5 10.5v5.25M13.5 10.5v5.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="rider-item__bottom">
        <span>${escapeHtml(formatRelativeUpdate(rider.updatedAt))}</span>
        <span>${escapeHtml(formatCoordinates(rider.lat, rider.lng))}</span>
      </div>
    </article>
  `;
}

function renderSidebar() {
  const riders = getRidersForDisplay().sort((left, right) => {
    const onlineDiff =
      Number(isOnline(right.updatedAt, right.online)) - Number(isOnline(left.updatedAt, left.online));
    if (onlineDiff !== 0) {
      return onlineDiff;
    }

    return String(left.name).localeCompare(String(right.name), "th");
  });

  totalCount.textContent = String(riders.length);
  onlineCount.textContent = String(riders.filter((rider) => isOnline(rider.updatedAt, rider.online)).length);
  offlineCount.textContent = String(riders.filter((rider) => !isOnline(rider.updatedAt, rider.online)).length);

  if (!riders.length) {
    renderEmptyState(riderList, "ยังไม่มีไรเดอร์ส่งข้อมูลเข้ามา");
    setStatusChip(mapUpdatedChip, "neutral", "ยังไม่มีข้อมูล");
    activeRiderId = null;
    fillEditorForm(null);
    return;
  }

  riderList.innerHTML = riders.map((rider) => createRiderCard(rider)).join("");

  riderList.querySelectorAll("[data-rider-id]").forEach((card) => {
    const focusRider = () => {
      const rider = riders.find((item) => item.uid === card.dataset.riderId);
      if (!rider || !Number.isFinite(rider.lat) || !Number.isFinite(rider.lng)) {
        return;
      }

      suppressEditorAutoOpen = true;
      activeRiderId = rider.uid;
      fillEditorForm(rider);
      map.flyTo([rider.lat, rider.lng], 16, {
        duration: 0.7
      });
      markerState.get(rider.uid)?.openPopup();
      renderSidebar();
    };

    card.addEventListener("click", focusRider);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        focusRider();
      }
    });
  });

  riderList.querySelectorAll("[data-edit-rider-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();

      const rider = riders.find((item) => item.uid === button.dataset.editRiderId);
      if (!rider) {
        return;
      }

      activeRiderId = rider.uid;
      suppressEditorAutoOpen = false;
      fillEditorForm(rider);
      openEditorModal();
      renderSidebar();
    });
  });

  riderList.querySelectorAll("[data-delete-rider-id]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();

      const rider = riders.find((item) => item.uid === button.dataset.deleteRiderId);
      if (!rider) {
        return;
      }

      await handleRiderDelete(rider);
    });
  });

  const onlineRiderCount = riders.filter((rider) => isOnline(rider.updatedAt, rider.online)).length;
  setStatusChip(
    mapUpdatedChip,
    onlineRiderCount > 0 ? "online" : "offline",
    onlineRiderCount > 0 ? `ออนไลน์ ${onlineRiderCount} คน` : "ไม่มีไรเดอร์ออนไลน์"
  );
}

function refreshView() {
  const riders = getRidersForDisplay();

  for (const rider of riders) {
    upsertMarker(rider);
  }

  removeMissingMarkers();
  fitMapToMarkers();
  renderSidebar();
  updateHubJAlert(riders);

  if (activeRiderId && !getActiveRider()) {
    activeRiderId = null;
    fillEditorForm(null);
    return;
  }

  if (activeRiderId && !isSavingRider && !isDeletingRider && !hasUnsavedEditorChanges()) {
    fillEditorForm(getActiveRider());
  }
}

function startRiderSubscription() {
  unsubscribeRiders = subscribeRiders((payload) => {
    riderLocationState.clear();

    Object.entries(payload).forEach(([uid, rider]) => {
      riderLocationState.set(uid, rider ?? {});
    });

    refreshView();
  });
}

function startUserProfileSubscription() {
  unsubscribeProfiles = subscribeUserProfiles((payload) => {
    riderProfileState.clear();

    Object.entries(payload).forEach(([uid, profile]) => {
      riderProfileState.set(uid, profile ?? {});
    });

    refreshView();
  });
}

function validateRiderEditForm() {
  const name = editRiderName.value.trim();
  const riderCode = editRiderCode.value.trim().toUpperCase();

  if (!name) {
    return {
      error: "กรุณากรอกชื่อไรเดอร์"
    };
  }

  if (!/^RD[A-Z0-9]{1,12}$/.test(riderCode)) {
    return {
      error: "รหัสไรเดอร์ต้องขึ้นต้นด้วย RD และตามด้วยตัวอักษรหรือตัวเลข"
    };
  }

  return {
    name,
    riderCode
  };
}

function getDeleteRiderErrorMessage(error) {
  const rawMessage = String(error?.message || "").trim();

  if (rawMessage.includes("PERMISSION_DENIED")) {
    return "ลบไม่สำเร็จเพราะ Firebase Rules ยังไม่อนุญาตให้แอดมินลบไรเดอร์ กรุณาอัปเดต Rules ล่าสุดก่อน";
  }

  return rawMessage || "ไม่สามารถลบข้อมูลไรเดอร์ได้";
}

async function handleRiderDelete(rider) {
  if (!rider || isDeletingRider) {
    return;
  }

  const riderName = rider.name || "ไรเดอร์";
  const riderCode = rider.riderCode || "-";
  const confirmed = window.confirm(
    `ยืนยันการลบ ${riderName} (${riderCode})?\nข้อมูลโปรไฟล์และตำแหน่งล่าสุดจะถูกลบออกจากระบบ`
  );

  if (!confirmed) {
    return;
  }

  isDeletingRider = true;
  setEditorEnabled(Boolean(getActiveRider()));
  setMessage(adminStatus, `กำลังลบ ${riderName} ออกจากระบบ...`, "neutral");

  if (activeRiderId === rider.uid) {
    setMessage(editRiderMessage, "กำลังลบข้อมูลไรเดอร์...", "neutral");
  }

  try {
    await deleteRiderData(rider.uid);

    riderProfileState.delete(rider.uid);
    riderLocationState.delete(rider.uid);

    const marker = markerState.get(rider.uid);
    if (marker) {
      map.removeLayer(marker);
      markerState.delete(rider.uid);
    }

    if (activeRiderId === rider.uid) {
      activeRiderId = null;
      fillEditorForm(null);
    }

    suppressEditorAutoOpen = false;
    setMessage(adminStatus, `ลบ ${riderName} เรียบร้อยแล้ว`, "success");
    refreshView();
  } catch (error) {
    const message = getDeleteRiderErrorMessage(error);

    setMessage(adminStatus, message, "error");

    if (activeRiderId === rider.uid) {
      setMessage(editRiderMessage, message, "error");
    }
  } finally {
    isDeletingRider = false;
    setEditorEnabled(Boolean(getActiveRider()));
  }
}

function ensureAdminAccess() {
  if (!firebaseEnabled) {
    adminWelcome.textContent = "ยังไม่ได้ตั้งค่า Firebase";
    setMessage(adminStatus, "กรุณาแก้ไฟล์ firebase-config.js ก่อนใช้งานหน้านี้", "error");
    setStatusChip(mapUpdatedChip, "offline", "ยังไม่ได้ตั้งค่า");
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
        setMessage(adminStatus, "ไม่พบบทบาทการใช้งานของผู้ใช้นี้", "error");
        return;
      }

      if (profile.role !== "admin") {
        window.location.replace(getRoleRedirect(profile.role));
        return;
      }

      adminWelcome.textContent = `สวัสดี ${profile.name || "แอดมิน"}`;
      setMessage(
        adminStatus,
        "กำลังฟังข้อมูลไรเดอร์สดจาก Firebase Realtime Database",
        "success"
      );

      if (!unsubscribeRiders) {
        startRiderSubscription();
      }

      if (!unsubscribeProfiles) {
        startUserProfileSubscription();
      }
    } catch (error) {
      setMessage(adminStatus, error.message || "ไม่สามารถโหลดข้อมูลผู้ใช้ได้", "error");
    }
  });
}

riderEditForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const rider = getActiveRider();
  if (!rider) {
    setMessage(editRiderMessage, "กรุณาเลือกไรเดอร์ก่อนบันทึกข้อมูล", "error");
    return;
  }

  const result = validateRiderEditForm();
  if (result.error) {
    setMessage(editRiderMessage, result.error, "error");
    return;
  }

  isSavingRider = true;
  setEditorEnabled(true);
  setMessage(editRiderMessage, "กำลังบันทึกข้อมูลไรเดอร์...", "neutral");

  try {
    await updateUserProfile(rider.uid, {
      name: result.name,
      riderCode: result.riderCode
    });

    riderProfileState.set(rider.uid, {
      ...(riderProfileState.get(rider.uid) || {}),
      name: result.name,
      riderCode: result.riderCode
    });

    fillEditorForm({
      ...rider,
      name: result.name,
      riderCode: result.riderCode
    });
    suppressEditorAutoOpen = false;
    openEditorModal();
    setMessage(editRiderMessage, "บันทึกชื่อและรหัสไรเดอร์เรียบร้อยแล้ว", "success");
    refreshView();
  } catch (error) {
    setMessage(editRiderMessage, error.message || "ไม่สามารถบันทึกข้อมูลไรเดอร์ได้", "error");
  } finally {
    isSavingRider = false;
    setEditorEnabled(Boolean(getActiveRider()));
  }
});

resetRiderButton?.addEventListener("click", () => {
  fillEditorForm(getActiveRider());
});

riderEditorBackdrop?.addEventListener("click", () => {
  closeEditorModal(true);
});

closeRiderEditorButton?.addEventListener("click", () => {
  closeEditorModal(true);
});

hubJAudioToggle?.addEventListener("click", () => {
  setHubJAlertSoundEnabled(!isHubJAlertSoundEnabled);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && riderEditorModal && !riderEditorModal.hidden) {
    closeEditorModal(true);
  }
});

logoutButton?.addEventListener("click", async () => {
  await logout();
  window.location.replace(getRoutePath("login"));
});

isHubJAlertSoundEnabled = readHubJAlertSoundPreference();
updateHubJAudioToggle();
initializeMap();
window.addEventListener("pointerdown", unlockHubJAlertAudio, { once: true });
window.addEventListener("keydown", unlockHubJAlertAudio, { once: true });
ensureAdminAccess();
refreshTimerId = window.setInterval(refreshView, 5000);

window.addEventListener("beforeunload", () => {
  if (unsubscribeRiders) {
    unsubscribeRiders();
  }

  if (unsubscribeProfiles) {
    unsubscribeProfiles();
  }

  if (refreshTimerId) {
    window.clearInterval(refreshTimerId);
  }
});
