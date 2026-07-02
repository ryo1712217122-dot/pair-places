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
let currentStatusFilter = "all";

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

// Hybrid Storage Configuration
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const CLOUD_BUCKET = "pm_596896be_d3f6_4567_b184_67ab0a0b8f98"; 
const CLOUD_API = `https://kvdb.io/${CLOUD_BUCKET}/places_data`;

// Initialize App
document.addEventListener("DOMContentLoaded", () => {
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
    }).setView([35.6895, 139.6917], 13);

    // Premium CartoDB Dark Matter tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
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

    const categoryChips = document.querySelectorAll(".filter-chip");
    categoryChips.forEach(chip => {
        chip.addEventListener("click", () => {
            categoryChips.forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            currentCategoryFilter = chip.getAttribute("data-filter-category");
            renderUI();
        });
    });

    const statusTabs = document.querySelectorAll(".status-tab");
    statusTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            statusTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            currentStatusFilter = tab.getAttribute("data-filter-status");
            renderUI();
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
}

// Save data helper for Cloud Sync Mode
async function saveCloudData(data) {
    try {
        const response = await fetch(CLOUD_API, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error("クラウドへの保存に失敗しました");
    } catch (error) {
        console.error("Cloud Save Error:", error);
        alert("データの保存に失敗しました。オフライン状態か、サービスが一時的に停止している可能性があります。");
    }
}

// Fetch Data from Server or Cloud
async function fetchData() {
    try {
        let data;
        if (isLocal) {
            const response = await fetch(`/api/data`);
            if (!response.ok) throw new Error("データの取得に失敗しました");
            data = await response.json();
        } else {
            // Cloud storage mode (KVdb.io)
            const response = await fetch(CLOUD_API);
            if (response.status === 404) {
                // Initialize default database on first connect
                data = {
                    settings: {
                        user1: "パートナー1",
                        user2: "パートナー2",
                        title: "ふたりの行きたい場所マップ"
                    },
                    places: []
                };
                await saveCloudData(data);
            } else if (!response.ok) {
                throw new Error("クラウドデータの取得に失敗しました");
            } else {
                data = await response.json();
            }
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
        const statusMatch = currentStatusFilter === "all" || place.status === currentStatusFilter;
        return catMatch && statusMatch;
    });
}

// Render Place List Sidebar
function renderPlacesList() {
    const filtered = getFilteredPlaces();
    placesCount.textContent = filtered.length;

    if (filtered.length === 0) {
        placesList.innerHTML = `
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

        card.innerHTML = `
            <div class="card-image" style="background-image: url('${place.imageUrl}')"></div>
            <div class="card-info">
                <div class="card-category-bar">
                    <span class="cat-tag ${catInfo.class}">${catInfo.label}</span>
                    <span class="card-badge ${statusClass}">${statusLabel}</span>
                </div>
                <h3 class="card-title">${place.title}</h3>
                <p class="card-desc">${place.description || "メモはありません。"}</p>
            </div>
        `;

        card.addEventListener("click", () => selectPlace(place.id));
        placesList.appendChild(card);
    });

    lucide.createIcons();
}

// Update Map Markers
function updateMapMarkers() {
    const filtered = getFilteredPlaces();
    const filteredIds = new Set(filtered.map(p => p.id));

    // Clear deleted/filtered markers
    Object.keys(markers).forEach(id => {
        if (!filteredIds.has(id)) {
            map.removeLayer(markers[id]);
            delete markers[id];
        }
    });

    // Add or update markers
    filtered.forEach(place => {
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

    if (filtered.length > 0 && Object.keys(markers).length === filtered.length && !selectedPlaceId) {
        const group = new L.featureGroup(Object.values(markers));
        map.fitBounds(group.getBounds().pad(0.15));
    }
}

// Select place in list and map
function selectPlace(placeId, zoom = true) {
    selectedPlaceId = placeId;
    renderPlacesList();
    updateMapMarkers();

    const place = places.find(p => p.id === placeId);
    if (place && markers[placeId]) {
        if (zoom) {
            map.setView([place.latitude, place.longitude], 15);
        }
        openDetailModal(placeId);
    }
}

// Modals Utilities
function openModal(modal) {
    modal.classList.add("active");
}

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
    
    const center = map.getCenter();
    document.getElementById("place-lat").value = lat !== null ? lat.toFixed(6) : center.lat.toFixed(6);
    document.getElementById("place-lng").value = lng !== null ? lng.toFixed(6) : center.lng.toFixed(6);
    
    document.querySelector('input[name="place-status"][value="want_to_go"]').checked = true;
    
    document.getElementById("modal-title").textContent = "新しい場所を追加";
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
    detailImage.style.backgroundImage = `url('${place.imageUrl}')`;

    const catBadge = document.getElementById("detail-category-badge");
    catBadge.className = `category-badge ${catInfo.class}`;
    catBadge.textContent = catInfo.label;

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
    
    document.querySelector(`input[name="place-status"][value="${place.status}"]`).checked = true;
    
    document.getElementById("modal-title").textContent = "スポット情報を編集";
    document.getElementById("save-place-btn").textContent = "変更を保存";
    
    openModal(placeModal);
}

// Open Settings Modal
function openSettingsModal() {
    document.getElementById("settings-app-title").value = settings.title;
    document.getElementById("settings-user1").value = settings.user1;
    document.getElementById("settings-user2").value = settings.user2;
    openModal(settingsModal);
}

// Open Roulette Modal
let isSpinning = false;
function openRouletteModal() {
    const candidates = places.filter(p => p.status === "want_to_go");
    const spinCard = document.getElementById("roulette-spin-card");
    const startBtn = document.getElementById("start-roulette-btn");

    spinCard.className = "roulette-card-spin";
    spinCard.querySelector(".spin-category").textContent = "";
    spinCard.querySelector(".spin-title").textContent = "？";
    startBtn.disabled = false;
    startBtn.innerHTML = `<i data-lucide="play-circle"></i>ルーレットを回す！`;
    lucide.createIcons();

    if (candidates.length === 0) {
        document.querySelector(".roulette-instruction").textContent = "※ 「行きたい」スポットが登録されていません。リストにスポットを追加してください！";
        startBtn.style.display = "none";
    } else {
        document.querySelector(".roulette-instruction").textContent = "登録された「行きたい」スポットから、本日の行き先をランダムで決定します！";
        startBtn.style.display = "inline-flex";
    }

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
    const status = document.querySelector('input[name="place-status"]:checked').value;

    const payload = {
        title,
        description,
        category,
        url,
        imageUrl,
        latitude,
        longitude,
        status,
        proposedBy: placeId ? undefined : currentUser,
        createdAt: placeId ? undefined : new Date().toISOString()
    };

    // Auto-fill category-specific images if empty
    if (!payload.imageUrl) {
        const catImages = {
            food: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&auto=format&fit=crop&q=60",
            scenic: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&auto=format&fit=crop&q=60",
            activity: "https://images.unsplash.com/photo-1530541930197-ff16ac917b0e?w=600&auto=format&fit=crop&q=60",
            shopping: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&auto=format&fit=crop&q=60",
            lodging: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&auto=format&fit=crop&q=60",
            other: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&auto=format&fit=crop&q=60"
        };
        payload.imageUrl = catImages[category] || catImages.other;
    }

    try {
        if (isLocal) {
            // Local server API
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
                selectPlace(resData.place.id);
            } else if (placeId) {
                openDetailModal(placeId);
            }
        } else {
            // Cloud storage mode
            if (placeId) {
                const place = places.find(p => p.id === placeId);
                if (place) {
                    Object.assign(place, payload);
                }
            } else {
                const newPlace = {
                    id: Math.random().toString(36).substring(2, 10),
                    ...payload,
                    comments: []
                };
                places.push(newPlace);
                selectedPlaceId = newPlace.id;
            }

            await saveCloudData({ settings, places });
            closeModal(placeModal);
            renderUI();

            if (selectedPlaceId) {
                if (placeId) {
                    openDetailModal(placeId);
                } else {
                    selectPlace(selectedPlaceId);
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
            places = places.filter(p => p.id !== placeId);
            await saveCloudData({ settings, places });
        }
        
        closeModal(detailModal);
        selectedPlaceId = null;
        if (isLocal) {
            await fetchData();
        } else {
            renderUI();
        }
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
            settings = newSettings;
            await saveCloudData({ settings, places });
            closeModal(settingsModal);
            renderUI();
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

    const dateStr = new Date().toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    }).replace(/\//g, "-");

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
            const place = places.find(p => p.id === selectedPlaceId);
            if (place) {
                const newComment = {
                    id: Math.random().toString(36).substring(2, 10),
                    user: currentUser,
                    text: commentText,
                    timestamp: dateStr
                };
                place.comments = place.comments || [];
                place.comments.push(newComment);
                
                await saveCloudData({ settings, places });
                document.getElementById("comment-text").value = "";
                renderUI();
                openDetailModal(selectedPlaceId);
            }
        }
    } catch (error) {
        alert(error.message);
    }
}

// Start Roulette Spin logic
document.getElementById("start-roulette-btn").addEventListener("click", () => {
    if (isSpinning) return;
    
    const candidates = places.filter(p => p.status === "want_to_go");
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
                selectPlace(winner.id);
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
