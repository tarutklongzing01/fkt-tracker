import {
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
  formatDurationThai,
  formatRelativeUpdate,
  formatThaiDateTime,
  getRiderMarkerIcon,
  getRoutePath,
  getRoleRedirect,
  getStatusLabel,
  isOnline,
  OFFLINE_THRESHOLD_MS,
  renderEmptyState,
  setMessage,
  setStatusChip
} from "./app.js";

const adminWelcome = $("#admin-welcome");
const adminStatus = $("#admin-status");
const logoutButton = $("#logout-button");
const riderList = $("#rider-list");
const totalCount = $("#total-count");
const onlineCount = $("#online-count");
const offlineCount = $("#offline-count");
const mapUpdatedChip = $("#map-updated");
const offlineThresholdText = $("#offline-threshold-text");
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

let map;
let hasFittedBounds = false;
let activeRiderId = null;
let refreshTimerId = null;
let unsubscribeRiders = null;
let unsubscribeProfiles = null;
let isSavingRider = false;
let lastSelectedRiderId = null;
let suppressEditorAutoOpen = false;

if (offlineThresholdText) {
  offlineThresholdText.textContent = `สถานะออนไลน์อ้างอิงการ login/logout ของไรเดอร์ และจะใช้เวลาอัปเดตล่าสุดเป็นตัวช่วยสำรองเมื่อยังไม่มีสถานะ explicit`;
}

function initializeMap() {
  map = L.map("admin-map", {
    zoomControl: true
  }).setView([13.7563, 100.5018], 11);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
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
  editRiderName.disabled = !enabled || isSavingRider;
  editRiderCode.disabled = !enabled || isSavingRider;
  saveRiderButton.disabled = !enabled || isSavingRider;
  resetRiderButton.disabled = !enabled || isSavingRider;
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
    lastSelectedRiderId = null;
    suppressEditorAutoOpen = false;
    editRiderName.value = "";
    editRiderCode.value = "";
    editRiderHint.textContent = "เลือกไรเดอร์จากรายการก่อน";
    setEditorEnabled(false);
    setMessage(editRiderMessage, "เลือกไรเดอร์เพื่อแก้ไขชื่อหรือรหัสประจำตัว", "neutral");
    closeEditorModal();
    return;
  }

  lastSelectedRiderId = rider.uid;
  editRiderName.value = rider.name || "";
  editRiderCode.value = rider.riderCode === "-" ? "" : rider.riderCode || "";
  editRiderHint.textContent = `กำลังแก้ไข ${rider.name || "ไรเดอร์"}`;
  setEditorEnabled(true);

  if (!suppressEditorAutoOpen) {
    openEditorModal();
  }
}

function buildPopupContent(rider) {
  return `
    <div>
      <p class="popup-title">${escapeHtml(rider.name)}</p>
      <p class="popup-row"><span>รหัส:</span> ${escapeHtml(rider.riderCode)}</p>
      <p class="popup-row"><span>พิกัด:</span> ${escapeHtml(
        formatCoordinates(rider.lat, rider.lng)
      )}</p>
      <p class="popup-row"><span>เวลาอัปเดต:</span> ${escapeHtml(
        formatThaiDateTime(rider.updatedAt)
      )}</p>
      <p class="popup-row"><span>สถานะ:</span> ${escapeHtml(getStatusLabel(rider.updatedAt, rider.online))}</p>
    </div>
  `;
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
  } else {
    marker.setLatLng([rider.lat, rider.lng]);
    marker.setIcon(
      getRiderMarkerIcon({
        online
      })
    );
    marker.setOpacity(online ? 1 : 0.7);
    marker.setPopupContent(buildRichPopupContent(rider));
  }
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

  riderList.innerHTML = riders
    .map((rider) => {
      const online = isOnline(rider.updatedAt, rider.online);
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
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 3.75a2.25 2.25 0 0 1 2.12 1.5l.18.53a1 1 0 0 0 .95.68h.56a2.25 2.25 0 0 1 1.95 1.13l.28.48a1 1 0 0 0 1.16.45l.55-.14a2.25 2.25 0 0 1 2.56 1.11a2.25 2.25 0 0 1-.32 2.77l-.4.4a1 1 0 0 0-.24 1.02l.15.55a2.25 2.25 0 0 1-1.12 2.56l-.48.28a1 1 0 0 0-.5.88v.56a2.25 2.25 0 0 1-1.5 2.12l-.53.18a1 1 0 0 0-.68.95v.56a2.25 2.25 0 0 1-2.25 2.25a2.25 2.25 0 0 1-2.12-1.5l-.18-.53a1 1 0 0 0-.95-.68h-.56a2.25 2.25 0 0 1-1.95-1.13l-.28-.48a1 1 0 0 0-1.16-.45l-.55.14a2.25 2.25 0 0 1-2.56-1.11a2.25 2.25 0 0 1 .32-2.77l.4-.4a1 1 0 0 0 .24-1.02l-.15-.55a2.25 2.25 0 0 1 1.12-2.56l.48-.28a1 1 0 0 0 .5-.88v-.56a2.25 2.25 0 0 1 1.5-2.12l.53-.18a1 1 0 0 0 .68-.95v-.56A2.25 2.25 0 0 1 12 3.75Z" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M9.75 12a2.25 2.25 0 1 0 4.5 0a2.25 2.25 0 0 0-4.5 0Z" stroke="currentColor" stroke-width="1.5"/>
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
    })
    .join("");

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

  const onlineRiderCount = riders.filter((rider) => isOnline(rider.updatedAt, rider.online)).length;
  setStatusChip(
    mapUpdatedChip,
    onlineRiderCount > 0 ? "online" : "offline",
    onlineRiderCount > 0 ? `ออนไลน์ ${onlineRiderCount} คน` : "ไม่มีไรเดอร์ออนไลน์"
  );
}

function refreshView() {
  for (const rider of getRidersForDisplay()) {
    upsertMarker(rider);
  }

  removeMissingMarkers();
  fitMapToMarkers();
  renderSidebar();

  if (activeRiderId && !getActiveRider()) {
    activeRiderId = null;
    fillEditorForm(null);
    return;
  }

  if (activeRiderId && !isSavingRider) {
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

function ensureAdminAccess() {
  if (!firebaseEnabled) {
    adminWelcome.textContent = "ยังไม่ได้ตั้งค่า Firebase";
    setMessage(
      adminStatus,
      "กรุณาแก้ไฟล์ firebase-config.js ก่อนใช้งานหน้านี้",
      "error"
    );
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
        setMessage(adminStatus, "ไม่พบสิทธิ์การใช้งานของผู้ใช้รายนี้", "error");
        return;
      }

      if (profile.role !== "admin") {
        window.location.replace(getRoleRedirect(profile.role));
        return;
      }

      adminWelcome.textContent = `สวัสดี ${profile.name || "แอดมินรุต"}`;
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

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && riderEditorModal && !riderEditorModal.hidden) {
    closeEditorModal(true);
  }
});

logoutButton?.addEventListener("click", async () => {
  await logout();
  window.location.replace(getRoutePath("login"));
});

initializeMap();
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
