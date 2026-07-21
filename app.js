// State Variables
let places = [];
let settings = {
    user1: "パートナー1",
    user2: "パートナー2",
    title: "ふたりの行きたい場所マップ"
};
let currentUser = "user1"; // "user1" or "user2"
let map = null;
let markers = {};
let selectedPlaceId = null;

// Filters State
let currentCategoryFilter = "all";
let currentTypeFilter = "all";
let currentStatusFilter = "all";

// Roulette Filters State (independent from the sidebar list filters above)
let rouletteCategoryFilter = "all";
let rouletteTypeFilter = "all";

// DOM Elements
const appTitleDisplay = document.getElementById("app-title-display");
const user1Label = document.getElementById("user1-label");
const user2Label = document.getElementById("user2-label");
const userToggle = document.getElementById("user-toggle");
const placesList = document.getElementById("places-list");
const placesCount = document.getElementById("places-count");

// Modals
const placeModal = document.getElementById("place-modal");
const detailModal = document.getElementById("detail-modal");
const settingsModal = document.getElementById("settings-modal");
const rouletteModal = document.getElementById("roulette-modal");

// Forms
const placeForm = document.getElementById("place-form");
const settingsForm = document.getElementById("settings-form");
const commentForm = document.getElementById("comment-form");

// Hybrid Storage Configuration (Google Apps Script Backend)
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
let GAS_URL = "https://script.google.com/macros/s/AKfycbzT16zPcMljjlXR4mbjzecyPpxRbAmvCV3VODr90V64aDRhhlhwFAcXH1O9HAtIumUS/exec";

// URLパラメータから ?gas=... または ?gas_url=... を取得して自動保存・同期する
const urlParams = new URLSearchParams(window.location.search);
const gasFromUrl = urlParams.get("gas") || urlParams.get("gas_url");
if (gasFromUrl) {
    const cleanGasUrl = decodeURIComponent(gasFromUrl).trim();
    if (cleanGasUrl.startsWith("https://script.google.com/")) {
        localStorage.setItem("pairmap_gas_url", cleanGasUrl);
        GAS_URL = cleanGasUrl;
        
        // アドレスバーからURLパラメータを綺麗に消去（リロード時に再読み込みさせないため）
        try {
            const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
            window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
        } catch (e) {
            console.error("Failed to clean address bar URL", e);
        }
    }
} else {
    // URLに指定がない場合は、これまで通りlocalStorageに保存されているURLを読み込む
    const savedGasUrl = localStorage.getItem("pairmap_gas_url");
    if (savedGasUrl) {
        GAS_URL = savedGasUrl;
    }
}

// Color Theme Palettes (multiple color variations for the accent/category palette)
const THEME_PALETTES = {
    sunset: {
        colors: {
            "--color-orange-red": "#FF420E",
            "--color-coral": "#F98866",
            "--color-sage": "#80BD9E",
            "--color-lime": "#89DA59"
        }
    },
    ocean: {
        colors: {
            "--color-orange-red": "#0077B6",
            "--color-coral": "#00B4D8",
            "--color-sage": "#2A9D8F",
            "--color-lime": "#52D8C4"
        }
    },
    berry: {
        colors: {
            "--color-orange-red": "#C9184A",
            "--color-coral": "#FF6F91",
            "--color-sage": "#9D4EDD",
            "--color-lime": "#F15BB5"
        }
    },
    forest: {
        colors: {
            "--color-orange-red": "#2D6A4F",
            "--color-coral": "#74C69D",
            "--color-sage": "#588157",
            "--color-lime": "#A7C957"
        }
    }
};

function applyThemePalette(themeId) {
    const palette = THEME_PALETTES[themeId] || THEME_PALETTES.sunset;
    for (const [prop, val] of Object.entries(palette.colors)) {
        document.documentElement.style.setProperty(prop, val);
    }
    document.querySelectorAll(".theme-select-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.themeId === themeId);
    });
}

function setThemePalette(themeId) {
    localStorage.setItem("pairmap_theme_id", themeId);
    applyThemePalette(themeId);
}

function initTheme() {
    const savedThemeId = localStorage.getItem("pairmap_theme_id") || "sunset";
    applyThemePalette(savedThemeId);
}

// --- Fluid Motion Utilities -------------------------------------------------
// Small dependency-free helpers for gesture-driven animation (mobile bottom
// sheet drag): a damped spring driven by damping-ratio + response (seconds)
// instead of raw stiffness/damping, momentum projection so a flick lands
// where it's headed rather than at the release point, and rubber-banding so
// dragging past a hard edge resists instead of stopping dead.

function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Animates `from` -> `to`, handing off `velocity` (px/s) so a released
// gesture continues without a visible seam between finger and animation.
// damping 1.0 settles with no overshoot; lower values overshoot and bounce,
// which should only be used after a gesture that actually carried momentum.
function animateSpring({ from, to, velocity = 0, damping = 1, response = 0.35, onUpdate, onComplete }) {
    if (prefersReducedMotion()) {
        onUpdate(to);
        if (onComplete) onComplete();
        return { cancel() {} };
    }

    const stiffness = Math.pow((2 * Math.PI) / response, 2);
    const dampingCoefficient = (4 * Math.PI * damping) / response;

    let position = from;
    let currentVelocity = velocity;
    let lastTime = null;
    let rafId = null;
    let cancelled = false;

    function frame(now) {
        if (cancelled) return;
        if (lastTime === null) lastTime = now;
        // Clamp dt so a throttled/backgrounded tab doesn't launch the sheet
        // across the screen in one jump when the tab regains focus.
        const dt = Math.min((now - lastTime) / 1000, 1 / 30);
        lastTime = now;

        const displacement = position - to;
        const acceleration = -stiffness * displacement - dampingCoefficient * currentVelocity;
        currentVelocity += acceleration * dt;
        position += currentVelocity * dt;

        const settled = Math.abs(position - to) < 0.5 && Math.abs(currentVelocity) < 20;
        if (settled) {
            onUpdate(to);
            if (onComplete) onComplete();
            return;
        }
        onUpdate(position);
        rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);
    return { cancel: () => { cancelled = true; cancelAnimationFrame(rafId); } };
}

// Projects where a flick "wants to land" from its release velocity, using
// the same exponential-decay curve iOS uses for scroll deceleration (this is
// NOT the v²/2a textbook formula).
function projectMomentum(velocityPxPerSec, decelerationRate = 0.998) {
    return ((velocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate);
}

// Progressive resistance past a hard boundary: dragging past the end of the
// sheet slows down instead of hitting a wall, then springs back on release.
function rubberband(overshoot, dimension, constant = 0.55) {
    return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

// Initialize App
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initMap();
    setupEventListeners();
    fetchData();

    // Auto polling every 10 seconds to keep data in sync
    setInterval(fetchData, 10000);
});

// Initialize Leaflet Map
function initMap() {
    map = L.map("map", {
        doubleClickZoom: false
    }).setView([35.6895, 139.6917], 11);

    // Premium CartoDB Voyager tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    map.on("dblclick", (e) => {
        openAddPlaceModal(e.latlng.lat, e.latlng.lng);
    });
}

// Event Listeners Setup
function setupEventListeners() {
    userToggle.addEventListener("click", () => {
        if (currentUser === "user1") {
            currentUser = "user2";
            userToggle.classList.add("user2-active");
            user1Label.classList.remove("active");
            user2Label.classList.add("active");
        } else {
            currentUser = "user1";
            userToggle.classList.remove("user2-active");
            user1Label.classList.add("active");
            user2Label.classList.remove("active");
        }
        renderPlacesList();
    });

    document.querySelectorAll(".theme-select-btn").forEach(btn => {
        btn.addEventListener("click", () => setThemePalette(btn.dataset.themeId));
    });

    document.getElementById("add-place-btn").addEventListener("click", () => openAddPlaceModal());
    document.getElementById("roulette-btn").addEventListener("click", openRouletteModal);
    document.getElementById("settings-btn").addEventListener("click", openSettingsModal);

    document.getElementById("close-place-modal").addEventListener("click", () => closeModal(placeModal));
    document.getElementById("cancel-place-form").addEventListener("click", () => closeModal(placeModal));
    
    document.getElementById("close-detail-modal").addEventListener("click", () => {
        closeModal(detailModal);
        selectedPlaceId = null;
        renderPlacesList();
    });
    
    document.getElementById("close-settings-modal").addEventListener("click", () => closeModal(settingsModal));
    document.getElementById("cancel-settings-form").addEventListener("click", () => closeModal(settingsModal));
    document.getElementById("close-roulette-modal").addEventListener("click", () => closeModal(rouletteModal));

    placeForm.addEventListener("submit", handlePlaceFormSubmit);
    settingsForm.addEventListener("submit", handleSettingsFormSubmit);
    commentForm.addEventListener("submit", handleCommentSubmit);

    document.getElementById("get-center-coord").addEventListener("click", () => {
        const center = map.getCenter();
        document.getElementById("place-lat").value = center.lat.toFixed(6);
        document.getElementById("place-lng").value = center.lng.toFixed(6);
    });

    // Location Search in Modal (Real-time Autocomplete Suggest)
    const searchBtn = document.getElementById("location-search-btn");
    const searchInput = document.getElementById("location-search-input");
    const searchResultsList = document.getElementById("search-results-list");
    let searchTimeout = null;
    if (searchBtn && searchInput) {
        searchBtn.addEventListener("click", () => {
            clearTimeout(searchTimeout);
            handleLocationSearch();
        });
        searchInput.addEventListener("input", () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(handleLocationSearch, 300);
        });
        searchInput.addEventListener("keydown", (e) => {
            const items = searchResultsList ? Array.from(searchResultsList.children).filter(el => el.classList.contains("search-result-item")) : [];

            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                if (items.length === 0) return;
                e.preventDefault();
                let index = items.findIndex(el => el.classList.contains("active"));
                items.forEach(el => el.classList.remove("active"));
                index = e.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
                items[index].classList.add("active");
                items[index].scrollIntoView({ block: "nearest" });
                return;
            }

            if (e.key === "Enter") {
                e.preventDefault();
                const activeItem = items.find(el => el.classList.contains("active"));
                if (activeItem) {
                    activeItem.click();
                } else {
                    clearTimeout(searchTimeout);
                    handleLocationSearch();
                }
                return;
            }

            if (e.key === "Escape") {
                if (searchResultsList) {
                    searchResultsList.innerHTML = "";
                    searchResultsList.style.display = "none";
                }
            }
        });

        // 候補リスト・検索欄・検索ボタン以外をクリックしたら閉じる
        document.addEventListener("click", (e) => {
            if (!searchResultsList) return;
            const wrapper = searchInput.closest(".search-input-wrapper");
            if ((wrapper && wrapper.contains(e.target)) || searchResultsList.contains(e.target)) return;
            searchResultsList.innerHTML = "";
            searchResultsList.style.display = "none";
        });
    }

    // Modal Type Selector Tabs
    const modalTypeTabs = document.querySelectorAll("#modal-type-tabs .status-tab");
    const placeTypeInput = document.getElementById("place-type");
    modalTypeTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            modalTypeTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            const typeVal = tab.getAttribute("data-type-val");
            if (placeTypeInput) {
                placeTypeInput.value = typeVal;
            }
            toggleModalLocationFields(typeVal);
        });
    });

    // Modal Status Selector Tabs
    const modalStatusTabs = document.querySelectorAll("#modal-status-tabs .status-tab");
    const placeStatusInput = document.getElementById("place-status");
    modalStatusTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            modalStatusTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            if (placeStatusInput) {
                placeStatusInput.value = tab.getAttribute("data-status-val");
            }
        });
    });

    // Scoped to .filters-container so these don't also match same-class tabs used
    // elsewhere (e.g. the place modal's type/status tabs, or the roulette's own filters).
    const categoryChips = document.querySelectorAll(".filters-container .filter-chip");
    categoryChips.forEach(chip => {
        chip.addEventListener("click", () => {
            categoryChips.forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            currentCategoryFilter = chip.getAttribute("data-filter-category");
            renderUI();
        });
    });

    const typeTabs = document.querySelectorAll(".filters-container .type-tab");
    typeTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            typeTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            currentTypeFilter = tab.getAttribute("data-filter-type");
            renderUI();
        });
    });

    const statusTabs = document.querySelectorAll(".filters-container .status-tab");
    statusTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            statusTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            currentStatusFilter = tab.getAttribute("data-filter-status");
            renderUI();
        });
    });

    // Roulette's own category/type filters, independent of the sidebar list filters.
    const rouletteCategoryChips = document.querySelectorAll("#roulette-category-filters .filter-chip");
    rouletteCategoryChips.forEach(chip => {
        chip.addEventListener("click", () => {
            rouletteCategoryChips.forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            rouletteCategoryFilter = chip.getAttribute("data-roulette-category");
            updateRouletteAvailability();
        });
    });

    const rouletteTypeTabs = document.querySelectorAll("#roulette-type-filters .type-tab");
    rouletteTypeTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            rouletteTypeTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            rouletteTypeFilter = tab.getAttribute("data-roulette-type");
            updateRouletteAvailability();
        });
    });

    window.addEventListener("click", (e) => {
        if (e.target.classList.contains("modal-overlay")) {
            closeModal(e.target);
            if (e.target === detailModal) {
                selectedPlaceId = null;
                renderPlacesList();
            }
        }
    });

    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            const activeModal = document.querySelector(".modal-overlay.active");
            if (activeModal) {
                closeModal(activeModal);
                if (activeModal === detailModal) {
                    selectedPlaceId = null;
                    renderPlacesList();
                }
            }
        }
    });

    // Mobile Bottom Sheet Toggle & Drag Gesture
    const sheetToggle = document.getElementById("sheet-toggle");
    const sidebarSection = document.querySelector(".sidebar-section");
    const handleArrow = document.getElementById("handle-arrow");

    if (sheetToggle && sidebarSection) {
        const sheetHeight = window.innerHeight * 0.7; // matches the 70% height set in CSS
        const OPEN_Y = 0;
        const COLLAPSED_Y = sheetHeight - 60; // 60px is the handle bar height

        // The sheet's live on-screen position. Drag, click-toggle and the
        // release spring all read/write this so every animation starts from
        // where the sheet actually is, never from a stale logical state.
        let currentY = window.innerWidth <= 900 ? COLLAPSED_Y : OPEN_Y;
        let activeSpring = null;
        let isDragging = false;
        let wasDragging = false;
        let startY = 0;
        let startTranslateY = 0;
        let velocityHistory = []; // recent {t, y} samples, used to compute release velocity

        function setSheetY(y) {
            currentY = y;
            sidebarSection.style.transform = `translateY(${y}px)`;
        }

        function setHandleIcon(isCollapsed) {
            if (!handleArrow) return;
            handleArrow.setAttribute("data-lucide", isCollapsed ? "chevron-up" : "chevron-down");
            lucide.createIcons();
        }

        // Default to collapsed state on mobile screen sizes on load
        if (window.innerWidth <= 900) {
            sidebarSection.classList.add("collapsed");
        }
        setHandleIcon(window.innerWidth <= 900);

        // Springs to a resting position (open or collapsed) and hands off the
        // given release velocity so there's no seam between the finger and
        // the animation. damping 0.8 / response 0.3 is Apple's own drawer/
        // sheet spec — the slight overshoot is only appropriate here because
        // this always plays after a momentum-carrying release (or a tap,
        // treated as a zero-velocity flick).
        function springToTarget(targetY, { velocity = 0, damping = 0.8, response = 0.3 } = {}) {
            if (activeSpring) activeSpring.cancel();
            const isCollapsed = targetY === COLLAPSED_Y;
            setHandleIcon(isCollapsed);
            sidebarSection.style.transition = "none"; // the JS spring owns the transform now

            activeSpring = animateSpring({
                from: currentY,
                to: targetY,
                velocity,
                damping,
                response,
                onUpdate: setSheetY,
                onComplete: () => {
                    activeSpring = null;
                    sidebarSection.classList.toggle("collapsed", isCollapsed);
                    sidebarSection.style.transition = "";
                    sidebarSection.style.transform = ""; // let the CSS class rule take over at rest
                }
            });
        }

        function toggleBottomSheet(forceState = null) {
            const isCollapsed = forceState !== null ? forceState : !sidebarSection.classList.contains("collapsed");
            // A tap carries no momentum, so it settles with no overshoot.
            springToTarget(isCollapsed ? COLLAPSED_Y : OPEN_Y, { damping: 1 });
        }

        // Click to toggle
        sheetToggle.addEventListener("click", (e) => {
            if (wasDragging) return;
            toggleBottomSheet();
        });

        // Drag: 1:1 tracking with rubber-banding past the bounds, and a
        // short position/time history so release velocity can be computed.
        sheetToggle.addEventListener("pointerdown", (e) => {
            if (window.innerWidth > 900) return;
            if (activeSpring) activeSpring.cancel();
            sheetToggle.setPointerCapture(e.pointerId);

            startY = e.clientY;
            startTranslateY = currentY;
            isDragging = true;
            wasDragging = false;
            velocityHistory = [{ t: performance.now(), y: e.clientY }];
            sidebarSection.style.transition = "none";
        });

        sheetToggle.addEventListener("pointermove", (e) => {
            if (!isDragging) return;
            const deltaY = e.clientY - startY;
            if (Math.abs(deltaY) > 5) wasDragging = true;

            velocityHistory.push({ t: performance.now(), y: e.clientY });
            if (velocityHistory.length > 5) velocityHistory.shift();

            let targetY = startTranslateY + deltaY;
            if (targetY < OPEN_Y) {
                targetY = OPEN_Y - rubberband(OPEN_Y - targetY, sheetHeight);
            } else if (targetY > COLLAPSED_Y) {
                targetY = COLLAPSED_Y + rubberband(targetY - COLLAPSED_Y, sheetHeight);
            }
            setSheetY(targetY);

            // Stop Leaflet from treating this as a map pan/zoom gesture.
            e.stopPropagation();
        });

        function endDrag(e) {
            if (!isDragging) return;
            isDragging = false;
            sidebarSection.style.transition = "";

            if (!wasDragging) return; // a plain tap; the click handler owns this case

            const first = velocityHistory[0];
            const last = velocityHistory[velocityHistory.length - 1];
            const dt = (last.t - first.t) / 1000;
            const releaseVelocity = dt > 0 ? (last.y - first.y) / dt : 0; // px/s

            // Land on whichever resting position the flick is actually
            // headed toward, not just the nearer one from the release point.
            const projectedY = currentY + projectMomentum(releaseVelocity);
            const targetY = Math.abs(projectedY - OPEN_Y) < Math.abs(projectedY - COLLAPSED_Y) ? OPEN_Y : COLLAPSED_Y;

            springToTarget(targetY, { velocity: releaseVelocity });
            e.stopPropagation();
        }

        sheetToggle.addEventListener("pointerup", endDrag);
        sheetToggle.addEventListener("pointercancel", endDrag);
    }
}

// Save data helper for Cloud Sync Mode (Google Apps Script)
// Throws on any failure so callers don't proceed (e.g. closing a modal) as if the save succeeded.
async function saveCloudData(data) {
    if (!GAS_URL || GAS_URL === "YOUR_GAS_WEB_APP_URL_HERE") {
        throw new Error("Google Apps Script WebアプリのURLが設定されていません。右上の設定（歯車）から設定してください。");
    }
    const response = await fetch(GAS_URL, {
        method: "POST",
        // We omit Content-Type: application/json to prevent browser sending OPTIONS preflight request,
        // since GAS Web Apps do not handle preflight CORS requests properly.
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error("クラウドへの保存に失敗しました (HTTP " + response.status + ")");

    // GAS returns HTTP 200 with { success: false, error } even when doPost fails internally
    // (e.g. a spreadsheet write error), so the success field must be checked explicitly.
    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || "クラウドへの保存にサーバー側で失敗しました。相手には反映されていません。");
    }
    return result;
}

// Fetch Data from Server or GAS Cloud
async function fetchData() {
    try {
        let data;
        if (isLocal) {
            const response = await fetch(`/api/data`);
            if (!response.ok) throw new Error("データの取得に失敗しました");
            data = await response.json();
        } else {
            // Cloud storage mode (Google Apps Script)
            if (!GAS_URL || GAS_URL === "YOUR_GAS_WEB_APP_URL_HERE") {
                placesList.innerHTML = `
                    <div class="list-placeholder">
                        <i data-lucide="alert-triangle"></i>
                        <p style="font-weight: 500; color: var(--warning);">Google Apps ScriptのURLが未設定です。</p>
                        <p style="font-size: 0.75rem; color: var(--text-secondary);">右上の歯車アイコンをクリックし、GASのウェブアプリURLを入力・保存してください。</p>
                    </div>
                `;
                lucide.createIcons();
                return;
            }
            const response = await fetch(GAS_URL);
            if (!response.ok) throw new Error("クラウドデータの取得に失敗しました");
            data = await response.json();
        }
        
        places = data.places || [];
        settings = data.settings || settings;
        
        renderUI();
    } catch (error) {
        console.error("Fetch Data Error:", error);
    }
}

// Render UI Elements
function renderUI() {
    appTitleDisplay.textContent = settings.title || "ふたりの行きたい場所マップ";
    user1Label.textContent = settings.user1 || "パートナー1";
    user2Label.textContent = settings.user2 || "パートナー2";
    
    if (currentUser === "user1") {
        user1Label.classList.add("active");
    } else {
        user2Label.classList.add("active");
    }

    renderPlacesList();
    updateMapMarkers();
}

// Filter Places based on current selection
function getFilteredPlaces() {
    return places.filter(place => {
        const catMatch = currentCategoryFilter === "all" || place.category === currentCategoryFilter;
        const typeMatch = currentTypeFilter === "all" || (place.type || "place") === currentTypeFilter;
        const statusMatch = currentStatusFilter === "all" || place.status === currentStatusFilter;
        return catMatch && typeMatch && statusMatch;
    });
}

// Render Place List Sidebar
function renderPlacesList(filtered = getFilteredPlaces()) {
    const listContainer = placesList;
    if (!listContainer) return;

    listContainer.innerHTML = "";
    placesCount.textContent = filtered.length;

    const sheetCountVal = document.getElementById("sheet-count-val");
    if (sheetCountVal) {
        sheetCountVal.textContent = filtered.length;
    }

    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="list-placeholder">
                <i data-lucide="map-pin"></i>
                <p>該当するスポットがありません。</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    placesList.innerHTML = "";
    filtered.forEach(place => {
        const card = document.createElement("div");
        card.className = `place-card ${selectedPlaceId === place.id ? "selected" : ""}`;
        card.setAttribute("data-id", place.id);
        
        const catMap = {
            food: { label: "グルメ", class: "food" },
            scenic: { label: "絶景・観光", class: "scenic" },
            activity: { label: "遊ぶ・体験", class: "activity" },
            shopping: { label: "お買い物", class: "shopping" },
            lodging: { label: "宿泊", class: "lodging" },
            other: { label: "その他", class: "other" }
        };
        const catInfo = catMap[place.category] || catMap.other;
        const statusLabel = place.status === "want_to_go" ? "行きたい" : "行った！";
        const statusClass = place.status;
        const typeLabel = place.type === "todo" ? "やりたいこと" : "行きたい場所";
        const typeClass = place.type === "todo" ? "todo" : "place";

        const imageHTML = place.imageUrl ? `<div class="card-image" style="background-image: url('${place.imageUrl}')"></div>` : '';

        const commentCount = (place.comments || []).length;
        const commentBadgeHTML = commentCount > 0
            ? `<div class="card-comment-badge"><i data-lucide="message-circle"></i><span>コメント${commentCount}件</span></div>`
            : '';

        card.innerHTML = `
            ${imageHTML}
            <div class="card-info">
                <div class="card-category-bar">
                    <div>
                        <span class="type-tag-inline ${typeClass}">${typeLabel}</span>
                        <span class="cat-tag ${catInfo.class}">${catInfo.label}</span>
                    </div>
                    <span class="card-badge ${statusClass}">${statusLabel}</span>
                </div>
                <div class="card-main-text">
                    <h3 class="card-title">${place.title}</h3>
                    <p class="card-desc">${place.description || "メモはありません。"}</p>
                    ${commentBadgeHTML}
                </div>
            </div>
        `;

        card.addEventListener("click", () => selectPlace(place.id, false));
        placesList.appendChild(card);
    });

    lucide.createIcons();
}

// Update Map Markers
function updateMapMarkers() {
    const filtered = getFilteredPlaces();
    const mapPlaces = filtered.filter(p => p.type !== "todo");
    const filteredIds = new Set(mapPlaces.map(p => p.id));

    // Clear deleted/filtered markers
    Object.keys(markers).forEach(id => {
        if (!filteredIds.has(id)) {
            map.removeLayer(markers[id]);
            delete markers[id];
        }
    });

    // Add or update markers
    mapPlaces.forEach(place => {
        const isSelected = selectedPlaceId === place.id;
        const markerClass = `marker-pin ${place.category} ${place.status} ${isSelected ? "selected" : ""}`;
        
        const iconMap = {
            food: "utensils",
            scenic: "camera",
            activity: "compass",
            shopping: "shopping-bag",
            lodging: "bed",
            other: "map-pin"
        };
        const iconName = iconMap[place.category] || "map-pin";

        const customIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="${markerClass}"></div><div class="marker-icon"><i data-lucide="${iconName}" style="width: 14px; height: 14px;"></i></div>`,
            iconSize: [30, 42],
            iconAnchor: [15, 42],
            popupAnchor: [0, -40]
        });

        if (markers[place.id]) {
            markers[place.id].setLatLng([place.latitude, place.longitude]);
            markers[place.id].setIcon(customIcon);
        } else {
            const marker = L.marker([place.latitude, place.longitude], { icon: customIcon }).addTo(map);
            
            marker.on("click", () => {
                selectPlace(place.id, false);
                openDetailModal(place.id);
            });

            const popupContent = document.createElement("div");
            popupContent.className = "popup-container";
            popupContent.innerHTML = `
                <div class="popup-title">${place.title}</div>
                <div class="popup-desc">${place.description ? place.description.substring(0, 40) + '...' : ''}</div>
                <button class="popup-btn">詳細・相談を開く</button>
            `;
            
            popupContent.querySelector(".popup-btn").addEventListener("click", () => {
                openDetailModal(place.id);
            });

            marker.bindPopup(popupContent);
            markers[place.id] = marker;
        }
    });

    lucide.createIcons();

    // 自動フィット（fitBounds）はユーザーの意図しないズームを引き起こすため無効化
    // if (filtered.length > 0 && Object.keys(markers).length === filtered.length && !selectedPlaceId) {
    //     const group = new L.featureGroup(Object.values(markers));
    //     map.fitBounds(group.getBounds().pad(0.15));
    // }
}

// Select place in list and map
function selectPlace(placeId, zoom = true) {
    selectedPlaceId = placeId;
    renderPlacesList();
    updateMapMarkers();

    const place = places.find(p => p.id === placeId);
    if (place) {
        // todoタイプの場合は地図ピンがないのでズームをスキップ
        if (place.type !== "todo" && markers[placeId]) {
            if (zoom) {
                map.setView([place.latitude, place.longitude], 15);
            }
        }
        openDetailModal(placeId);
    }
}

// Modals Utilities
function openModal(modal) {
    modal.classList.add("active");
}

// Close modal
function closeModal(modal) {
    modal.classList.remove("active");
}

// Open Add Place Modal
function openAddPlaceModal(lat = null, lng = null) {
    document.getElementById("place-id").value = "";
    document.getElementById("place-title").value = "";
    document.getElementById("place-description").value = "";
    document.getElementById("place-category").value = "other";
    document.getElementById("place-url").value = "";
    document.getElementById("place-image-url").value = "";
    
    // Reset location search fields
    const searchInput = document.getElementById("location-search-input");
    const resultsList = document.getElementById("search-results-list");
    if (searchInput && resultsList) {
        searchInput.value = "";
        resultsList.innerHTML = "";
        resultsList.style.display = "none";
    }
    
    const center = map.getCenter();
    document.getElementById("place-lat").value = lat !== null ? lat.toFixed(6) : center.lat.toFixed(6);
    document.getElementById("place-lng").value = lng !== null ? lng.toFixed(6) : center.lng.toFixed(6);
    
    // Set hidden inputs and toggle active classes on tabs
    document.getElementById("place-type").value = "place";
    document.getElementById("place-status").value = "want_to_go";
    document.querySelectorAll("#modal-type-tabs .status-tab").forEach(t => {
        t.classList.toggle("active", t.getAttribute("data-type-val") === "place");
    });
    document.querySelectorAll("#modal-status-tabs .status-tab").forEach(t => {
        t.classList.toggle("active", t.getAttribute("data-status-val") === "want_to_go");
    });
    
    toggleModalLocationFields("place");
    
    // 新規追加時はステータスグループを非表示にする（初期値「行きたい」で固定）
    document.getElementById("modal-status-group").style.display = "none";

    document.getElementById("modal-title").textContent = "新規追加";
    document.getElementById("save-place-btn").textContent = "保存する";
    
    openModal(placeModal);
}

// Open Detail Modal
function openDetailModal(placeId) {
    const place = places.find(p => p.id === placeId);
    if (!place) return;

    selectedPlaceId = placeId;
    
    const catMap = {
        food: { label: "グルメ", class: "food" },
        scenic: { label: "絶景・観光", class: "scenic" },
        activity: { label: "遊ぶ・体験", class: "activity" },
        shopping: { label: "お買い物", class: "shopping" },
        lodging: { label: "宿泊", class: "lodging" },
        other: { label: "その他", class: "other" }
    };
    const catInfo = catMap[place.category] || catMap.other;
    const statusLabel = place.status === "want_to_go" ? "行きたい" : "行った！";
    const statusClass = place.status;

    const detailImage = document.getElementById("detail-image");
    if (place.imageUrl) {
        detailImage.style.display = "block";
        detailImage.style.backgroundImage = `url('${place.imageUrl}')`;
    } else {
        detailImage.style.display = "none";
    }

    const catBadge = document.getElementById("detail-category-badge");
    catBadge.className = `category-badge ${catInfo.class}`;
    catBadge.textContent = catInfo.label;

    const typeBadge = document.getElementById("detail-type-badge");
    if (typeBadge) {
        const placeType = place.type || "place";
        typeBadge.className = `status-badge ${placeType === "todo" ? "type-todo" : "type-place"}`;
        typeBadge.textContent = placeType === "todo" ? "やりたいこと" : "行きたい場所";
    }

    const statusBadge = document.getElementById("detail-status-badge");
    statusBadge.className = `status-badge ${statusClass}`;
    statusBadge.textContent = statusLabel;

    document.getElementById("detail-title").textContent = place.title;
    
    const proposerName = place.proposedBy === "user1" ? settings.user1 : settings.user2;
    document.getElementById("detail-proposed-by").textContent = `登録した人: ${proposerName}`;
    document.getElementById("detail-description").textContent = place.description || "説明やメモはありません。";

    const linksDiv = document.getElementById("detail-links");
    linksDiv.innerHTML = "";
    
    // Google Maps Navigation
    const routeLink = document.createElement("a");
    routeLink.className = "link-item";
    routeLink.href = `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`;
    routeLink.target = "_blank";
    routeLink.innerHTML = `<i data-lucide="navigation"></i>Googleマップでナビ`;
    linksDiv.appendChild(routeLink);

    // External link
    if (place.url) {
        const extLink = document.createElement("a");
        extLink.className = "link-item";
        extLink.href = place.url;
        extLink.target = "_blank";
        extLink.innerHTML = `<i data-lucide="external-link"></i>関連リンク・公式サイト`;
        linksDiv.appendChild(extLink);
    }

    const editBtn = document.getElementById("detail-edit-btn");
    editBtn.onclick = () => {
        closeModal(detailModal);
        openEditPlaceModal(place);
    };

    const deleteBtn = document.getElementById("detail-delete-btn");
    deleteBtn.onclick = () => {
        if (confirm(`「${place.title}」を削除してもよろしいですか？`)) {
            deletePlace(place.id);
        }
    };

    renderComments(place.comments || []);
    openModal(detailModal);
    lucide.createIcons();
}

// Render Comments List
function renderComments(commentsList) {
    const commentsContainer = document.getElementById("comments-list");
    document.getElementById("comments-count").textContent = commentsList.length;

    if (commentsList.length === 0) {
        commentsContainer.innerHTML = `<p class="list-placeholder" style="padding: 1rem 0;">まだコメントはありません。相談メモを残そう！</p>`;
        return;
    }

    commentsContainer.innerHTML = "";
    commentsList.forEach(comment => {
        const bubble = document.createElement("div");
        bubble.className = `comment-bubble ${comment.user === "user1" ? "partner1" : "partner2"}`;
        
        const userName = comment.user === "user1" ? settings.user1 : settings.user2;
        const userClass = comment.user === "user1" ? "partner1" : "partner2";

        bubble.innerHTML = `
            <div class="comment-meta">
                <span class="comment-user ${userClass}">${userName}</span>
                <span class="comment-time">${comment.timestamp}</span>
            </div>
            <div class="comment-text">${escapeHTML(comment.text)}</div>
        `;
        commentsContainer.appendChild(bubble);
    });

    commentsContainer.scrollTop = commentsContainer.scrollHeight;
}

// Open Edit Place Modal
function openEditPlaceModal(place) {
    document.getElementById("place-id").value = place.id;
    document.getElementById("place-title").value = place.title;
    document.getElementById("place-description").value = place.description || "";
    document.getElementById("place-category").value = place.category;
    document.getElementById("place-url").value = place.url || "";
    document.getElementById("place-image-url").value = place.imageUrl || "";
    document.getElementById("place-lat").value = place.latitude;
    document.getElementById("place-lng").value = place.longitude;
    
    // Reset location search fields
    const searchInput = document.getElementById("location-search-input");
    const resultsList = document.getElementById("search-results-list");
    if (searchInput && resultsList) {
        searchInput.value = "";
        resultsList.innerHTML = "";
        resultsList.style.display = "none";
    }
    
    const placeType = place.type || "place";
    document.getElementById("place-type").value = placeType;
    document.getElementById("place-status").value = place.status;
    document.querySelectorAll("#modal-type-tabs .status-tab").forEach(t => {
        t.classList.toggle("active", t.getAttribute("data-type-val") === placeType);
    });
    document.querySelectorAll("#modal-status-tabs .status-tab").forEach(t => {
        t.classList.toggle("active", t.getAttribute("data-status-val") === place.status);
    });
    
    toggleModalLocationFields(placeType);

    // 編集時はステータス変更を行えるようにステータスグループを表示する
    document.getElementById("modal-status-group").style.display = "flex";

    document.getElementById("modal-title").textContent = "スポット情報を編集";
    document.getElementById("save-place-btn").textContent = "変更を保存";
    
    openModal(placeModal);
}

// Open Settings Modal
function openSettingsModal() {
    document.getElementById("settings-app-title").value = settings.title;
    document.getElementById("settings-user1").value = settings.user1;
    document.getElementById("settings-user2").value = settings.user2;
    document.getElementById("settings-gas-url").value = GAS_URL === "YOUR_GAS_WEB_APP_URL_HERE" ? "" : GAS_URL;
    openModal(settingsModal);
}

// Roulette candidates: always "want_to_go", further narrowed by the roulette's own
// category/type filters (independent of the sidebar list filters).
function getRouletteCandidates() {
    return places.filter(p => {
        if (p.status !== "want_to_go") return false;
        const catMatch = rouletteCategoryFilter === "all" || p.category === rouletteCategoryFilter;
        const typeMatch = rouletteTypeFilter === "all" || (p.type || "place") === rouletteTypeFilter;
        return catMatch && typeMatch;
    });
}

// Refresh the instruction text / start button based on the current roulette filters,
// without resetting the spin card (used when a filter chip is changed mid-modal).
function updateRouletteAvailability() {
    const candidates = getRouletteCandidates();
    const startBtn = document.getElementById("start-roulette-btn");
    const instruction = document.querySelector(".roulette-instruction");

    const isUnfiltered = rouletteCategoryFilter === "all" && rouletteTypeFilter === "all";

    if (candidates.length === 0) {
        instruction.textContent = isUnfiltered
            ? "※ 「行きたい」スポットが登録されていません。リストにスポットを追加してください！"
            : "※ この条件に合う「行きたい」スポットがありません。条件を変えてみてください。";
        startBtn.style.display = "none";
    } else {
        instruction.textContent = isUnfiltered
            ? "登録された「行きたい」スポットから、本日の行き先をランダムで決定します！"
            : `この条件で ${candidates.length} 件のスポットから抽選します！`;
        startBtn.style.display = "inline-flex";
    }
    return candidates;
}

// Open Roulette Modal
let isSpinning = false;
function openRouletteModal() {
    // Reset the roulette's own filters to "all" each time it's opened.
    rouletteCategoryFilter = "all";
    rouletteTypeFilter = "all";
    document.querySelectorAll("#roulette-category-filters .filter-chip").forEach(c => {
        c.classList.toggle("active", c.getAttribute("data-roulette-category") === "all");
    });
    document.querySelectorAll("#roulette-type-filters .type-tab").forEach(t => {
        t.classList.toggle("active", t.getAttribute("data-roulette-type") === "all");
    });

    const spinCard = document.getElementById("roulette-spin-card");
    const startBtn = document.getElementById("start-roulette-btn");

    spinCard.className = "roulette-card-spin";
    spinCard.querySelector(".spin-category").textContent = "";
    spinCard.querySelector(".spin-title").textContent = "？";
    startBtn.disabled = false;
    startBtn.innerHTML = `<i data-lucide="play-circle"></i>ルーレットを回す！`;
    lucide.createIcons();

    updateRouletteAvailability();

    openModal(rouletteModal);
}

// Form Handlers & API Submissions

// Save or Update Place
async function handlePlaceFormSubmit(e) {
    e.preventDefault();
    
    const placeId = document.getElementById("place-id").value;
    const title = document.getElementById("place-title").value;
    const description = document.getElementById("place-description").value;
    const category = document.getElementById("place-category").value;
    const url = document.getElementById("place-url").value;
    const imageUrl = document.getElementById("place-image-url").value;
    const latitude = parseFloat(document.getElementById("place-lat").value);
    const longitude = parseFloat(document.getElementById("place-lng").value);
    const status = document.getElementById("place-status").value;
    const type = document.getElementById("place-type").value;

    const payload = {
        title,
        description,
        category,
        url,
        imageUrl,
        latitude,
        longitude,
        status,
        type,
        proposedBy: placeId ? undefined : currentUser,
        createdAt: placeId ? undefined : new Date().toISOString()
    };

    try {
        if (isLocal) {
            let response;
            if (placeId) {
                response = await fetch(`/api/places/${placeId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
            } else {
                response = await fetch(`/api/places`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
            }

            if (!response.ok) throw new Error("保存に失敗しました");
            const resData = await response.json();
            
            closeModal(placeModal);
            await fetchData();
            
            if (!placeId && resData.place) {
                selectPlace(resData.place.id, false);
            } else if (placeId) {
                openDetailModal(placeId);
            }
        } else {
            // Cloud storage mode (GAS): send only this place's create/update as its own
            // server-side action, instead of overwriting the whole dataset. This avoids
            // clobbering a concurrent edit/comment made by the other partner in the meantime.
            if (placeId) {
                await saveCloudData({ action: "update_place", id: placeId, place: payload });
                closeModal(placeModal);
                await fetchData();
                openDetailModal(placeId);
            } else {
                const result = await saveCloudData({ action: "create_place", place: payload });
                closeModal(placeModal);
                await fetchData();
                if (result && result.place) {
                    selectPlace(result.place.id, false);
                }
            }
        }
    } catch (error) {
        alert(error.message);
    }
}

// Delete Place
async function deletePlace(placeId) {
    try {
        if (isLocal) {
            const response = await fetch(`/api/places/${placeId}`, {
                method: "DELETE"
            });
            if (!response.ok) throw new Error("削除に失敗しました");
        } else {
            await saveCloudData({ action: "delete_place", id: placeId });
        }

        closeModal(detailModal);
        selectedPlaceId = null;
        await fetchData();
    } catch (error) {
        alert(error.message);
    }
}

// Save Settings
async function handleSettingsFormSubmit(e) {
    e.preventDefault();
    const appTitle = document.getElementById("settings-app-title").value;
    const u1 = document.getElementById("settings-user1").value;
    const u2 = document.getElementById("settings-user2").value;
    const gasUrl = document.getElementById("settings-gas-url").value.trim();

    // Update locally and in localStorage
    if (gasUrl) {
        localStorage.setItem("pairmap_gas_url", gasUrl);
        GAS_URL = gasUrl;
    } else {
        localStorage.removeItem("pairmap_gas_url");
        GAS_URL = "YOUR_GAS_WEB_APP_URL_HERE";
    }

    const newSettings = { title: appTitle, user1: u1, user2: u2 };

    try {
        if (isLocal) {
            const response = await fetch(`/api/settings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newSettings)
            });
            if (!response.ok) throw new Error("設定の保存に失敗しました");
            closeModal(settingsModal);
            await fetchData();
        } else {
            await saveCloudData({ action: "update_settings", settings: newSettings });
            closeModal(settingsModal);
            await fetchData();
        }
    } catch (error) {
        alert(error.message);
    }
}

// Add Comment
async function handleCommentSubmit(e) {
    e.preventDefault();
    if (!selectedPlaceId) return;

    const commentText = document.getElementById("comment-text").value;
    if (!commentText.trim()) return;

    try {
        if (isLocal) {
            const response = await fetch(`/api/places/${selectedPlaceId}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user: currentUser,
                    text: commentText
                })
            });

            if (!response.ok) throw new Error("コメントの送信に失敗しました");
            document.getElementById("comment-text").value = "";
            await fetchData();
            openDetailModal(selectedPlaceId);
        } else {
            // Append this single comment server-side instead of re-sending the whole
            // places array, so a concurrent edit by the other partner isn't overwritten.
            await saveCloudData({
                action: "add_comment",
                placeId: selectedPlaceId,
                comment: { user: currentUser, text: commentText }
            });
            document.getElementById("comment-text").value = "";
            await fetchData();
            openDetailModal(selectedPlaceId);
        }
    } catch (error) {
        alert(error.message);
    }
}

// Start Roulette Spin logic
document.getElementById("start-roulette-btn").addEventListener("click", () => {
    if (isSpinning) return;

    const candidates = getRouletteCandidates();
    if (candidates.length === 0) return;

    isSpinning = true;
    const startBtn = document.getElementById("start-roulette-btn");
    const spinCard = document.getElementById("roulette-spin-card");
    const spinCategory = spinCard.querySelector(".spin-category");
    const spinTitle = spinCard.querySelector(".spin-title");

    startBtn.disabled = true;
    startBtn.innerHTML = `<i data-lucide="loader" class="spin-icon"></i>抽選中...`;
    lucide.createIcons();

    spinCard.className = "roulette-card-spin active-spin";

    let index = 0;
    let delay = 60;
    let timer = null;

    const catMap = {
        food: "グルメ",
        scenic: "絶景・観光",
        activity: "遊ぶ・体験",
        shopping: "お買い物",
        lodging: "宿泊",
        other: "その他"
    };

    const cycle = () => {
        const currentPlace = candidates[index];
        spinCategory.textContent = catMap[currentPlace.category] || "その他";
        spinCategory.className = `spin-category cat-tag ${currentPlace.category}`;
        spinTitle.textContent = currentPlace.title;
        
        index = (index + 1) % candidates.length;

        if (delay < 500) {
            delay += delay * 0.12;
            timer = setTimeout(cycle, delay);
        } else {
            clearTimeout(timer);
            
            const winnerIndex = Math.floor(Math.random() * candidates.length);
            const winner = candidates[winnerIndex];
            
            spinCategory.textContent = catMap[winner.category] || "その他";
            spinCategory.className = `spin-category cat-tag ${winner.category}`;
            spinTitle.textContent = winner.title;
            
            spinCard.className = "roulette-card-spin winner";
            isSpinning = false;
            
            startBtn.disabled = false;
            startBtn.innerHTML = `<i data-lucide="refresh-cw"></i>もう一度まわす`;
            lucide.createIcons();

            setTimeout(() => {
                closeModal(rouletteModal);
                selectPlace(winner.id, false);
            }, 1800);
        }
    };

    timer = setTimeout(cycle, delay);
});

// Helper to escape HTML to prevent XSS
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Location Search using Nominatim OpenStreetMap API
let searchAbortController = null;

async function handleLocationSearch() {
    const query = document.getElementById("location-search-input").value.trim();
    const resultsList = document.getElementById("search-results-list");

    // 前回のリクエストが残っていたら中断し、古い結果が後から上書きされるのを防ぐ
    if (searchAbortController) {
        searchAbortController.abort();
        searchAbortController = null;
    }

    // 短すぎるクエリはノイズの多い結果しか返らないためスキップ
    if (query.length < 2) {
        if (resultsList) {
            resultsList.innerHTML = "";
            resultsList.style.display = "none";
        }
        return;
    }

    resultsList.innerHTML = `<div style="padding: 0.65rem 0.85rem; font-size: 0.8rem; color: var(--text-muted);">検索中...</div>`;
    resultsList.style.display = "flex";

    const controller = new AbortController();
    searchAbortController = controller;

    try {
        // 現在の地図の表示範囲を優先領域として渡し、近くのスポットを上位表示させる
        let viewboxParam = "";
        if (map) {
            const b = map.getBounds();
            viewboxParam = `&viewbox=${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}&bounded=0`;
        }

        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=35&countrycodes=jp&addressdetails=1&dedupe=1${viewboxParam}`, {
            headers: {
                'Accept-Language': 'ja,en;q=0.9'
            },
            signal: controller.signal
        });
        if (!response.ok) throw new Error("検索エラー");
        const results = await response.json();

        if (results.length === 0) {
            resultsList.innerHTML = `<div style="padding: 0.65rem 0.85rem; font-size: 0.8rem; color: var(--text-muted);">候補が見つかりませんでした。</div>`;
            return;
        }

        // 観光スポットや施設（POI）を優先するカスタムソート
        results.sort((a, b) => {
            const getPoiScore = (item) => {
                const c = item.class || "";
                const t = item.type || "";
                // 行政区画や郵便番号などは最も優先度を下げる
                if (c === "boundary" || (c === "place" && ["city", "province", "state", "country", "postcode", "administrative", "quarter", "suburb", "neighbourhood", "island"].includes(t))) {
                    return 1;
                }
                // 具体的な施設、観光地、店舗は最優先
                if (["tourism", "amenity", "leisure", "shop", "historic", "building"].includes(c)) {
                    return 10;
                }
                // 交通機関（駅など）も優先
                if (["railway", "highway"].includes(c)) {
                    return 8;
                }
                return 5;
            };
            const scoreDiff = getPoiScore(b) - getPoiScore(a);
            if (scoreDiff !== 0) return scoreDiff;

            // 同じ優先度同士は、現在の地図の中心に近い候補を上位にする
            if (map) {
                const center = map.getCenter();
                const distA = Math.hypot(a.lat - center.lat, a.lon - center.lng);
                const distB = Math.hypot(b.lat - center.lat, b.lon - center.lng);
                return distA - distB;
            }
            return 0;
        });

        // 上位10件に絞り込む
        const finalResults = results.slice(0, 10);

        resultsList.innerHTML = "";
        finalResults.forEach(item => {
            const div = document.createElement("div");
            div.className = "search-result-item";
            div.textContent = item.display_name;
            div.addEventListener("click", () => {
                // Autofill coordinates
                document.getElementById("place-lat").value = parseFloat(item.lat).toFixed(6);
                document.getElementById("place-lng").value = parseFloat(item.lon).toFixed(6);
                
                // Extract clean title from display_name
                const nameParts = item.display_name.split(',');
                if (nameParts.length > 0) {
                    const cleanName = nameParts[0].trim();
                    // Set title if it is currently empty
                    if (!document.getElementById("place-title").value) {
                        document.getElementById("place-title").value = cleanName;
                    }
                    document.getElementById("location-search-input").value = cleanName;
                }

                // Hide results and center map
                resultsList.innerHTML = "";
                resultsList.style.display = "none";
                
                // Pan map preview to selected coords
                if (map) {
                    map.setView([parseFloat(item.lat), parseFloat(item.lon)], 16);
                }
            });
            resultsList.appendChild(div);
        });
    } catch (error) {
        if (error.name === "AbortError") return;
        console.error("Search error:", error);
        resultsList.innerHTML = `<div style="padding: 0.65rem 0.85rem; font-size: 0.8rem; color: var(--danger);">検索中にエラーが発生しました。</div>`;
    }
}

// Show/Hide location inputs in Add/Edit form depending on Type (place vs todo)
function toggleModalLocationFields(type) {
    const searchGroup = document.querySelector(".search-coords-group");
    const divider = document.querySelector(".form-divider");
    const coordsGroup = document.querySelector(".geo-coords");
    
    if (type === "todo") {
        if (searchGroup) searchGroup.style.display = "none";
        if (divider) divider.style.display = "none";
        if (coordsGroup) coordsGroup.style.display = "none";
        
        document.getElementById("place-lat").required = false;
        document.getElementById("place-lng").required = false;
    } else {
        if (searchGroup) searchGroup.style.display = "block";
        if (divider) divider.style.display = "block";
        if (coordsGroup) coordsGroup.style.display = "flex";
        
        document.getElementById("place-lat").required = true;
        document.getElementById("place-lng").required = true;
    }
}

// ピンチズーム（マルチタッチ）の無効化（地図上でのピンチズームは許可）
document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) {
        if (e.target.closest('#map')) return;
        e.preventDefault();
    }
}, { passive: false });

// ダブルタップズームの無効化（地図上でのダブルタップは許可）
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = new Date().getTime();
    if (now - lastTouchEnd <= 300) {
        if (e.target.closest('#map')) return;
        e.preventDefault();
    }
    lastTouchEnd = now;
}, { passive: false });
