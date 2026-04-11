import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, updateDoc, increment, addDoc, arrayUnion, arrayRemove, deleteDoc, onSnapshot, query, orderBy, where, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateEmail, updatePassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// === KONFIGURATION ===
const firebaseConfig = { 
    apiKey: "AIzaSyAF-QW_MtVBkImqh1gXwhKrc2pLLCAe3Ek", 
    authDomain: "phil-shorts.firebaseapp.com", 
    projectId: "phil-shorts", 
    storageBucket: "phil-shorts.firebasestorage.app", 
    messagingSenderId: "785802511451", 
    appId: "1:785802511451:web:c7aabd40a4a8ea89616b7e", 
    measurementId: "G-ZCTKSM7EGJ" 
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const supabaseUrl = 'https://smxxafxqtehgegyziplm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNteHhhZnhxdGVoZ2VneXppcGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NDAxNTQsImV4cCI6MjA5MDExNjE1NH0.sZ1Oasg08RLluHjFavz6cR-dntcgAQboAUdMsfVqYBY';
const supabase = createClient(supabaseUrl, supabaseKey);

const GIPHY_API_KEY = "Vj2uCqfOmAT1sXEKQgQvneGy60VIxgCk";

// === GLOBALE VARIABLEN & ALGORITHMUS TRACKER ===
let allVideosData = [];
let allKnownUsers = [];
let currentUser = JSON.parse(localStorage.getItem('phil_session'));
if (currentUser) currentUser.verified = false;
let notifSettings = JSON.parse(localStorage.getItem('phil_notif_settings')) || { master: false, comments: true, likes: true, dms: true, follows: true };

window.editingProfileUid = null;
window.globalMuted = false;
window.globalVolume = 1;

// Globale Cache-Variable für Embeds (gegen Lags)
window.linkPreviewCache = window.linkPreviewCache || {};
let cropperInstance = null;

// Algorithmus Live-Session Tracker
let sessionInterests = {};
let creatorAffinities = {};

// === NEU: SOUND SYSTEM VARIABLEN ===
window.selectedLibrarySound = null; 
window.soundPreviewPlayer = new Audio();
window.soundRequestFile = null;

if (!document.getElementById('dynamic-live-styles')) {
    const style = document.createElement('style');
    style.id = 'dynamic-live-styles';
    style.innerHTML = `
        @keyframes liveFlyUpGift { 0% { transform: translateX(-50%) translateY(0) scale(0.5); opacity: 0; } 15% { transform: translateX(-50%) translateY(-50px) scale(1.2); opacity: 1; } 80% { transform: translateX(-50%) translateY(-150px) scale(1); opacity: 1; } 100% { transform: translateX(-50%) translateY(-300px) scale(0.8); opacity: 0; } }
        .live-chat-msg { animation: fadeIn 0.3s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        #view-live-room.active #live-chat-box { pointer-events: auto !important; }
        #live-chat-box { pointer-events: none; }
    `;
    document.head.appendChild(style);
}

// --- SOUND BIBLIOTHEK LOGIK ---
window.switchSoundTab = function(tabId, element) {
    document.querySelectorAll('.sound-tab-content').forEach(c => c.style.display = 'none');
    document.querySelectorAll('#sound-library-modal .shop-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#' + tabId).forEach(c => c.style.display = 'block');
    if (element) element.classList.add('active');
    
    if (tabId === 'lib-discover') window.loadOfficialLibrary();
    if (tabId === 'lib-trends') window.loadCommunityTrends();
};

window.loadOfficialLibrary = async function() {
    const list = document.getElementById('official-sounds-list');
    list.innerHTML = '<div class="loading-screen"><i class="fas fa-circle-notch fa-spin"></i></div>';
    const snap = await getDocs(query(collection(db, "official_sounds"), orderBy("timestamp", "desc")));
    list.innerHTML = '';
    if (snap.empty) { list.innerHTML = '<p style="color:#555; text-align:center; margin-top:20px;">Keine offiziellen Songs gefunden.</p>'; return; }
    snap.forEach(docSnap => {
        const s = docSnap.data();
        list.innerHTML += createSoundItemHTML(docSnap.id, s.title, s.url, "Phil Shorts Music", "https://i.imgur.com/JDPRzCc.png");
    });
};

window.loadCommunityTrends = function() {
    const list = document.getElementById('community-sounds-list');
    list.innerHTML = '';
    const trends = [];
    allVideosData.forEach(v => {
        if (v.soundUrl && !trends.find(t => t.url === v.soundUrl)) {
            trends.push({ id: v.id, title: v.soundName || "Originalton", url: v.soundUrl, author: v.authorName, pic: v.authorPic });
        }
    });
    if (trends.length === 0) { list.innerHTML = '<p style="color:#555; text-align:center;">Noch keine Community Trends.</p>'; return; }
    trends.forEach(t => { list.innerHTML += createSoundItemHTML(t.id, t.title, t.url, t.author, t.pic); });
};

function createSoundItemHTML(id, title, url, author, pic) {
    const safeTitle = title.replace(/'/g, "\\'");
    return `<div class="sound-item-card">
                <img src="${pic || 'https://i.imgur.com/JDPRzCc.png'}">
                <div class="sound-item-info"><strong>${title}</strong><span>${author}</span></div>
                <div class="sound-item-btns">
                    <button class="sound-lib-play profile-action-btn edit-btn" style="min-width:40px; padding:0;" onclick="previewLibSound('${url}', this)"><i class="fas fa-play"></i></button>
                    <button class="sound-lib-use profile-action-btn" style="min-width:60px; padding:0 10px; font-size:12px;" onclick="selectSoundForUpload('${id}', '${safeTitle}', '${url}')">Wählen</button>
                </div>
            </div>`;
}

window.previewLibSound = function(url, btn) {
    if (!window.soundPreviewPlayer.paused && window.soundPreviewPlayer.src === url) {
        window.soundPreviewPlayer.pause();
        btn.innerHTML = '<i class="fas fa-play"></i>';
    } else {
        document.querySelectorAll('.sound-lib-play').forEach(b => b.innerHTML = '<i class="fas fa-play"></i>');
        window.soundPreviewPlayer.src = url;
        window.soundPreviewPlayer.play();
        btn.innerHTML = '<i class="fas fa-pause"></i>';
    }
};

window.selectSoundForUpload = function(id, name, url) {
    window.selectedLibrarySound = { id, name, url, offset: 0 };
    window.soundPreviewPlayer.pause();
    document.getElementById('sound-library-modal').classList.remove('show');
    
    document.getElementById('upload-music-system').style.display = 'block';
    document.getElementById('selected-sound-editor').style.display = 'block';
    document.getElementById('active-sound-name').innerText = name;
    document.getElementById('open-sound-library-btn').innerHTML = '<i class="fas fa-search"></i> Sound ändern';
    
    const vidVol = document.getElementById('up-video-vol');
    if(vidVol) vidVol.value = 0.2; 
    showToast("Musik hinzugefügt! 🎵");
};

window.removeSelectedMusic = function() {
    window.selectedLibrarySound = null;
    document.getElementById('selected-sound-editor').style.display = 'none';
    document.getElementById('open-sound-library-btn').innerHTML = '<i class="fas fa-search"></i> Sound aus Bibliothek wählen';
    const muteToggle = document.getElementById('up-mute-original-toggle');
    if(muteToggle) muteToggle.checked = false;
};

// === MICRO-INTERACTIONS & GAMIFICATION ===
function triggerHaptic(type = 'light') {
    if (!navigator.vibrate) return;
    if (type === 'light') navigator.vibrate(20);
    else if (type === 'heavy') navigator.vibrate([40, 30, 40]);
    else if (type === 'success') navigator.vibrate([30, 50, 30, 50, 50]);
}

window.createParticles = function(x, y, parent) {
    for (let i = 0; i < 12; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        parent.appendChild(p);
        const angle = Math.random() * Math.PI * 2;
        const distance = 40 + Math.random() * 60;
        p.style.setProperty('--tx', Math.cos(angle) * distance + 'px');
        p.style.setProperty('--ty', Math.sin(angle) * distance + 'px');
        p.style.left = x + 'px';
        p.style.top = y + 'px';
        p.style.animation = 'shootParticle 0.6s cubic-bezier(0.25, 1, 0.5, 1) forwards';
        setTimeout(() => p.remove(), 600);
    }
};

function showAchievement(text) {
    triggerHaptic('success');
    const popup = document.getElementById('achievement-popup');
    if (popup) {
        document.getElementById('achievement-text').innerText = text;
        popup.classList.add('show');
        setTimeout(() => popup.classList.remove('show'), 3000);
    }
}

const XP_LEVELS = [0, 50, 150, 300, 500, 1000, 2000, 5000];
async function awardXP(amount) {
    if (!currentUser) return;
    if (!currentUser.xp) currentUser.xp = 0;

    let oldLevel = 1;
    for (let i = 0; i < XP_LEVELS.length; i++) { if (currentUser.xp >= XP_LEVELS[i]) oldLevel = i + 1; }

    currentUser.xp += amount;

    let newLevel = 1;
    for (let i = 0; i < XP_LEVELS.length; i++) { if (currentUser.xp >= XP_LEVELS[i]) newLevel = i + 1; }

    if (newLevel > oldLevel) {
        showAchievement(`Level Up! Du bist jetzt Level ${newLevel}`);
        currentUser.coins = (currentUser.coins || 0) + (newLevel * 100);
    }

    await updateDoc(doc(db, "users", currentUser.uid), { xp: currentUser.xp, coins: currentUser.coins });
    updateProfileGamificationUI();
}

function updateProfileGamificationUI() {
    if (!currentUser || !document.getElementById('view-profile').classList.contains('active')) return;
    const actionBtn = document.getElementById('profile-action-btn');
    if (actionBtn && actionBtn.dataset.uid === currentUser.uid) {
        const xpEl = document.getElementById('stat-xp');
        if (xpEl) xpEl.innerText = currentUser.xp || 0;
        let lvl = 1;
        for (let i = 0; i < XP_LEVELS.length; i++) { if ((currentUser.xp || 0) >= XP_LEVELS[i]) lvl = i + 1; }
        const lvlEl = document.getElementById('stat-level');
        if (lvlEl) lvlEl.innerText = lvl;
        const streakEl = document.getElementById('stat-streak');
        if (streakEl) streakEl.innerText = currentUser.streak || 0;
    }
}

async function checkDailyStreak() {
    if (!currentUser) return;
    const today = new Date().toDateString();
    if (currentUser.lastStreakUpdate !== today) {
        let lastDate = new Date(currentUser.lastStreakUpdate || 0);
        let yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        if (lastDate.toDateString() === yesterday.toDateString()) {
            currentUser.streak = (currentUser.streak || 0) + 1;
            showAchievement(`${currentUser.streak} Tage Streak! 🔥`);
            currentUser.coins = (currentUser.coins || 0) + 50;
        } else if (currentUser.lastStreakUpdate) {
            currentUser.streak = 1;
        } else {
            currentUser.streak = 1;
        }

        currentUser.lastStreakUpdate = today;
        await updateDoc(doc(db, "users", currentUser.uid), { streak: currentUser.streak, lastStreakUpdate: today, coins: currentUser.coins });
    }
}

async function uploadFileToFirebase(file, folderName) {
    return new Promise(async(resolve, reject) => {
        try {
            const statusEl = document.getElementById('upload-status') || document.getElementById('story-upload-status') || document.getElementById('duet-status');
            if (statusEl) statusEl.innerText = `Lade hoch zu Datenbank...`;
            let fileExt = file.name ? file.name.split('.').pop() : 'png';
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `${folderName}/${fileName}`;
            const { data, error } = await supabase.storage.from('phil-shorts-media').upload(filePath, file, { cacheControl: '3600', upsert: false });
            if (error) throw error;
            const { data: publicUrlData } = supabase.storage.from('phil-shorts-media').getPublicUrl(filePath);
            if (statusEl) statusEl.innerText = `Upload erfolgreich!`;
            resolve(publicUrlData.publicUrl);
        } catch (error) { reject(error); }
    });
}

window.sendDesktopNotification = function(title, body, type) {
    if (!("Notification" in window) || !notifSettings.master || Notification.permission !== "granted") return;
    if (type === 'comment' && !notifSettings.comments) return;
    if ((type === 'like' || type === 'gift') && !notifSettings.likes) return;
    if (type === 'message' && !notifSettings.dms) return;
    if (type === 'follow' && !notifSettings.follows) return;
    try { const notif = new Notification(title, { body: body });
        notif.onclick = function() { window.focus();
            this.close(); }; } catch (e) {}
};

function updateNotifUI() {
    const masterToggle = document.getElementById('notif-master');
    const subSettings = document.getElementById('notif-sub-settings');
    if (!masterToggle) return;
    masterToggle.checked = notifSettings.master;
    document.getElementById('notif-comments').checked = notifSettings.comments;
    document.getElementById('notif-likes').checked = notifSettings.likes;
    document.getElementById('notif-dms').checked = notifSettings.follows;
    document.getElementById('notif-follows').checked = notifSettings.follows;
    if (notifSettings.master) { subSettings.style.opacity = '1';
        subSettings.style.pointerEvents = 'auto'; } else { subSettings.style.opacity = '0.5';
        subSettings.style.pointerEvents = 'none'; }
}

document.getElementById('notif-master')?.addEventListener('change', async(e) => {
    if (e.target.checked) {
        if (!("Notification" in window)) { showCustomAlert("Nicht unterstützt", "Browser unterstützt keine Desktop-Benachrichtigungen.");
            e.target.checked = false; return; }
        if (Notification.permission === "denied") { showCustomAlert("Blockiert!", "Benachrichtigungen blockiert.");
            e.target.checked = false;
            notifSettings.master = false;
            updateNotifUI(); return; }
        if (Notification.permission !== "granted") { const perm = await Notification.requestPermission(); if (perm !== "granted") { e.target.checked = false;
                notifSettings.master = false;
                updateNotifUI(); return; } }
    }
    notifSettings.master = e.target.checked;
    localStorage.setItem('phil_notif_settings', JSON.stringify(notifSettings));
    updateNotifUI();
});

let currentFeedMode = 'foryou';
let isInitialLoad = true;
let sortedFeed = [];
const viewedVideos = new Set();

window.switchView = function(viewId) {
    if (viewId !== 'sound' && window.soundPreviewPlayer) { window.soundPreviewPlayer.pause(); const icon = document.getElementById('sound-play-icon'); if (icon) icon.className = 'fas fa-play'; }
    if (window.soundPreviewPlayer) window.soundPreviewPlayer.pause();
    
    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
    });
    
    const targetView = document.getElementById('view-' + viewId);
    if(targetView) {
        targetView.classList.add('active');
    }
    
    document.querySelectorAll('.nav__item').forEach(n => n.classList.remove('active'));
    if (viewId === 'feed') document.querySelectorAll('.nav__item')[0].classList.add('active');
    if (viewId === 'search') document.querySelectorAll('.nav__item')[1].classList.add('active');
    if (viewId === 'inbox' || viewId === 'dm' || viewId === 'ticket') document.querySelectorAll('.nav__item')[3].classList.add('active');
    if (viewId === 'profile' && currentUser && document.getElementById('profile-name').innerText.includes(currentUser.displayName)) { document.querySelectorAll('.nav__item')[4].classList.add('active');
        updateProfileGamificationUI(); }
    if (viewId !== 'feed' && viewId !== 'duet' && viewId !== 'live-room') document.querySelectorAll('.video__player').forEach(v => { v.pause();
        v.currentTime = 0; });
    const audioPlayer = document.getElementById('profile-audio-player');
    if (viewId !== 'profile' && audioPlayer) audioPlayer.pause();
    
    if (viewId === 'live-list' && window.LiveManager) window.LiveManager.init();
};

window.jumpToVideo = function(videoId) {
    switchView('feed');
    setTimeout(() => {
        const targetVid = document.querySelector(`.video[data-id="${videoId}"]`);
        if (targetVid) { targetVid.scrollIntoView({ behavior: 'smooth', block: 'center' });
            document.querySelectorAll('.video__player').forEach(v => { v.pause();
                v.currentTime = 0; }); const player = targetVid.querySelector('.video__player'); if (player) { player.muted = window.globalMuted;
                player.play().catch(() => {}); } }
    }, 250);
};

function showToast(msg) { triggerHaptic('light'); const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500); }

function showCustomAlert(title, message) { document.getElementById('alert-title').innerText = title;
    document.getElementById('alert-message').innerText = message;
    document.getElementById('custom-alert-modal').classList.add('show'); }
document.getElementById('close-alert-btn')?.addEventListener('click', () => document.getElementById('custom-alert-modal').classList.remove('show'));

function parseJwt(token) { var base64Url = token.split('.')[1]; var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/'); var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join('')); return JSON.parse(jsonPayload); }

function getUserData(uid, fallbackName, fallbackUsername, fallbackPic, fallbackVerified) { const user = allKnownUsers.find(u => u.uid === uid); return { displayName: user ? user.displayName : fallbackName, username: user && user.username ? user.username : (user ? user.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() : (fallbackUsername || fallbackName)), pic: user ? user.photoURL : fallbackPic, verified: user ? (user.verified === true) : fallbackVerified, philPlusUntil: user ? user.philPlusUntil : 0, philPlusTier: user ? user.philPlusTier : 0, activeBorder: user ? user.activeBorder : "", customBorder: user ? user.customBorder : null, lastActive: user ? user.lastActive : 0 }; }

function getVerifiedBadge(isVerif) { return isVerif ? '<i class="fas fa-check-circle verified-badge"></i>' : ''; }

function timeAgo(timestamp) { const now = Date.now(); const diff = now - Number(timestamp); const minutes = Math.floor(diff / 60000); const hours = Math.floor(minutes / 60); const days = Math.floor(hours / 24); if (minutes < 1) return 'gerade eben'; if (minutes < 60) return `vor ${minutes} Min.`; if (hours < 24) return `vor ${hours} Std.`; if (days < 7) return `vor ${days} T.`; return new Date(Number(timestamp)).toLocaleDateString('de-DE'); }

// === OPTIMIERTE DISCORD STYLE EMBEDS OHNE LAGS ===

window.processEmbeds = async function() {
    const placeholders = document.querySelectorAll('.embed-placeholder[data-url]');
    for (const el of placeholders) {
        const url = el.getAttribute('data-url');
        el.removeAttribute('data-url'); 

        if (window.linkPreviewCache[url]) {
            if (window.linkPreviewCache[url] instanceof Promise) {
                window.linkPreviewCache[url].then(data => {
                    if (data) renderDiscordEmbed(data, el);
                });
            } else {
                renderDiscordEmbed(window.linkPreviewCache[url], el);
            }
            continue;
        }

        window.linkPreviewCache[url] = fetchPreviewData(url).then(data => {
            window.linkPreviewCache[url] = data; 
            if (data) renderDiscordEmbed(data, el);
            return data;
        });
    }
};

async function fetchPreviewData(url) {
    try {
        const response = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
        const json = await response.json();
        if (json.status === 'success' && json.data) {
            const d = json.data;
            return {
                siteName: d.publisher || new URL(url).hostname.replace('www.', ''),
                title: d.title || "",
                desc: d.description || "",
                image: d.image ? d.image.url : (d.logo ? d.logo.url : ""),
                url: url
            };
        }
        return null;
    } catch(e) {
        console.error("Embed load failed:", e);
        return null;
    }
}

function renderDiscordEmbed(data, el) {
    if (!el || !document.body.contains(el)) return;
    const chatBox = el.closest('.chat-container');
    const isNearBottom = chatBox ? (chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 100) : false;

    let html = `<div class="discord-embed">`;
    if (data.siteName) html += `<div class="discord-embed-site">${data.siteName}</div>`;
    if (data.title) html += `<a href="${data.url}" target="_blank" class="discord-embed-title">${data.title}</a>`;
    if (data.desc) html += `<div class="discord-embed-desc">${data.desc.length > 150 ? data.desc.substring(0, 150) + '...' : data.desc}</div>`;
    if (data.image) html += `<img src="${data.image}" class="discord-embed-img" onerror="this.style.display='none'">`;
    html += `</div>`;
    
    el.outerHTML = html;
    
    if (chatBox && isNearBottom) {
        setTimeout(() => chatBox.scrollTop = chatBox.scrollHeight, 100);
    }
}

function formatDMText(text) {
    if (!text) return "";
    let safeText = escapeHTML(text);
    
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    safeText = safeText.replace(urlRegex, function(url) {
        if (url.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i)) {
            return `<div class="link-embed"><a href="${url}" target="_blank" class="link-embed-title">${url}</a><img src="${url}" class="link-embed-img"></div>`;
        } else {
            return `<a href="${url}" target="_blank" class="dm-link">${url}</a><div class="embed-placeholder" data-url="${url}"></div>`;
        }
    });
    
    return safeText;
}

window.formatText = function(text) {
    if (!text) return "";
    let safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    safeText = safeText.replace(/#([a-zA-Z0-9_äöüÄÖÜß]+)/g, '<span class="hashtag" onclick="openHashtag(\'$1\', event)">#$1</span>');
    safeText = safeText.replace(/@([a-zA-Z0-9_]+)/g, '<span class="mention" onclick="openProfileByUsername(\'$1\', event)">@$1</span>');
    return safeText;
};

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    ).replace(/✅|✔️|☑️/g, ''); 
}

window.openHashtag = function(tag, event) {
    if (event) event.stopPropagation();
    switchView('hashtag');
    document.getElementById('hashtag-title').innerText = '#' + tag;
    const grid = document.getElementById('hashtag-grid');
    grid.innerHTML = '';
    let blocked = (currentUser && currentUser.blockedUsers) ? currentUser.blockedUsers : [];
    const matchedVideos = allVideosData.filter(v => (v.description || "").toLowerCase().includes('#' + tag.toLowerCase()) && !blocked.includes(v.authorUid));
    if (matchedVideos.length === 0) { grid.innerHTML = '<div style="grid-column: span 3; text-align: center; margin-top: 50px; color: #555;">Keine Videos gefunden</div>'; return; }
    matchedVideos.forEach(v => { const previewSrc = v.mediaType === 'images' && v.urls ? v.urls[0] : `${v.url}#t=0.5`; const mediaTag = v.mediaType === 'images' ? `<img src="${previewSrc}" style="width:100%; height:100%; object-fit:cover;">` : `<video src="${previewSrc}" muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>`; const icon = v.mediaType === 'images' ? 'fa-images' : 'fa-play';
        grid.innerHTML += `<div class="grid-item" onclick="jumpToVideo('${v.id}')">${mediaTag}<div class="grid-views"><i class="fas ${icon}"></i> ${v.likedBy ? v.likedBy.length : 0}</div></div>`; });
};

window.openProfileByUsername = function(username, event) {
    if (event) event.stopPropagation();
    const user = allKnownUsers.find(u => { const cleanUname = u.username || (u.displayName ? u.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() : 'user'); return cleanUname === username.toLowerCase(); });
    if (user) openProfile(user.uid);
    else showToast("Nutzer @" + username + " nicht gefunden!");
};

let activeMentionInput = null;
let mentionStartIndex = -1;
document.addEventListener('input', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        const val = e.target.value;
        const cursorPos = e.target.selectionStart;
        if (cursorPos === undefined) return;
        const textBeforeCursor = val.substring(0, cursorPos);
        const match = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);
        if (match) { activeMentionInput = e.target;
            mentionStartIndex = cursorPos - match[0].length;
            showMentionSuggestions(e.target, match[1].toLowerCase()); } else hideMentionSuggestions();
    }
});

window.showMentionSuggestions = function(inputEl, query) {
    let blocked = (currentUser && currentUser.blockedUsers) ? currentUser.blockedUsers : [];
    const matchedUsers = allKnownUsers.filter(u => { if (blocked.includes(u.uid)) return false; const uname = (u.username || "").toLowerCase(); const dname = (u.displayName || "").toLowerCase(); return uname.includes(query) || dname.includes(query); });
    const box = document.getElementById('mention-suggestions');
    if (!box) return;
    if (matchedUsers.length === 0) { box.style.display = 'none'; return; }
    box.innerHTML = matchedUsers.map(u => { const safeUsername = u.username || (u.displayName ? u.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() : 'user'); const safePic = u.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback'; return `<div class="mention-item" onclick="selectMention('${safeUsername}')"><img src="${safePic}"><span>@${safeUsername}</span></div>`; }).join('');
    const rect = inputEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    box.style.left = rect.left + 'px';
    if (spaceBelow > 200) { box.style.top = (rect.bottom + 5) + 'px';
        box.style.bottom = 'auto'; } else { box.style.top = 'auto';
        box.style.bottom = (window.innerHeight - rect.top + 5) + 'px'; }
    box.style.display = 'block';
};
window.selectMention = function(username) { if (!activeMentionInput) return; const val = activeMentionInput.value;
    activeMentionInput.value = val.substring(0, mentionStartIndex) + '@' + username + ' ' + val.substring(activeMentionInput.selectionStart);
    hideMentionSuggestions();
    activeMentionInput.focus(); };
window.hideMentionSuggestions = function() { const box = document.getElementById('mention-suggestions'); if (box) box.style.display = 'none';
    activeMentionInput = null; };
document.addEventListener('click', (e) => { if (!e.target.closest('#mention-suggestions') && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') hideMentionSuggestions(); });

let userUnsubscribe = null;

function checkPhilPlusStatus(requiredTier = 1) { return currentUser && currentUser.philPlusUntil && currentUser.philPlusUntil > Date.now() && (currentUser.philPlusTier || 1) >= requiredTier; }

function applyAppTheme(themeName) { document.body.className = (!themeName || themeName === 'default') ? '' : `theme-${themeName}`; }

function getInlineBorderStyle(activeBorder, customBorder) { if (!activeBorder || activeBorder === 'none') return ''; if (activeBorder === 'custom' && customBorder) { return customBorder.grad ? `border: 3px solid transparent; background: linear-gradient(#000, #000) padding-box, linear-gradient(45deg, ${customBorder.c1}, ${customBorder.c2}) border-box; padding: 2px;` : `border: 3px solid ${customBorder.c1}; box-shadow: 0 0 10px ${customBorder.c1}, inset 0 0 5px ${customBorder.c1}; padding: 2px;`; } return ''; }

function getBorderClass(activeBorder) { return (!activeBorder || activeBorder === 'none' || activeBorder === 'custom') ? '' : `border-${activeBorder}`; }

function applyBorderStyles(el, activeBorder, customBorder) { el.className = el.className.replace(/border-[^\s]+/g, '');
    el.classList.remove('border-none', 'border-custom'); if (!activeBorder || activeBorder === 'none') { el.style.cssText = '';
        el.classList.add('border-none'); } else if (activeBorder === 'custom' && customBorder) { el.style.cssText = getInlineBorderStyle('custom', customBorder); } else { el.style.cssText = '';
        el.classList.add(`border-${activeBorder}`); } }

function initLiveUser() {
    if (!currentUser) return;
    if (userUnsubscribe) userUnsubscribe();
    userUnsubscribe = onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.banned) { localStorage.removeItem('phil_session');
                alert("Dein Account wurde gesperrt.");
                window.location.reload(); return; }
            currentUser = {...currentUser, ...data };
            if (currentUser.coins === undefined) currentUser.coins = 1000;
            if (!currentUser.followers) currentUser.followers = [];
            if (!currentUser.following) currentUser.following = [];
            if (!currentUser.savedVideos) currentUser.savedVideos = [];
            if (!currentUser.blockedUsers) currentUser.blockedUsers = [];
            if (!currentUser.socialLinks) currentUser.socialLinks = { ig: '', yt: '', tw: '', tt: '' };
            if (!currentUser.decorations) currentUser.decorations = [];
            if (!currentUser.username) currentUser.username = currentUser.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
            if (!currentUser.appTheme) currentUser.appTheme = 'default';
            if (!currentUser.appIcon) currentUser.appIcon = 'default';
            if (!currentUser.philPlusTier) currentUser.philPlusTier = 0;
            if (!currentUser.customBorder) currentUser.customBorder = { c1: '#ff0050', c2: '#00f2fe', grad: true };
            if (!currentUser.dmPrivacy) currentUser.dmPrivacy = 'everyone'; 

            const dmPrivacySelect = document.getElementById('dm-privacy-select');
            if(dmPrivacySelect) dmPrivacySelect.value = currentUser.dmPrivacy;

            const today = new Date().toDateString();
            if (currentUser.lastLogin !== today) { let bonus = 100; if (checkPhilPlusStatus(3)) bonus = 500;
                else if (checkPhilPlusStatus(2)) bonus = 200;
                currentUser.coins += bonus;
                currentUser.lastLogin = today;
                updateDoc(doc(db, "users", currentUser.uid), { coins: currentUser.coins, lastLogin: today, lastActive: Date.now() });
                showToast(`Täglicher Login: +${bonus} Coins!`); }

            let needsUpdate = false;
            if (!checkPhilPlusStatus(2)) { if (currentUser.appTheme && currentUser.appTheme !== 'default') { currentUser.appTheme = 'default';
                    needsUpdate = true; } if (currentUser.activeBorder === 'chroma') { currentUser.activeBorder = '';
                    needsUpdate = true;
                    applyBorderStyles(document.getElementById('profile-pic'), '', null); } }
            if (!checkPhilPlusStatus(3)) { if (currentUser.profileSong || currentUser.profileColor || (currentUser.appIcon && currentUser.appIcon !== 'default') || currentUser.activeBorder === 'custom') { currentUser.profileSong = '';
                    currentUser.profileColor = '';
                    currentUser.appIcon = 'default'; if (currentUser.activeBorder === 'custom') currentUser.activeBorder = '';
                    needsUpdate = true; } }
            if (needsUpdate) updateDoc(doc(db, "users", currentUser.uid), { appTheme: currentUser.appTheme, activeBorder: currentUser.activeBorder, profileSong: currentUser.profileSong || '', profileColor: currentUser.profileColor || '', appIcon: currentUser.appIcon || 'default' });

            localStorage.setItem('phil_session', JSON.stringify(currentUser));
            if (checkPhilPlusStatus(2)) { applyAppTheme(currentUser.appTheme);
                document.getElementById('app-theme-select').value = currentUser.appTheme; } else applyAppTheme('default');
            if (checkPhilPlusStatus(3) && currentUser.appIcon) { document.getElementById('app-icon-select').value = currentUser.appIcon; const favicon = document.getElementById('dynamic-favicon'); if (currentUser.appIcon === 'gold') favicon.href = "https://cdn-icons-png.flaticon.com/512/189/189118.png";
                else if (currentUser.appIcon === 'dark') favicon.href = "https://cdn-icons-png.flaticon.com/512/32/32114.png";
                else favicon.href = "https://i.imgur.com/JDPRzCc.png"; }

            if (checkPhilPlusStatus(3)) { document.getElementById('tier3-settings-area').style.display = 'block';
                document.getElementById('account-switcher-area').style.display = 'block';
                document.getElementById('up-story-link').style.display = 'block'; } else { document.getElementById('tier3-settings-area').style.display = 'none';
                document.getElementById('account-switcher-area').style.display = 'none';
                document.getElementById('up-story-link').style.display = 'none'; }

            document.getElementById('btn-live-stream').style.display = 'flex';

            const supportTab = document.getElementById('tab-support');
            if (supportTab) supportTab.style.display = 'block';
            if (window.initSupportTickets) window.initSupportTickets();
            const coinEl = document.getElementById('my-coins');
            if (coinEl) coinEl.innerText = currentUser.coins;
            const viewsEl = document.getElementById('my-views');
            if (viewsEl) viewsEl.innerText = currentUser.profileViews || 0;
            const actionBtn = document.getElementById('profile-action-btn');

            if (actionBtn && actionBtn.dataset.uid === currentUser.uid) {
                document.getElementById('stat-followers').innerText = currentUser.followers.length;
                document.getElementById('stat-following').innerText = currentUser.following.length;
                applyBorderStyles(document.getElementById('profile-pic'), currentUser.activeBorder, currentUser.customBorder);
                if (checkPhilPlusStatus(1)) { document.getElementById('phil-plus-badge-container').style.display = 'block'; let tierText = "Phil Shorts+"; if (currentUser.philPlusTier === 2) tierText = "Phil Shorts++"; if (currentUser.philPlusTier === 3) tierText = "Phil Shorts+++";
                    document.getElementById('phil-plus-badge-text').innerHTML = `<i class="fas fa-star"></i> ${tierText}`; } else document.getElementById('phil-plus-badge-container').style.display = 'none';
            }
            if (document.getElementById('app-settings-modal').classList.contains('show')) renderBlockedUsersList();
            updateProfileGamificationUI();
        }
    });
    setInterval(() => { if (currentUser && document.visibilityState === 'visible') updateDoc(doc(db, "users", currentUser.uid), { lastActive: Date.now() }).catch(() => {}); }, 60000);
}

function initSearchUsers() {
    onSnapshot(collection(db, "users"), (snapshot) => {
        allKnownUsers = [];
        snapshot.forEach(doc => allKnownUsers.push(doc.data()));
        allKnownUsers.forEach(u => {
            const isVerif = u.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : '';
            const cleanUsername = u.username || u.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
            let nameClass = "";
            let tier3Badge = "";
            if (u.philPlusUntil && u.philPlusUntil > Date.now() && (u.philPlusTier || 1) >= 1) nameClass = "name-phil-plus";
            if (u.philPlusUntil && u.philPlusUntil > Date.now() && u.philPlusTier === 3) tier3Badge = ' <i class="fas fa-gem" style="color: #00f2fe; font-size: 12px;" title="Plus+++ Legende"></i>';
            document.querySelectorAll(`.live-name-${u.uid}`).forEach(el => { let blockedBadge = ''; if (currentUser && currentUser.blockedUsers && currentUser.blockedUsers.includes(u.uid)) blockedBadge = '<span style="color:#ff4444; font-size:10px; margin-left:5px; font-weight:bold;">[BLOCKIERT]</span>';
                el.innerHTML = u.displayName + isVerif + tier3Badge + blockedBadge; if (nameClass) el.classList.add(nameClass);
                else el.classList.remove("name-phil-plus"); });
            document.querySelectorAll(`.live-username-${u.uid}`).forEach(el => el.innerText = '@' + cleanUsername);
            document.querySelectorAll(`.live-pic-${u.uid}`).forEach(el => { el.src = u.photoURL;
                applyBorderStyles(el, u.activeBorder, u.customBorder); });
        });
    });
}

window.addEventListener('googleLoginSuccess', async(event) => {
    try {
        const data = parseJwt(event.detail.credential);
        const uid = data.sub;
        const rawDisplayName = escapeHTML(data.name);
        let baseUser = rawDisplayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        if (!baseUser || baseUser.length < 3) baseUser = "user" + Math.floor(100 + Math.random() * 900);
        const pic = data.picture;
        const email = data.email;
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
            let finalUser = baseUser;
            let nameQuery = query(collection(db, "users"), where("username", "==", finalUser));
            let nameSnap = await getDocs(nameQuery);
            while (!nameSnap.empty) { finalUser = baseUser + Math.floor(1000 + Math.random() * 9000);
                nameQuery = query(collection(db, "users"), where("username", "==", finalUser));
                nameSnap = await getDocs(nameQuery); }
            const newUser = { uid: uid, displayName: rawDisplayName, username: finalUser, email: email, photoURL: pic, bio: "Neu in der Community! 👋", following: [], followers: [], savedVideos: [], blockedUsers: [], socialLinks: { ig: '', yt: '', tw: '', tt: '' }, verified: false, coins: 1000, xp: 0, streak: 1, profileViews: 0, isAdmin: false, banned: false, decorations: [], activeBorder: "", stories: [], appTheme: 'default', dmPrivacy: 'everyone', philPlusTier: 0, lastLogin: new Date().toDateString(), lastActive: Date.now(), customBorder: { c1: '#ff0050', c2: '#00f2fe', grad: true } };
            await setDoc(userRef, newUser);
            currentUser = newUser;
        } else {
            currentUser = userSnap.data();
            if (currentUser.banned) { showCustomAlert("Gesperrt", "Account gesperrt.");
                localStorage.removeItem('phil_session');
                currentUser = null;
                document.getElementById('login-screen').classList.add('show'); return; }
            if (!currentUser.following) currentUser.following = [];
            if (!currentUser.savedVideos) currentUser.savedVideos = [];
            if (!currentUser.blockedUsers) currentUser.blockedUsers = [];
            if (!currentUser.socialLinks) currentUser.socialLinks = { ig: '', yt: '', tt: '' };
            if (!currentUser.decorations) currentUser.decorations = [];
            if (!currentUser.username) currentUser.username = currentUser.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
            if (currentUser.coins === undefined) await updateDoc(userRef, { coins: 1000, profileViews: 0, followers: [] });
            if (!currentUser.customBorder) await updateDoc(userRef, { customBorder: { c1: '#ff0050', c2: '#00f2fe', grad: true } });
            if (!currentUser.dmPrivacy) currentUser.dmPrivacy = 'everyone'; 
        }
        localStorage.setItem('phil_session', JSON.stringify(currentUser));
        document.getElementById('login-screen').classList.remove('show');
        initLiveDatabase();
        initLiveUser();
        initInbox();
        initInboxChats();
        initSearchUsers();
        if(window.LiveManager) window.LiveManager.init();
        checkDailyStreak();
    } catch (error) { showCustomAlert("Login Fehler", "Datenbank-Fehler beim Login."); }
});

window.onload = async function() {
    if (!currentUser) { document.getElementById('login-screen').classList.add('show'); } else {
        document.getElementById('login-screen').classList.remove('show');
        if (!currentUser.username) currentUser.username = currentUser.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        if (!currentUser.savedVideos) currentUser.savedVideos = [];
        if (!currentUser.blockedUsers) currentUser.blockedUsers = [];
        if (!currentUser.socialLinks) currentUser.socialLinks = { ig: '', yt: '', tw: '', tt: '' };
        if (!currentUser.dmPrivacy) currentUser.dmPrivacy = 'everyone';
        initLiveDatabase();
        initLiveUser();
        initInbox();
        initInboxChats();
        initSearchUsers();
        if(window.LiveManager) window.LiveManager.init();
        checkDailyStreak();
    }
    
    // UI Setup
    document.querySelectorAll('#open-upload, .add-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#upload-modal').forEach(modal => modal.classList.add('show'));
        });
    });

    document.querySelectorAll('#open-sound-library-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#sound-library-modal').forEach(modal => modal.classList.add('show'));
            if (window.loadOfficialLibrary) window.loadOfficialLibrary();
        });
    });

    document.querySelectorAll('#close-sound-library, .close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetModal = e.target.closest('.modal');
            if (targetModal && targetModal.id === 'sound-library-modal') {
                targetModal.classList.remove('show');
                if (window.soundPreviewPlayer) window.soundPreviewPlayer.pause();
            }
        });
    });

    document.getElementById('sound-offset-slider')?.addEventListener('input', (e) => {
        const val = e.target.value;
        document.getElementById('sound-start-time-display').innerText = `0:${val.padStart(2, '0')}`;
        if (window.selectedLibrarySound) window.selectedLibrarySound.offset = parseInt(val);
        
        window.soundPreviewPlayer.src = window.selectedLibrarySound.url;
        window.soundPreviewPlayer.currentTime = parseInt(val);
        window.soundPreviewPlayer.play().catch(e=>{});
        setTimeout(() => window.soundPreviewPlayer.pause(), 1500);
    });

    document.getElementById('req-song-file')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(file) {
            window.soundRequestFile = file;
            document.getElementById('req-file-status').innerText = "Datei: " + file.name;
        }
    });

    document.getElementById('submit-sound-request')?.addEventListener('click', async () => {
        const title = document.getElementById('req-song-title').value.trim();
        if(!title || !window.soundRequestFile) return showToast("Bitte Titel und Datei angeben!");
        const btn = document.getElementById('submit-sound-request'); btn.disabled = true; btn.innerText = "Lade hoch...";
        try {
            const url = await uploadFileToFirebase(window.soundRequestFile, 'sound_requests');
            await addDoc(collection(db, "sound_requests"), { title, url, senderName: currentUser.displayName, senderUid: currentUser.uid, timestamp: Date.now() });
            showToast("Anfrage gesendet! 👍");
            document.getElementById('sound-library-modal').classList.remove('show');
            window.soundRequestFile = null;
            document.getElementById('req-file-status').innerText = "Keine Datei gewählt";
            document.getElementById('req-song-title').value = '';
        } catch(e) { showToast("Fehler!"); } finally { btn.disabled = false; btn.innerText = "Absenden"; }
    });

    document.getElementById('dm-privacy-select')?.addEventListener('change', (e) => {
        if(currentUser) {
            updateDoc(doc(db, "users", currentUser.uid), { dmPrivacy: e.target.value });
        }
    });

    document.getElementById('app-theme-select')?.addEventListener('change', (e) => { if (e.target.value !== 'default' && !checkPhilPlusStatus(2)) { showCustomAlert("Premium Feature", "App Themes erfordern mindestens Phil Shorts++!");
            e.target.value = 'default'; return; }
        applyAppTheme(e.target.value); if (currentUser) updateDoc(doc(db, "users", currentUser.uid), { appTheme: e.target.value }); });
    document.getElementById('app-icon-select')?.addEventListener('change', (e) => { if (e.target.value !== 'default' && !checkPhilPlusStatus(3)) { showCustomAlert("Premium Feature", "Custom App Icons erfordern Phil Shorts+++!");
            e.target.value = 'default'; return; } if (currentUser) updateDoc(doc(db, "users", currentUser.uid), { appIcon: e.target.value });
        showToast("Icon wird beim nächsten Neuladen aktualisiert."); });
    
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.modal').classList.remove('show');
            window.editingProfileUid = null; 
        });
    });

    document.getElementById('close-settings')?.addEventListener('click', () => {
        document.getElementById('settings-modal').classList.remove('show');
        window.editingProfileUid = null;
    });

    document.getElementById('edit-pic-upload-btn')?.addEventListener('click', () => document.getElementById('edit-pic-file').click());
    document.getElementById('edit-pic-file')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('crop-image-target').src = event.target.result;
                document.getElementById('crop-image-target').style.display = 'block';
                document.getElementById('crop-modal').classList.add('show');
                if(cropperInstance) cropperInstance.destroy();
                
                const image = document.getElementById('crop-image-target');
                cropperInstance = new Cropper(image, {
                    aspectRatio: 1,
                    viewMode: 0, 
                    dragMode: 'move',
                    autoCropArea: 0.8,
                    guides: false,
                    center: false,
                    highlight: false,
                    cropBoxMovable: false,
                    cropBoxResizable: false,
                    toggleDragModeOnDblclick: false,
                    background: false,
                    ready() {
                        const slider = document.getElementById('crop-zoom-slider');
                        const canvasData = cropperInstance.getCanvasData();
                        const containerData = cropperInstance.getContainerData();
                        
                        const cropBoxSize = Math.min(containerData.width, containerData.height) * 0.8;
                        cropperInstance.setCropBoxData({
                            width: cropBoxSize,
                            height: cropBoxSize,
                            left: (containerData.width - cropBoxSize) / 2,
                            top: (containerData.height - cropBoxSize) / 2
                        });

                        window.minCropZoom = (cropBoxSize / Math.max(canvasData.naturalWidth, canvasData.naturalHeight)) * 0.5; 
                        window.maxCropZoom = window.minCropZoom * 8; 
                        
                        const startZoom = cropBoxSize / Math.min(canvasData.naturalWidth, canvasData.naturalHeight);
                        cropperInstance.zoomTo(startZoom);
                        
                        if(slider) {
                            let val = (startZoom - window.minCropZoom) / (window.maxCropZoom - window.minCropZoom);
                            slider.value = Math.max(0, Math.min(1, val));
                        }
                    }
                });
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('crop-zoom-slider')?.addEventListener('input', (e) => {
        if(!cropperInstance || !window.minCropZoom) return;
        const val = parseFloat(e.target.value);
        const zoomRatio = window.minCropZoom + (window.maxCropZoom - window.minCropZoom) * val;
        cropperInstance.zoomTo(zoomRatio);
    });

    document.getElementById('crop-image-target')?.addEventListener('zoom', (e) => {
        if(!window.minCropZoom) return;
        
        if (e.detail.ratio < window.minCropZoom) {
            e.preventDefault();
            cropperInstance.zoomTo(window.minCropZoom);
            return;
        }
        if (e.detail.ratio > window.maxCropZoom) {
            e.preventDefault();
            cropperInstance.zoomTo(window.maxCropZoom);
            return;
        }

        let val = (e.detail.ratio - window.minCropZoom) / (window.maxCropZoom - window.minCropZoom);
        val = Math.max(0, Math.min(1, val));
        const slider = document.getElementById('crop-zoom-slider');
        if(slider) slider.value = val;
    });

    document.getElementById('crop-cancel-btn')?.addEventListener('click', () => {
        document.getElementById('crop-modal').classList.remove('show');
        if(cropperInstance) cropperInstance.destroy();
        document.getElementById('edit-pic-file').value = '';
    });
    document.getElementById('close-crop-modal')?.addEventListener('click', () => {
        document.getElementById('crop-cancel-btn')?.click();
    });

    document.getElementById('crop-save-btn')?.addEventListener('click', () => {
        if(!cropperInstance) return;
        const btn = document.getElementById('crop-save-btn');
        btn.innerText = "Lädt..."; btn.disabled = true;
        
        cropperInstance.getCroppedCanvas({ 
            width: 400, height: 400, imageSmoothingEnabled: true, imageSmoothingQuality: 'high', fillColor: '#000'
        }).toBlob(async (blob) => {
            try {
                const fileToUpload = new File([blob], "avatar.jpg", { type: "image/jpeg" });
                const url = await uploadFileToFirebase(fileToUpload, 'avatars');
                document.getElementById('edit-pic-input').value = url;
                document.getElementById('crop-modal').classList.remove('show');
                showToast("Bild zugeschnitten!");
                document.getElementById('edit-pic-file').value = '';
            } catch(e) { showToast("Fehler beim Upload"); }
            btn.innerText = "Anwenden"; btn.disabled = false;
        }, 'image/jpeg', 0.9);
    });

    // === UPLOAD LOGIC RESTRUCTURED ===
    document.getElementById('up-file')?.addEventListener('change', function(e) {
        const files = e.target.files; 
        const prevContainer = document.getElementById('upload-media-preview-container');
        const vidPrev = document.getElementById('upload-video-preview');
        const imgPrev = document.getElementById('upload-image-preview');
        const musicSystem = document.getElementById('upload-music-system');
        const fileText = document.getElementById('up-file-text');
        
        if (!files || files.length === 0) return; 
        
        if(prevContainer) prevContainer.style.display = 'flex';
        if(musicSystem) musicSystem.style.display = 'block'; 
        
        if (fileText) fileText.innerText = files.length === 1 ? files[0].name + " (Klicken zum Ändern)" : files.length + " Dateien ausgewählt";

        const file = files[0];
        const fileUrl = URL.createObjectURL(file);
        
        if (file.type.startsWith('video/')) { 
            if(imgPrev) imgPrev.style.display = 'none';
            if(vidPrev) {
                vidPrev.style.display = 'block';
                vidPrev.src = fileUrl;
                
                const volSlider = document.getElementById('up-video-vol');
                const muteToggle = document.getElementById('up-mute-original-toggle');
                vidPrev.volume = volSlider ? parseFloat(volSlider.value) : 1;
                vidPrev.muted = muteToggle ? muteToggle.checked : false;
                
                vidPrev.play().catch(err => {
                    vidPrev.muted = true; 
                    vidPrev.play();
                });
            }
        } 
        else { 
            if(vidPrev) { vidPrev.style.display = 'none'; vidPrev.pause(); vidPrev.src = ''; }
            if(imgPrev) { imgPrev.style.display = 'block'; imgPrev.src = fileUrl; }
        }
    });

    document.getElementById('up-video-vol')?.addEventListener('input', (e) => {
        const vol = parseFloat(e.target.value);
        const vidPrev = document.getElementById('upload-video-preview');
        if(vidPrev) vidPrev.volume = vol;
    });

    document.getElementById('up-mute-original-toggle')?.addEventListener('change', (e) => {
        const vidPrev = document.getElementById('upload-video-preview');
        if(vidPrev) vidPrev.muted = e.target.checked;
    });

    const vPrev = document.getElementById('upload-video-preview');
    if(vPrev) {
        vPrev.addEventListener('play', () => { if(window.selectedLibrarySound) window.soundPreviewPlayer.play().catch(e=>{}); });
        vPrev.addEventListener('pause', () => { window.soundPreviewPlayer.pause(); });
        vPrev.addEventListener('seeking', () => { if(window.selectedLibrarySound && window.soundPreviewPlayer.duration) window.soundPreviewPlayer.currentTime = (window.selectedLibrarySound.offset || 0) + vPrev.currentTime; });
    }

    document.getElementById('close-upload')?.addEventListener('click', () => {
        if(vPrev) { vPrev.pause(); vPrev.src = ''; }
        window.soundPreviewPlayer.pause(); window.soundPreviewPlayer.src = '';
        window.removeSelectedMusic();
        document.getElementById('up-file').value = '';
        
        document.getElementById('upload-media-preview-container').style.display = 'none';
        document.getElementById('upload-music-system').style.display = 'none';
        document.getElementById('upload-modal').classList.remove('show');
        
        const fileText = document.getElementById('up-file-text');
        if (fileText) fileText.innerText = "Video oder Bilder auswählen";
    });

    document.getElementById('submit-upload')?.addEventListener('click', async() => {
        const files = document.getElementById('up-file').files; const titleInput = document.getElementById('up-title'); const descInput = document.getElementById('up-desc');
        const titleVal = titleInput ? titleInput.value.trim() : ""; const desc = descInput ? descInput.value.trim() : "";
        if (!files || files.length === 0) return showCustomAlert("Fehlende Daten", "Bitte wähle mindestens eine Datei aus.");
        if (!titleVal || !desc) return showCustomAlert("Fehlende Daten", "Bitte gib einen Titel UND eine Beschreibung ein.");
        
        let maxSize = checkPhilPlusStatus(1) ? 100 * 1024 * 1024 : 30 * 1024 * 1024; let limitText = checkPhilPlusStatus(1) ? "100" : "30";
        for(let i=0; i<files.length; i++) { if(files[i].size > maxSize) return showCustomAlert("Zu groß", `Dateien dürfen maximal ${limitText} MB groß sein!`); }
        
        const btn = document.getElementById('submit-upload'); const status = document.getElementById('upload-status'); 
        const overlay = document.getElementById('video-processing-overlay');
        btn.disabled = true; 
        if(overlay) overlay.style.display = 'flex';
        
        const isSeries = document.getElementById('up-series-toggle') ? document.getElementById('up-series-toggle').checked : false;
        const isMuted = document.getElementById('up-mute-original-toggle')?.checked || false;
        
        try {
            let mediaUrls = [];
            let isVideo = files[0].type.startsWith('video/');
            
            for(let i=0; i<files.length; i++) {
                const url = await uploadFileToFirebase(files[i], isVideo ? 'videos' : 'images');
                mediaUrls.push(url);
            }

            let uploadObj = { 
                soundUrl: window.selectedLibrarySound ? window.selectedLibrarySound.url : (isVideo ? mediaUrls[0] : null),
                soundOffset: window.selectedLibrarySound ? window.selectedLibrarySound.offset : 0,
                videoVolume: parseFloat(document.getElementById('up-video-vol')?.value || 1),
                musicVolume: parseFloat(document.getElementById('up-music-vol')?.value || 1),
                muteOriginal: isMuted,
                soundId: window.selectedLibrarySound ? window.selectedLibrarySound.id : "original",
                soundName: window.selectedLibrarySound ? window.selectedLibrarySound.name : `Originalton - ${currentUser.displayName}`,
                authorUid: currentUser.uid, authorName: currentUser.displayName, authorUsername: currentUser.username, authorPic: currentUser.photoURL, authorVerified: currentUser.verified || false, 
                title: titleVal, description: desc, likedBy: [], gifts: 0, comments: [], views: 0, timestamp: Date.now() 
            };
            
            if(isSeries) uploadObj.seriesId = "series_" + currentUser.uid + "_" + Date.now();
            awardXP(20);

            if (isVideo) {
                await addDoc(collection(db, "videos"), { mediaType: 'video', url: mediaUrls[0], ...uploadObj });
            } else {
                await addDoc(collection(db, "videos"), { mediaType: 'images', urls: mediaUrls, ...uploadObj });
            }
            
            showToast("Erfolgreich veröffentlicht! 🎉"); 
            document.getElementById('close-upload').click(); 
            if(titleInput) titleInput.value = ''; if(descInput) descInput.value = ''; 
            if(document.getElementById('up-series-toggle')) document.getElementById('up-series-toggle').checked = false;
        } catch (e) { showCustomAlert("Upload Fehler", "Fehler beim Upload."); } finally { btn.disabled = false; if(overlay) overlay.style.display = 'none'; }
    });
};

document.getElementById('logout-btn')?.addEventListener('click', () => { localStorage.removeItem('phil_session');
    window.location.reload(); });

async function addNotification(targetUid, type, text, videoId = null) {
    if (!currentUser || targetUid === currentUser.uid) return;
    let targetUser = allKnownUsers.find(u => u.uid === targetUid);
    if (targetUser && targetUser.blockedUsers && targetUser.blockedUsers.includes(currentUser.uid)) return;
    await addDoc(collection(db, "users", targetUid, "notifications"), { fromUid: currentUser.uid, fromName: currentUser.displayName, fromUsername: currentUser.username, fromPic: currentUser.photoURL, type: type, text: text, videoId: videoId, timestamp: Date.now() });
}

// === ULTIMATE ALGORITHM 1:1 ===
function applyAlgorithm(videos, mode) {
    if (mode === 'following') { 
        let followedVids = videos.filter(v => currentUser && currentUser.following && currentUser.following.includes(v.authorUid)); 
        return followedVids.sort((a, b) => b.timestamp - a.timestamp);
    } else {
        const now = Date.now();
        let scoredVids = videos.map(v => {
            let likes = v.likedBy ? v.likedBy.length : 0;
            let comments = v.comments ? v.comments.length : 0;
            let gifts = v.gifts || 0;
            let views = Math.max(v.views || 1, 1);
            let completions = v.completions || 0; 
            let rewatches = v.rewatches || 0; 

            let completionRate = completions / views;
            let retentionScore = (completionRate * 500) + (rewatches * 50);

            let hoursOld = Math.max((now - v.timestamp) / 3600000, 0.1);
            let interactions = likes + comments + (gifts * 5);
            let velocity = interactions / hoursOld;
            let viralMultiplier = velocity > 10 ? 2.5 : 1; 

            let timeDecay = Math.pow(0.8, hoursOld / 12); 

            let sessionBoost = 1;
            if (v.description) {
                let tags = v.description.toLowerCase().match(/#\w+/g) || [];
                tags.forEach(tag => {
                    if (sessionInterests[tag]) sessionBoost += (sessionInterests[tag] * 0.5);
                });
            }

            let creatorBoost = 1;
            if (creatorAffinities[v.authorUid]) {
                creatorBoost += (creatorAffinities[v.authorUid] * 0.2);
            }

            let affinityScore = 1;
            if (currentUser) {
                if (currentUser.following && currentUser.following.includes(v.authorUid)) affinityScore *= 2.0;
                if (viewedVideos.has(v.id)) affinityScore *= 0.1; 
            }

            let qualityBoost = 1;
            let authorData = allKnownUsers.find(u => u.uid === v.authorUid);
            if (authorData) {
                if (authorData.verified) qualityBoost *= 1.2;
                if (authorData.philPlusUntil > now && authorData.philPlusTier >= 2) qualityBoost *= 1.3;
            }

            let fastSkips = v.fastSkips || 0;
            let skipRate = views > 5 ? (fastSkips / views) : 0;
            let skipPenalty = Math.max(0.1, 1 - skipRate); 

            let wildcardBoost = (views < 10 && hoursOld < 24) ? (Math.random() * 500) : 0;

            let totalScore = ((retentionScore + (interactions * 10)) * timeDecay * sessionBoost * creatorBoost * affinityScore * viralMultiplier * qualityBoost * skipPenalty) + wildcardBoost + (Math.random() * 20);

            return { ...v, algoScore: totalScore };
        });

        return scoredVids.sort((a, b) => b.algoScore - a.algoScore);
    }
}

function createAdElement() {
    const div = document.createElement('div');
    div.className = "video dummy-ad-video";
    div.innerHTML = `<div class="video-inner is-paused" style="background: #111; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center;"><i class="fas fa-ad" style="font-size:50px; color:#aaa; margin-bottom: 20px;"></i><h3 style="margin-bottom:10px;">Werbung</h3><p style="color:#888; font-size:14px; max-width:80%;">Hole dir Phil Shorts++ für 100% werbefreien Genuss!</p><button class="profile-action-btn" onclick="document.getElementById('profile-shop-btn').click();" style="margin-top:20px; background:#ffd700; color:black;">Plus++ holen</button></div>`;
    return div;
}

function initLiveDatabase() {
    const initLoader = document.getElementById('initial-loader');
    if (initLoader) initLoader.style.display = 'flex';
    const skelLoader = document.getElementById('skeleton-loader');
    if (skelLoader) skelLoader.style.display = 'block';

    const q = query(collection(db, "videos"), orderBy("timestamp", "desc"), limit(30));
    
    onSnapshot(q, (snapshot) => {
        allVideosData = [];
        let blocked = (currentUser && currentUser.blockedUsers) ? currentUser.blockedUsers : [];
        snapshot.forEach(doc => { const v = { id: doc.id, ...doc.data() }; if (!blocked.includes(v.authorUid)) allVideosData.push(v); });
        allVideosData.reverse();
        if (isInitialLoad) {
            renderFeed(true);
            isInitialLoad = false;
            if (initLoader) initLoader.style.display = 'none';
            if (skelLoader) skelLoader.style.display = 'none';
            const urlParams = new URLSearchParams(window.location.search);
            const sharedVideoId = urlParams.get('video');
            if (sharedVideoId) { window.history.replaceState({}, document.title, window.location.pathname);
                setTimeout(() => jumpToVideo(sharedVideoId), 800); }
        } else {
            snapshot.docChanges().forEach((change) => {
                const vData = { id: change.doc.id, ...change.doc.data() };
                if (blocked.includes(vData.authorUid)) return;
                if (change.type === "added" && !document.querySelector(`.video[data-id="${vData.id}"]`)) {
                    const newVidEl = createVideoElement(vData);
                    if (currentFeedMode === 'foryou' || (currentFeedMode === 'following' && currentUser.following.includes(vData.authorUid))) {
                        const container = document.getElementById('video-container');
                        const loader = container.querySelector('.feed-end-loader');
                        if (loader) container.insertBefore(newVidEl, loader);
                        else container.appendChild(newVidEl);
                        const emptyState = container.querySelector('.empty-state');
                        if (emptyState) emptyState.remove();
                        window.updateGlobalVolumeUI();
                    }
                }
                if (change.type === "modified") {
                    document.querySelectorAll(`.like-btn[data-id="${vData.id}"] .like-count`).forEach(el => el.innerText = vData.likedBy ? vData.likedBy.length : 0);
                    document.querySelectorAll(`.like-btn[data-id="${vData.id}"]`).forEach(btn => { if (currentUser && vData.likedBy && vData.likedBy.includes(currentUser.uid)) btn.classList.add('liked');
                        else btn.classList.remove('liked'); });
                    document.querySelectorAll(`.comment-btn[data-id="${vData.id}"] .comment-count-txt`).forEach(el => el.innerText = vData.comments ? vData.comments.length : 0);
                    document.querySelectorAll(`.gift-btn[data-id="${vData.id}"] .gift-count`).forEach(el => el.innerText = vData.gifts || 0);
                    document.querySelectorAll(`.video[data-id="${vData.id}"] .video__footer .video-desc-preview`).forEach(el => { let rawPreview = (vData.description || "").substring(0, 50); let previewHtml = formatText(rawPreview); if (vData.description && vData.description.length > 50) previewHtml += '... <strong>mehr anzeigen</strong>';
                        el.innerHTML = previewHtml; });
                    document.querySelectorAll(`.video[data-id="${vData.id}"] .video__footer .video-title`).forEach(el => el.innerText = vData.title || 'Ohne Titel');
                    if (window.currentCommentVideoId === vData.id && document.getElementById('comment-modal').classList.contains('show')) renderComments(vData.id);
                    if (document.getElementById('video-details-modal').classList.contains('show') && document.getElementById('detail-title').innerText === (vData.title || 'Ohne Titel')) { document.getElementById('detail-likes').innerHTML = `<i class="fas fa-heart" style="color: #ff0050;"></i> ${vData.likedBy ? vData.likedBy.length : 0}`;
                        document.getElementById('detail-views').innerHTML = `<i class="fas fa-play" style="color: #00f2fe;"></i> ${vData.views || 0}`; }
                }
                if (change.type === "removed") { const vidEl = document.querySelector(`.video[data-id="${vData.id}"]`); if (vidEl) vidEl.remove(); }
            });
            
            if (document.getElementById('view-profile').classList.contains('active')) { 
                const currentProfileUid = document.getElementById('profile-action-btn').dataset.uid; 
                if (currentProfileUid) {
                    const grid = document.getElementById('profile-grid');
                    if (grid.dataset.lastUid !== currentProfileUid || grid.innerHTML === "" || grid.innerHTML.includes('loading-screen')) {
                        grid.dataset.lastUid = currentProfileUid;
                        window.renderProfileGrid(currentProfileUid);
                    }
                }
            }
        }
    }, (error) => { document.getElementById('video-container').innerHTML = '<div class="empty-state"><h3>Netzwerkfehler</h3></div>'; });
}

function renderFeed(reset = false) {
    const container = document.getElementById('video-container');
    if (reset) {
        const oldVids = container.querySelectorAll('.video');
        
        oldVids.forEach(v => {
            const player = v.querySelector('.video__player');
            if(player) {
                player.pause();
                player.src = "";
                player.load();
            }
            v.remove();
        });
        
        const oldLoaders = container.querySelectorAll('.feed-end-loader');
        oldLoaders.forEach(l => l.remove());
        const emptyState = container.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

        sortedFeed = applyAlgorithm(allVideosData, currentFeedMode);
        if (sortedFeed.length === 0) { const emptyTxt = currentFeedMode === 'following' ? 'Folge Creatorn' : 'Feed ist leer'; const emptyIco = currentFeedMode === 'following' ? 'fa-user-plus' : 'fa-video-slash';
            container.innerHTML += `<div class="empty-state"><i class="fas ${emptyIco}"></i><h3>${emptyTxt}</h3></div>`; return; }
        let count = 0;
        sortedFeed.forEach(video => { container.appendChild(createVideoElement(video));
            count++; if (!checkPhilPlusStatus(2) && count % 5 === 0) container.appendChild(createAdElement()); });
        appendLoader(container, true);
    }
}

function appendLoader(container, isEnd) {
    const loader = document.createElement('div');
    loader.className = 'feed-end-loader';
    if (isEnd) { loader.innerHTML = '<i class="fas fa-check-circle"></i><span>Du bist auf dem neuesten Stand</span>';
        loader.classList.add('no-more'); } else { loader.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Prüfe Algorithmus...</span>'; }
    container.appendChild(loader);
}

window.updateGlobalVolumeUI = function() {
    document.querySelectorAll('.video-inner').forEach(container => {
        const v = container.querySelector('.video__player');
        const muteBtn = container.querySelector('.mute-btn');
        const volumeSlider = container.querySelector('.volume-slider');
        if (!muteBtn || !volumeSlider) return; 
        
        const vidId = container.closest('.video').dataset.id;
        const vData = allVideosData.find(x => x.id === vidId);
        
        const audioEl = container.closest('.video').audioEl;
        
        if (v) {
            const postVol = vData && vData.videoVolume !== undefined ? vData.videoVolume : 1;
            const origMuted = vData && vData.muteOriginal ? true : false;
            v.volume = window.globalVolume * postVol; 
            v.muted = window.globalMuted || origMuted;
        }
        
        if(audioEl) { 
            const musicVol = vData && vData.musicVolume !== undefined ? vData.musicVolume : 1;
            audioEl.volume = window.globalVolume * musicVol; 
            audioEl.muted = window.globalMuted; 
        }

        if (window.globalMuted || window.globalVolume == 0) { 
            muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
            volumeSlider.value = 0;
            volumeSlider.style.background = `linear-gradient(to right, #fff 0%, rgba(255, 255, 255, 0.3) 0%)`; 
        } else { 
            if (window.globalVolume < 0.5) muteBtn.innerHTML = '<i class="fas fa-volume-down"></i>';
            else muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
            volumeSlider.value = window.globalVolume;
            volumeSlider.style.background = `linear-gradient(to right, #fff ${window.globalVolume * 100}%, rgba(255, 255, 255, 0.3) ${window.globalVolume * 100}%)`; 
        }
    });
};

window.scrollCarousel = function(vidId, dir, event) { if (event) event.stopPropagation(); const container = document.querySelector(`.carousel-container[data-vid="${vidId}"]`); if (container) { const scrollAmount = container.clientWidth;
        container.scrollBy({ left: dir * scrollAmount, behavior: 'smooth' }); } };

window.openMoreOptions = function(vidId) {
    const video = allVideosData.find(v => v.id === vidId);
    if (!video) return;
    const isMe = currentUser && video.authorUid === currentUser.uid;
    const canDeleteVideo = currentUser && (isMe || currentUser.email === "schleimyverteilung@gmail.com" || currentUser.isAdmin);

    let html = '';
    html += `<div class="more-options-btn" onclick="openDuet('${vidId}'); document.getElementById('more-options-modal').classList.remove('show');"><i class="fas fa-user-friends"></i> Duett starten</div>`;
    if (checkPhilPlusStatus(3)) html += `<div class="more-options-btn" onclick="window.open('${video.mediaType === 'images' ? video.urls[0] : video.url}', '_blank')"><i class="fas fa-download"></i> Video Downloaden</div>`;
    if (isMe && checkPhilPlusStatus(3)) html += `<div class="more-options-btn" onclick="openAnalytics('${vidId}'); document.getElementById('more-options-modal').classList.remove('show');"><i class="fas fa-chart-line"></i> Analytics ansehen</div>`;
    if (isMe) html += `<div class="more-options-btn" onclick="openEditVideo('${vidId}'); document.getElementById('more-options-modal').classList.remove('show');"><i class="fas fa-pen"></i> Bearbeiten</div>`;
    if (canDeleteVideo) html += `<div class="more-options-btn delete" onclick="deleteVideo('${vidId}'); document.getElementById('more-options-modal').classList.remove('show');"><i class="fas fa-trash"></i> Video löschen</div>`;

    document.getElementById('more-options-content').innerHTML = html;
    document.getElementById('more-options-modal').classList.add('show');
};
document.getElementById('close-more-options')?.addEventListener('click', () => document.getElementById('more-options-modal').classList.remove('show'));

function createVideoElement(video) {
    const div = document.createElement('div');
    div.className = "video";
    div.dataset.id = video.id;
    div.dataset.authorUid = video.authorUid;

    const authorData = getUserData(video.authorUid, video.authorName, video.authorUsername || video.authorName, video.authorPic, video.authorVerified);
    const verifiedBadge = getVerifiedBadge(authorData.verified);
    const isMe = currentUser && video.authorUid === currentUser.uid;
    const isFollowing = currentUser && currentUser.following && currentUser.following.includes(video.authorUid);
    const hasSaved = currentUser && currentUser.savedVideos && currentUser.savedVideos.includes(video.id) ? 'saved' : '';
    const hasLiked = video.likedBy && video.likedBy.includes(currentUser.uid) ? 'liked' : '';
    const realLikes = video.likedBy ? video.likedBy.length : 0;
    const commentCount = video.comments ? video.comments.length : 0;
    const giftCount = video.gifts || 0;
    const plusButton = (!isMe) ? `<i class="fas fa-circle-plus follow-btn" data-target="${video.authorUid}" onclick="toggleFollow('${video.authorUid}', this, event)" style="${isFollowing ? 'display: none;' : ''}"></i>` : '';
    
    let tier3Badge = authorData.philPlusUntil > Date.now() && authorData.philPlusTier === 3 ? ' <i class="fas fa-gem" style="color: #00f2fe; font-size: 12px;" title="Plus+++ Legende"></i>' : "";
    let nameClass = (authorData.philPlusUntil > Date.now() && authorData.philPlusTier >= 1) ? "name-phil-plus" : "";
    
    const soundDataId = video.soundId || video.id;
    const soundDataName = video.soundName || `Originalton - ${authorData.displayName}`;
    const soundDataUrl = video.soundUrl || video.url;
    const soundDisc = `<div class="videoSidebar__button sound-disc-wrap" onclick="openSound('${soundDataId}', '${soundDataName.replace(/'/g, "\\'")}', '${authorData.pic}', '${soundDataUrl}')" style="margin-top:15px;"><img src="${authorData.pic}" class="sound-disc"><div class="sound-wave"></div><div class="sound-wave"></div></div>`;

    let mediaHTML = '';
    if (video.mediaType === 'images' && video.urls) {
        mediaHTML = `
            <div class="carousel-container" data-vid="${video.id}">
                ${video.urls.map(u => `<div class="carousel-item"><img src="${u}"></div>`).join('')}
            </div>
            <div class="carousel-dots">${video.urls.map((_, i) => `<div class="dot ${i===0?'active':''}"></div>`).join('')}</div>
            <div class="carousel-arrow left" onclick="window.scrollCarousel('${video.id}', -1, event)"><i class="fas fa-chevron-left"></i></div>
            <div class="carousel-arrow right" onclick="window.scrollCarousel('${video.id}', 1, event)"><i class="fas fa-chevron-right"></i></div>
        `;
    } else {
        mediaHTML = `
            <video class="video__player" data-vid="${video.id}" data-original-src="${video.url}" preload="metadata" loop playsinline src="${video.url}"></video>
            <div class="play-indicator"><i class="fas fa-play"></i></div>
            <div class="player-progress-bar"><div class="player-progress-filled"></div></div>
            <div class="fast-forward-overlay">2x ▶▶</div>
            <div class="seek-ripple left"><div class="seek-arrows"><i class="fas fa-caret-left"></i><i class="fas fa-caret-left"></i><i class="fas fa-caret-left"></i></div><div class="seek-text">5s</div></div>
            <div class="seek-ripple right"><div class="seek-arrows"><i class="fas fa-caret-right"></i><i class="fas fa-caret-right"></i><i class="fas fa-caret-right"></i></div><div class="seek-text">5s</div></div>
        `;
    }

    let rawPreview = (video.description || "").substring(0, 50); let previewHtml = formatText(rawPreview); if ((video.description && video.description.length > 50)) previewHtml += '... <strong>mehr anzeigen</strong>';
    const inlineStyle = getInlineBorderStyle(authorData.activeBorder, authorData.customBorder); const bClass = getBorderClass(authorData.activeBorder);

    let seriesBtnHTML = '';
    if(video.seriesId) {
        const nextPart = allVideosData.find(v => v.seriesId === video.seriesId && v.timestamp > video.timestamp);
        if(nextPart) {
            seriesBtnHTML = `<div class="series-btn" onclick="jumpToVideo('${nextPart.id}'); awardXP(2);"><i class="fas fa-step-forward"></i> Nächster Teil (Serie)</div>`;
        }
    }

    div.innerHTML = `
        <div class="video-inner is-paused">
            <div class="video-wrapper">
                ${mediaHTML}
                <div class="mute-container">
                    <div class="mute-btn"><i class="fas fa-volume-up"></i></div>
                    <div class="volume-slider-wrapper"><input type="range" class="volume-slider" min="0" max="1" step="0.05" value="1"></div>
                </div>
                <div class="like-animation"><i class="fas fa-heart"></i></div>
                <div class="gift-animation" id="gift-anim-${video.id}"></div>
            </div>
            <div class="video__footer">
                <h3 class="creator-name" onclick="openProfile('${video.authorUid}')"><span class="live-name-${video.authorUid} ${nameClass}">${authorData.displayName}${verifiedBadge}${tier3Badge}</span></h3>
                <p class="live-username-${video.authorUid}" style="color:#aaa; font-size:13px; margin-bottom:5px; cursor:pointer;" onclick="openProfile('${video.authorUid}')">@${authorData.username}</p>
                <h4 class="video-title" onclick="openVideoDetails('${video.id}')">${video.title || 'Ohne Titel'}</h4>
                <p class="video-desc-preview" onclick="openVideoDetails('${video.id}')">${previewHtml}</p>
                <div style="font-size:12px; margin-top:8px; display:flex; align-items:center; gap:5px; pointer-events:auto; cursor:pointer;" onclick="openSound('${soundDataId}', '${soundDataName.replace(/'/g, "\\'")}', '${authorData.pic}', '${soundDataUrl}')">
                    <i class="fas fa-music"></i> <marquee scrollamount="3" style="width:120px;">${soundDataName}</marquee>
                </div>
                ${seriesBtnHTML}
            </div>
            <div class="video__sidebar">
                <div class="sidebar__profile" onclick="openProfile('${video.authorUid}')"><img src="${authorData.pic}" class="live-pic-${video.authorUid} ${bClass}" style="${inlineStyle}" alt="Profil">${plusButton}</div>
                <div class="videoSidebar__button like-btn ${hasLiked}" data-id="${video.id}"><i class="fas fa-heart"></i><p class="like-count">${realLikes}</p></div>
                <div class="videoSidebar__button comment-btn" data-id="${video.id}"><i class="fas fa-comment-dots"></i><p class="comment-count-txt">${commentCount}</p></div>
                <div class="videoSidebar__button gift-btn" data-id="${video.id}"><i class="fas fa-gift"></i><p class="gift-count">${giftCount}</p></div>
                <div class="videoSidebar__button bookmark-btn ${hasSaved}" data-id="${video.id}" onclick="toggleSaveVideo('${video.id}', this)"><i class="fas fa-bookmark"></i><p>Speichern</p></div>
                <div class="videoSidebar__button share-btn" data-id="${video.id}"><i class="fas fa-share"></i><p>Teilen</p></div>
                <div class="videoSidebar__button" onclick="openMoreOptions('${video.id}')"><i class="fas fa-ellipsis-h" style="font-size:24px;"></i><p>Mehr</p></div>
                ${soundDisc}
            </div>
        </div>`;

    if (video.soundUrl) {
        const audioEl = new Audio(video.soundUrl);
        audioEl.loop = true;
        div.audioEl = audioEl;
        const v = div.querySelector('.video__player');
        
        const startSyncPlayback = () => {
            audioEl.currentTime = (video.soundOffset || 0) + (v ? v.currentTime : 0);
            audioEl.volume = window.globalVolume * (video.musicVolume !== undefined ? video.musicVolume : 1);
            audioEl.muted = window.globalMuted;
            audioEl.play().catch(()=>{});
            if(v) {
                v.volume = window.globalVolume * (video.videoVolume !== undefined ? video.videoVolume : 1);
                v.muted = window.globalMuted || video.muteOriginal;
                v.play().catch(()=>{});
            }
        };

        if(v) {
            v.addEventListener('play', startSyncPlayback);
            v.addEventListener('pause', () => audioEl.pause());
            v.addEventListener('seeking', () => audioEl.currentTime = (video.soundOffset || 0) + v.currentTime);
        } 
    } else {
        const v = div.querySelector('.video__player');
        if(v) {
            v.addEventListener('play', () => {
                v.volume = window.globalVolume * (video.videoVolume !== undefined ? video.videoVolume : 1);
                v.muted = window.globalMuted || (video.muteOriginal ? true : false);
            });
        }
    }

    const vidEl = div.querySelector('.video__player');
    if (vidEl) {
        vidEl.addEventListener('loadedmetadata', () => {
            const ratio = vidEl.videoWidth / vidEl.videoHeight;
            if (ratio > 0.57) { 
                if (window.innerWidth > 768) {
                    const wrapper = div.querySelector('.video-wrapper');
                    if (wrapper) {
                        let newWidth = Math.min(52, 45 + (ratio * 4)); 
                        wrapper.style.minWidth = newWidth + 'vh';
                        wrapper.style.maxWidth = 'calc(100% - 390px)';
                    }
                } else {
                    vidEl.style.objectFit = 'contain';
                    vidEl.style.transform = 'scale(1.05)'; 
                }
            }
        });
    }

    attachInteractionsToVideo(div); return div;
}

window.toggleSaveVideo = async function(videoId, btnEl) {
    if (!currentUser) return showCustomAlert("Fehler", "Bitte logge dich ein."); const isSaved = currentUser.savedVideos.includes(videoId);
    try {
        if(isSaved) { currentUser.savedVideos = currentUser.savedVideos.filter(id => id !== videoId); btnEl.classList.remove('saved'); await updateDoc(doc(db, "users", currentUser.uid), { savedVideos: arrayRemove(videoId) }); showToast("Aus Favoriten entfernt."); } 
        else { currentUser.savedVideos.push(videoId); btnEl.classList.add('saved'); await updateDoc(doc(db, "users", currentUser.uid), { savedVideos: arrayUnion(videoId) }); showToast("Zu Favoriten hinzugefügt 📌"); }
        localStorage.setItem('phil_session', JSON.stringify(currentUser));
        if(document.getElementById('view-profile').classList.contains('active') && window.currentProfileTab === 'saved') renderProfileGrid(currentUser.uid);
    } catch(e) { showCustomAlert("Fehler", "Konnte nicht gespeichert werden."); }
};

window.openAnalytics = function(id) {
    const video = allVideosData.find(v => v.id === id); if(!video) return;
    document.getElementById('analytics-title').innerText = video.title || 'Analytics'; document.getElementById('analytics-views').innerText = video.views || 0; document.getElementById('analytics-likes').innerText = video.likedBy ? video.likedBy.length : 0; document.getElementById('analytics-gifts').innerText = video.gifts || 0;
    let views = video.views || 1; let eng = ((video.likedBy ? video.likedBy.length : 0) + (video.comments ? video.comments.length : 0)) / views * 100; document.getElementById('analytics-engagement').innerText = eng.toFixed(1) + '%'; document.getElementById('analytics-modal').classList.add('show');
}
window.openVideoDetails = function(id) {
    const video = allVideosData.find(v => v.id === id); if (!video) return;
    document.getElementById('detail-title').innerText = video.title || 'Ohne Titel'; document.getElementById('detail-likes').innerHTML = `<i class="fas fa-heart" style="color: #ff0050;"></i> ${video.likedBy ? video.likedBy.length : 0}`; document.getElementById('detail-views').innerHTML = `<i class="fas fa-play" style="color: #00f2fe;"></i> ${video.views || 0}`; document.getElementById('detail-date').innerHTML = `<i class="fas fa-calendar" style="color: #ffd700;"></i> ${video.timestamp ? timeAgo(video.timestamp) : 'Unbekannt'}`; document.getElementById('detail-desc').innerHTML = formatText(video.description || ''); document.getElementById('video-details-modal').classList.add('show');
}
document.getElementById('close-details')?.addEventListener('click', () => document.getElementById('video-details-modal').classList.remove('show'));
window.openEditVideo = function(videoId) { const video = allVideosData.find(v => v.id === videoId); if (video) { window.currentEditVideoId = videoId; document.getElementById('edit-video-title').value = video.title || ""; document.getElementById('edit-video-desc').value = video.description || ""; document.getElementById('edit-video-modal').classList.add('show'); } };
document.getElementById('save-video-edit-btn')?.addEventListener('click', async() => { const newTitle = document.getElementById('edit-video-title').value.trim(); const newDesc = document.getElementById('edit-video-desc').value.trim(); if (!window.currentEditVideoId || (!newDesc && !newTitle)) return; try { document.getElementById('edit-video-modal').classList.remove('show'); showToast("Video aktualisiert!"); await updateDoc(doc(db, "videos", window.currentEditVideoId), { title: newTitle, description: newDesc }); } catch (e) { showCustomAlert("Fehler", "Speichern fehlgeschlagen."); } });
document.getElementById('close-edit-video')?.addEventListener('click', () => document.getElementById('edit-video-modal').classList.remove('show'));

document.getElementById('tab-foryou')?.addEventListener('click', function() { document.getElementById('tab-following').classList.remove('active'); this.classList.add('active'); currentFeedMode = 'foryou'; renderFeed(true); });
document.getElementById('tab-following')?.addEventListener('click', function() { document.getElementById('tab-foryou').classList.remove('active'); this.classList.add('active'); currentFeedMode = 'following'; renderFeed(true); });

const videoContainer = document.getElementById('video-container');
videoContainer?.addEventListener('scroll', () => { if (videoContainer.scrollTop + videoContainer.clientHeight >= videoContainer.scrollHeight - 20) { setTimeout(() => { const vids = document.querySelectorAll('.video:not(.dummy-ad-video)'); if (vids.length) vids[vids.length - 1].scrollIntoView({ behavior: 'smooth' }); }, 800); } });
window.addEventListener('keydown', (e) => { if (document.getElementById('view-feed').classList.contains('active')) { if (e.key === 'ArrowDown') { e.preventDefault(); videoContainer.scrollBy({ top: videoContainer.clientHeight, behavior: 'smooth' }); } else if (e.key === 'ArrowUp') { e.preventDefault(); videoContainer.scrollBy({ top: -videoContainer.clientHeight, behavior: 'smooth' }); } } });

let scrollTimeout = null;
videoContainer?.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; e.preventDefault(); if (scrollTimeout) return;
    if (e.deltaY > 0) { const vids = document.querySelectorAll('.video'); if (vids.length === 0) return; const lastVid = vids[vids.length - 1]; const rect = lastVid.getBoundingClientRect(); const containerRect = videoContainer.getBoundingClientRect(); if (rect.top <= containerRect.top + 10 && rect.bottom >= containerRect.bottom - 10) { videoContainer.scrollBy({ top: videoContainer.clientHeight * 0.15, behavior: 'smooth' }); setTimeout(() => { lastVid.scrollIntoView({ behavior: 'smooth' }); }, 800); } else { videoContainer.scrollBy({ top: videoContainer.clientHeight, behavior: 'smooth' }); } } else if (e.deltaY < 0) { videoContainer.scrollBy({ top: -videoContainer.clientHeight, behavior: 'smooth' }); }
    scrollTimeout = setTimeout(() => { scrollTimeout = null; }, 600);
}, { passive: false });

const videoObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
        const el = e.target; const vidId = el.dataset.id;
        const videoPlayer = el.querySelector('.video__player');
        const containerInner = el.querySelector('.video-inner');

        if (e.isIntersecting && document.getElementById('view-feed').classList.contains('active')) {
            if(el.classList.contains('dummy-ad-video')) return; 
            
            if(videoPlayer && !videoPlayer.src) {
                videoPlayer.src = videoPlayer.dataset.originalSrc;
            }
            
            el.dataset.playStartTime = Date.now();

            if (vidId && !viewedVideos.has(vidId)) { viewedVideos.add(vidId); awardXP(2); updateDoc(doc(db, "videos", vidId), { views: increment(1) }).catch(() => {}); }
            
            if (videoPlayer) { 
                document.querySelectorAll('.video__player').forEach(otherVid => { if (otherVid !== videoPlayer && !otherVid.paused) { otherVid.pause(); } }); 
                videoPlayer.muted = window.globalMuted; 
                const playPromise = videoPlayer.play(); 
                if (playPromise !== undefined) { 
                    playPromise.then(() => {
                        const soundWrap = el.querySelector('.sound-disc-wrap');
                        if(soundWrap) soundWrap.classList.add('is-playing');
                    }).catch(error => { 
                        videoPlayer.pause(); if(containerInner) containerInner.classList.add('is-paused'); 
                    }); 
                } 
            } else if (el.audioEl) {
                el.audioEl.currentTime = el.audioEl.dataset.offset || 0;
                el.audioEl.play().catch(err=>{});
                const soundWrap = el.querySelector('.sound-disc-wrap');
                if(soundWrap) soundWrap.classList.add('is-playing');
            }
        } else { 
            if(el.dataset.playStartTime) {
                let playedTime = Date.now() - Number(el.dataset.playStartTime);
                if (playedTime > 100 && playedTime < 2500 && vidId) {
                    updateDoc(doc(db, "videos", vidId), { fastSkips: increment(1) }).catch(()=>{});
                }
                el.dataset.playStartTime = "";
            }

            if (videoPlayer) { 
                videoPlayer.pause(); 
                videoPlayer.removeAttribute('src'); 
                videoPlayer.load();
                
                const soundWrap = el.querySelector('.sound-disc-wrap');
                if(soundWrap) soundWrap.classList.remove('is-playing');
            } else if (el.audioEl) {
                el.audioEl.pause();
                const soundWrap = el.querySelector('.sound-disc-wrap');
                if(soundWrap) soundWrap.classList.remove('is-playing');
            }
        }
    });
}, { threshold: 0.6 });

const SUBSCRIPTION_PRICES = {
    1: { 5: 5000, 14: 12000, 30: 25000 },
    2: { 5: 15000, 14: 35000, 30: 70000 },
    3: { 5: 40000, 14: 90000, 30: 180000 }
};

const allGifts = [ { id: 'g1', name: 'Rose', emoji: '🌹', price: 1 }, { id: 'g2', name: 'Kaffee', emoji: '☕', price: 1 }, { id: 'g3', name: 'Herz', emoji: '❤️', price: 5 }, { id: 'g4', name: 'GG', emoji: '🎮', price: 5 }, { id: 'g5', name: 'Mini 3663', emoji: '🧊', price: 10 }, { id: 'g6', name: 'Flamme', emoji: '🔥', price: 10 }, { id: 'g7', name: 'Applaus', emoji: '👏', price: 15 }, { id: 'g8', name: 'Brille', emoji: '🕶️', price: 20 }, { id: 'g9', name: 'Party', emoji: '🎉', price: 20 }, { id: 'g10', name: 'Flex', emoji: '💪', price: 50 }, { id: 'g11', name: '3663 Schild', emoji: '🛡️', price: 50 }, { id: 'g12', name: 'Diamant', emoji: '💎', price: 100 }, { id: 'g13', name: '3663 Krone', emoji: '👑', price: 100 }, { id: 'g14', name: 'Rakete', emoji: '🚀', price: 200 }, { id: 'g15', name: '3663 Kette', emoji: '⛓️', price: 250 }, { id: 'g16', name: 'Löwe', emoji: '🦁', price: 500 }, { id: 'g17', name: '3663 Auto', emoji: '🏎️', price: 500 }, { id: 'g18', name: 'Universum', emoji: '🌌', price: 1000, reqTier: 2 }, { id: 'g19', name: '3663 Villa', emoji: '🏰', price: 1000, reqTier: 2 }, { id: 'g20', name: '3663 Legende', emoji: '🦅', price: 5000, reqTier: 2 }, { id: 'g21', name: 'TRICHTER', emoji: '🌪️', price: 10000, reqTier: 3 } ];

window.openGiftModal = function(contextId) {
    if (!currentUser) return showCustomAlert("Fehler", "Bitte logge dich ein.");
    window.currentGiftContextId = contextId; 
    window.isGiftingLive = document.getElementById('view-live-room').classList.contains('active');
    document.getElementById('gift-modal-coins').innerText = currentUser.coins || 0;
    const grid = document.getElementById('gift-grid'); 
    grid.innerHTML = allGifts.map(g => { if(g.reqTier && !checkPhilPlusStatus(g.reqTier)) { return `<div class="gift-card" style="opacity:0.3; cursor:not-allowed;" onclick="showCustomAlert('Plus++ erforderlich', 'Exklusiv für Phil Shorts++ User!')"><span class="gift-emoji">${g.emoji}</span><span class="gift-name">${g.name}</span><span class="gift-price"><i class="fas fa-lock"></i> Plus++</span></div>`; } return `<div class="gift-card" onclick="sendSpecificGift('${g.id}', ${g.price}, '${g.emoji}', '${g.name}')"><span class="gift-emoji">${g.emoji}</span><span class="gift-name">${g.name}</span><span class="gift-price"><i class="fas fa-coins"></i> ${g.price}</span></div>`; }).join('');
    document.getElementById('gift-modal').classList.add('show');
};
document.getElementById('close-gift-modal')?.addEventListener('click', () => document.getElementById('gift-modal').classList.remove('show'));

window.sendSpecificGift = async function(giftId, price, emoji, name) {
    if (!currentUser || !window.currentGiftContextId) return; 
    if (currentUser.coins < price) return showCustomAlert("Zu wenig Coins", "Du hast nicht genug Coins.");
    
    document.getElementById('gift-modal').classList.remove('show'); 
    currentUser.coins -= price; 
    triggerHaptic('heavy'); 

    const myCoinsEl = document.getElementById('my-coins'); if (myCoinsEl) myCoinsEl.innerText = currentUser.coins;
    
    if (window.isGiftingLive) {
        const streamId = window.currentGiftContextId;
        try {
            await updateDoc(doc(db, "users", currentUser.uid), { coins: increment(-price) }); 
            await updateDoc(doc(db, "users", streamId), { coins: increment(price) }); 
            await updateDoc(doc(db, "live_streams", streamId), { goalCurrent: increment(price) }).catch(()=>{});
            await addDoc(collection(db, `live_streams/${streamId}/gifts`), { uid: currentUser.uid, name: currentUser.displayName, emoji: emoji, giftName: name, price: price, timestamp: Date.now() });
        } catch (err) {}
    } else {
        const videoId = window.currentGiftContextId;
        const targetVidData = allVideosData.find(vd => vd.id === videoId); if (!targetVidData || !targetVidData.authorUid) return showToast("Fehler beim Spenden!");
        document.querySelectorAll(`.gift-btn[data-id="${videoId}"] .gift-count`).forEach(el => { let currentGifts = Number(el.innerText) || 0; el.innerText = currentGifts + price; });
        const anim = document.getElementById(`gift-anim-${videoId}`); if(anim) { anim.innerHTML = `${emoji}<span class="gift-animation-name">${name}</span>`; anim.style.animation = 'none'; void anim.offsetWidth; anim.style.animation = 'flyUpGift 2s ease-out forwards'; }
        showToast(`${name} gesendet! 🎁`);
        try { await updateDoc(doc(db, "users", currentUser.uid), { coins: increment(-price) }); await updateDoc(doc(db, "videos", videoId), { gifts: increment(price) }); await updateDoc(doc(db, "users", targetVidData.authorUid), { coins: increment(price) }); addNotification(targetVidData.authorUid, "gift", `hat dir ein ${name} ${emoji} gesendet!`, videoId); } catch (err) {}
    }
};

let sessionViewData = {};

function attachInteractionsToVideo(videoContainerEl) {
    const v = videoContainerEl.querySelector('.video__player'); const c = videoContainerEl.querySelector('.carousel-container'); const container = videoContainerEl.querySelector('.video-inner'); videoObserver.observe(videoContainerEl); 
    const vidId = videoContainerEl.dataset.id;
    const targetVidData = allVideosData.find(vd => vd.id === vidId); 

    let lastTap = 0;
    
    const handleDoubleTap = (e) => { 
        const tapLength = new Date().getTime() - lastTap; 
        if (tapLength < 300 && tapLength > 0) { 
            const rect = v ? v.getBoundingClientRect() : c.getBoundingClientRect();
            const x = e.clientX || (e.changedTouches ? e.changedTouches[0].clientX : 0);
            const y = e.clientY || (e.changedTouches ? e.changedTouches[0].clientY : 0);
            const relX = x - rect.left;
            
            if (v && relX > rect.width * 0.7) {
                v.currentTime = Math.min(v.duration, v.currentTime + 5);
                const ripple = container.querySelector('.seek-ripple.right');
                if(ripple) { ripple.classList.remove('active'); void ripple.offsetWidth; ripple.classList.add('active'); }
                triggerHaptic('light');
            } else if (v && relX < rect.width * 0.3) {
                v.currentTime = Math.max(0, v.currentTime - 5);
                const ripple = container.querySelector('.seek-ripple.left');
                if(ripple) { ripple.classList.remove('active'); void ripple.offsetWidth; ripple.classList.add('active'); }
                triggerHaptic('light');
            } else {
                const likeBtn = container.querySelector('.like-btn'); 
                if (!likeBtn.classList.contains('liked')) { likeBtn.click(); } 
                const anim = container.querySelector('.like-animation'); 
                anim.style.animation = 'none'; setTimeout(() => anim.style.animation = 'doubleTapHeart 0.8s ease-out forwards', 10); 
                createParticles(x, y, document.body);
            }
            e.preventDefault(); lastTap = 0; return true; 
        } 
        lastTap = new Date().getTime(); return false; 
    };

    if (v) {
        v.addEventListener('play', () => {
            container.classList.remove('is-paused');
            const soundWrap = container.querySelector('.sound-disc-wrap');
            if(soundWrap) soundWrap.classList.add('is-playing');
        }); 
        v.addEventListener('pause', () => {
            container.classList.add('is-paused');
            const soundWrap = container.querySelector('.sound-disc-wrap');
            if(soundWrap) soundWrap.classList.remove('is-playing');
        });
        v.addEventListener('click', (e) => { if (handleDoubleTap(e)) return; if (v.paused) { document.querySelectorAll('.video__player').forEach(vid => { if (vid !== v && !vid.paused) vid.pause(); }); window.globalMuted = false; v.muted = window.globalMuted; window.updateGlobalVolumeUI(); v.play().catch(err=>{}); } else { v.pause(); } });
        
        let hasCompleted = false;
        v.addEventListener('timeupdate', () => { 
            const prog = container.querySelector('.player-progress-filled'); 
            if(prog) prog.style.width = (v.currentTime / v.duration * 100) + '%'; 

            if(v.currentTime >= v.duration * 0.9 && !hasCompleted) {
                hasCompleted = true;
                if(targetVidData && targetVidData.authorUid) {
                    creatorAffinities[targetVidData.authorUid] = (creatorAffinities[targetVidData.authorUid] || 0) + 1;
                }
                updateDoc(doc(db, "videos", vidId), { completions: increment(1) }).catch(()=>{});
            }
            if(v.currentTime < v.duration * 0.5 && hasCompleted) {
                hasCompleted = false;
                updateDoc(doc(db, "videos", vidId), { rewatches: increment(1) }).catch(()=>{});
            }
        });
        
        let holdTimer;
        const startHold = () => { holdTimer = setTimeout(() => { v.playbackRate = 2.0; const overlay = container.querySelector('.fast-forward-overlay'); if(overlay) overlay.classList.add('active'); triggerHaptic('heavy'); }, 500); };
        const endHold = () => { clearTimeout(holdTimer); v.playbackRate = 1.0; const overlay = container.querySelector('.fast-forward-overlay'); if(overlay) overlay.classList.remove('active'); };
        v.addEventListener('mousedown', startHold); v.addEventListener('touchstart', startHold);
        v.addEventListener('mouseup', endHold); v.addEventListener('mouseleave', endHold); v.addEventListener('touchend', endHold);

        const muteContainer = container.querySelector('.mute-container'); const muteBtn = container.querySelector('.mute-btn'); const volumeSlider = container.querySelector('.volume-slider'); window.updateGlobalVolumeUI();
        if (muteBtn) { muteBtn.addEventListener('click', (e) => { e.stopPropagation(); window.globalMuted = !window.globalMuted; if (!window.globalMuted && window.globalVolume == 0) window.globalVolume = 1; window.updateGlobalVolumeUI(); }); }
        if (volumeSlider) { volumeSlider.addEventListener('input', (e) => { e.stopPropagation(); window.globalMuted = false; window.globalVolume = e.target.value; window.updateGlobalVolumeUI(); }); volumeSlider.addEventListener('mousedown', (e) => { e.stopPropagation(); muteContainer.classList.add('active-slider'); }); volumeSlider.addEventListener('touchstart', (e) => { e.stopPropagation(); muteContainer.classList.add('active-slider'); }, { passive: false }); }
    } else if (c) {
        container.classList.remove('is-paused'); c.addEventListener('click', (e) => handleDoubleTap(e));
        c.addEventListener('scroll', () => { const idx = Math.round(c.scrollLeft / c.clientWidth); const dots = videoContainerEl.querySelectorAll('.dot'); dots.forEach((d, i) => { if (i === idx) d.active = true; else d.classList.remove('active'); }); });
    }

    let touchStartX = 0;
    container.addEventListener('touchstart', e => touchStartX = e.changedTouches[0].screenX, {passive: true});
    container.addEventListener('touchend', e => {
        if (touchStartX - e.changedTouches[0].screenX > 100) {
            const viewProfile = document.getElementById('view-profile');
            viewProfile.classList.add('profile-slide-in');
            openProfile(videoContainerEl.dataset.authorUid);
            setTimeout(() => viewProfile.classList.add('active-slide'), 10);
        }
    }, {passive: true});

    document.addEventListener('mouseup', () => document.querySelectorAll('.mute-container').forEach(mc => mc.classList.remove('active-slider'))); document.addEventListener('touchend', () => document.querySelectorAll('.mute-container').forEach(mc => mc.classList.remove('active-slider')));
    const mc = container.querySelector('.mute-container'); if (mc) mc.addEventListener('click', (e) => e.stopPropagation());
    
    container.querySelector('.like-btn')?.addEventListener('click', async(e) => { 
        triggerHaptic('heavy'); const btn = e.currentTarget; const id = btn.dataset.id; const isLiked = btn.classList.contains('liked'); 
        document.querySelectorAll(`.like-btn[data-id="${id}"]`).forEach(el => { const countEl = el.querySelector('.like-count'); let currentLikes = Number(countEl.innerText) || 0; if (isLiked) { el.classList.remove('liked'); countEl.innerText = Math.max(0, currentLikes - 1); } else { el.classList.add('liked'); countEl.innerText = currentLikes + 1; } }); 
        if (isLiked) {
            await updateDoc(doc(db, "videos", id), { likedBy: arrayRemove(currentUser.uid) }); 
        } else { 
            const rect = btn.getBoundingClientRect();
            createParticles(rect.left + rect.width/2, rect.top + rect.height/2, document.body);
            btn.classList.add('micro-pop'); setTimeout(()=>btn.classList.remove('micro-pop'),300); awardXP(1); 
            
            if(targetVidData && targetVidData.description) {
                let tags = targetVidData.description.toLowerCase().match(/#\w+/g) || [];
                tags.forEach(tag => { sessionInterests[tag] = (sessionInterests[tag] || 0) + 1; });
            }

            await updateDoc(doc(db, "videos", id), { likedBy: arrayUnion(currentUser.uid) }); if (targetVidData) addNotification(targetVidData.authorUid, "like", "hat dein Post geliket.", id); 
        } 
    });
    
    container.querySelector('.comment-btn')?.addEventListener('click', (e) => { window.currentCommentVideoId = e.currentTarget.dataset.id; renderComments(window.currentCommentVideoId); document.getElementById('comment-modal').classList.add('show'); });
    container.querySelector('.gift-btn')?.addEventListener('click', (e) => { window.openGiftModal(e.currentTarget.dataset.id); });
    container.querySelector('.share-btn')?.addEventListener('click', async(e) => { const vidId = e.currentTarget.dataset.id; const shareUrl = `${window.location.origin}${window.location.pathname}?video=${vidId}`; if (navigator.share) { try { await navigator.share({ title: 'Phil Shorts', text: 'Schau dir dieses an!', url: shareUrl }); } catch (err) {} } else { navigator.clipboard.writeText(shareUrl); showToast("Link kopiert!"); } });
}

window.deleteVideo = async function(videoId) { if (confirm("Möchtest du diesen Post wirklich endgültig löschen?")) { try { await deleteDoc(doc(db, "videos", videoId)); showToast("Post erfolgreich gelöscht! 🗑️"); if (document.getElementById('view-profile').classList.contains('active')) openProfile(document.getElementById('profile-action-btn').dataset.uid); } catch (e) { showCustomAlert("Fehler", "Konnte nicht gelöscht werden."); } } };

window.toggleCreatorHeart = async function(videoId, cId, rId = null) {
    if (!currentUser) return; const videoIndex = allVideosData.findIndex(v => v.id === videoId); if (videoIndex === -1) return; const video = allVideosData[videoIndex]; if (currentUser.uid !== video.authorUid) return;
    let comments = video.comments || []; const cIndex = comments.findIndex(c => c.cId === cId || c.cId === cId.toString()); if (cIndex === -1) return;
    if (rId) { if (comments[cIndex].replies) { const rIndex = comments[cIndex].replies.findIndex(r => r.rId === rId); if (rIndex > -1) { const currentState = comments[cIndex].replies[rIndex].creatorHeart || false; comments[cIndex].replies[rIndex].creatorHeart = !currentState; renderComments(videoId); await updateDoc(doc(db, "videos", videoId), { comments: comments }); if (!currentState && comments[cIndex].replies[rIndex].uid !== currentUser.uid) addNotification(comments[cIndex].replies[rIndex].uid, "like", "hat deiner Antwort ein Creator-Herz gegeben! ❤️", videoId); } } } 
    else { const currentState = comments[cIndex].creatorHeart || false; comments[cIndex].creatorHeart = !currentState; renderComments(videoId); await updateDoc(doc(db, "videos", videoId), { comments: comments }); if (!currentState && comments[cIndex].uid !== currentUser.uid) addNotification(comments[cIndex].uid, "like", "hat deinem Kommentar ein Creator-Herz gegeben! ❤️", videoId); }
};

window.pinComment = async function(videoId, cId) {
    if (!currentUser) return; const videoIndex = allVideosData.findIndex(v => v.id === videoId); if (videoIndex === -1) return; const video = allVideosData[videoIndex]; if (currentUser.uid !== video.authorUid || !checkPhilPlusStatus(3)) return;
    let comments = video.comments || []; const cIndex = comments.findIndex(c => c.cId === cId || c.cId === cId.toString()); if (cIndex === -1) return;
    const currentState = comments[cIndex].pinned || false; comments.forEach(c => c.pinned = false); comments[cIndex].pinned = !currentState; renderComments(videoId); await updateDoc(doc(db, "videos", videoId), { comments: comments }); showToast(!currentState ? "Kommentar angeheftet!" : "Kommentar gelöst.");
};

window.translateComment = function(btnEl, cId) { if(!checkPhilPlusStatus(3)) { showCustomAlert("Premium", "Diese Funktion erfordert Phil Shorts+++!"); return; } const textEl = document.getElementById(`comment-text-${cId}`); if(textEl) { textEl.innerText = "[Übersetzt] " + textEl.innerText; btnEl.style.display = 'none'; showToast("Erfolgreich übersetzt."); } };
window.toggleReplyBox = function(cId) { const box = document.getElementById(`reply-box-${cId}`); if (box) box.style.display = box.style.display === 'none' ? 'flex' : 'none'; };

window.submitReply = async function(videoId, cId) {
    if (!currentUser) return; const input = document.getElementById(`reply-input-${cId}`); const text = input.value.trim(); if (!text) return;
    const replyId = Date.now().toString(); const reply = { rId: replyId, uid: currentUser.uid, name: currentUser.displayName, username: currentUser.username, pic: currentUser.photoURL, verified: currentUser.verified || false, text: text, likes: [] };
    const videoIndex = allVideosData.findIndex(v => v.id === videoId); if (videoIndex > -1) { const comments = allVideosData[videoIndex].comments || []; const cIndex = comments.findIndex((c, idx) => c.cId === cId || idx.toString() === cId); if (cIndex > -1) { if (!comments[cIndex].replies) comments[cIndex].replies = []; comments[cIndex].replies.push(reply); renderComments(videoId); await updateDoc(doc(db, "videos", videoId), { comments: comments }); if (comments[cIndex].uid !== currentUser.uid) addNotification(comments[cIndex].uid, "comment", `hat auf deinen Kommentar geantwortet: "${text}"`, videoId); } }
};

window.likeComment = async function(videoId, cId) { if (!currentUser) return; const videoIndex = allVideosData.findIndex(v => v.id === videoId); if (videoIndex > -1) { const comments = allVideosData[videoIndex].comments || []; const cIndex = comments.findIndex((c, idx) => c.cId === cId || idx.toString() === cId); if (cIndex > -1) { if (!comments[cIndex].likes) comments[cIndex].likes = []; const userIdx = comments[cIndex].likes.indexOf(currentUser.uid); if (userIdx > -1) comments[cIndex].likes.splice(userIdx, 1); else comments[cIndex].likes.push(currentUser.uid); renderComments(videoId); await updateDoc(doc(db, "videos", videoId), { comments: comments }); } } };
window.likeReply = async function(videoId, cId, rId) { if (!currentUser) return; const videoIndex = allVideosData.findIndex(v => v.id === videoId); if (videoIndex > -1) { const comments = allVideosData[videoIndex].comments || []; const cIndex = comments.findIndex((c, idx) => c.cId === cId || idx.toString() === cId); if (cIndex > -1 && comments[cIndex].replies) { const rIndex = comments[cIndex].replies.findIndex(r => r.rId === rId); if (rIndex > -1) { if (!comments[cIndex].replies[rIndex].likes) comments[cIndex].replies[rIndex].likes = []; const userIdx = comments[cIndex].replies[rIndex].likes.indexOf(currentUser.uid); if (userIdx > -1) comments[cIndex].replies[rIndex].likes.splice(userIdx, 1); else comments[cIndex].replies[rIndex].likes.push(currentUser.uid); renderComments(videoId); await updateDoc(doc(db, "videos", videoId), { comments: comments }); } } } };
window.deleteComment = async function(videoId, cId) { if (confirm("Möchtest du diesen Kommentar löschen?")) { try { const videoRef = doc(db, "videos", videoId); const videoIndex = allVideosData.findIndex(v => v.id === videoId); if (videoIndex > -1) { let comments = allVideosData[videoIndex].comments || []; const cIndex = comments.findIndex((c, idx) => c.cId === cId || idx.toString() === cId); if (cIndex > -1) { comments.splice(cIndex, 1); allVideosData[videoIndex].comments = comments; renderComments(videoId); document.querySelectorAll(`.comment-btn[data-id="${videoId}"] .comment-count-txt`).forEach(el => el.innerText = comments.length); await updateDoc(videoRef, { comments: comments }); showToast("Kommentar gelöscht!"); } } } catch (e) {} } };
window.deleteReply = async function(videoId, cId, rId) { if (confirm("Möchtest du diese Antwort löschen?")) { try { const videoRef = doc(db, "videos", videoId); const videoIndex = allVideosData.findIndex(v => v.id === videoId); if (videoIndex > -1) { let comments = allVideosData[videoIndex].comments || []; const cIndex = comments.findIndex((c, idx) => c.cId === cId || idx.toString() === cId); if (cIndex > -1 && comments[cIndex].replies) { const rIndex = comments[cIndex].replies.findIndex(r => r.rId === rId); if (rIndex > -1) { comments[cIndex].replies.splice(rIndex, 1); renderComments(videoId); await updateDoc(videoRef, { comments: comments }); showToast("Antwort gelöscht!"); } } } } catch (e) {} } };

window.startCommentReplyVideo = function(videoId, commentId) {
    document.getElementById('comment-modal').classList.remove('show');
    const v = allVideosData.find(x => x.id === videoId);
    const c = v.comments.find(x => x.cId === commentId || x.cId === commentId.toString());
    if(!c) return;
    
    document.getElementById('comment-reply-overlay').style.display = 'block';
    document.getElementById('comment-reply-text').innerText = c.text;
    window.duetVideoId = videoId;
    switchView('duet');
    
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
        duetStream = stream;
        document.getElementById('duet-cam-video').srcObject = stream;
        document.getElementById('duet-orig-video').style.display = 'none';
        document.getElementById('duet-cam-video').style.width = '100%';
    }).catch(e => showCustomAlert("Kamera Fehler", "Kamera konnte nicht gestartet werden."));
}

function renderComments(id) {
    const list = document.getElementById('comment-list'); const video = allVideosData.find(v => v.id === id);
    if (video && video.comments && video.comments.length > 0) {
        const isCreator = currentUser && currentUser.uid === video.authorUid; const authorData = getUserData(video.authorUid, video.authorName, video.authorUsername || video.authorName, video.authorPic, video.authorVerified); const creatorPic = authorData.pic || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback';
        let blocked = (currentUser && currentUser.blockedUsers) ? currentUser.blockedUsers : []; let sortedComments = video.comments.filter(c => !blocked.includes(c.uid));
        sortedComments.sort((a, b) => { if(a.pinned && !b.pinned) return -1; if(!a.pinned && b.pinned) return 1; return 0; });
        if(sortedComments.length === 0) { list.innerHTML = '<div class="no-comments">Keine sichtbaren Kommentare.</div>'; return; }

        list.innerHTML = sortedComments.map((c, index) => {
            const cUser = getUserData(c.uid, c.name, c.username, c.pic, c.verified); const badge = getVerifiedBadge(cUser.verified); const canDelete = currentUser && (currentUser.uid === c.uid || currentUser.email === "schleimyverteilung@gmail.com" || currentUser.isAdmin); const commentId = c.cId || index.toString(); const deleteBtn = canDelete ? `<i class="fas fa-trash delete-comment-icon" onclick="deleteComment('${id}', '${commentId}')"></i>` : ''; const likeCount = c.likes ? c.likes.length : 0; const hasLiked = c.likes && currentUser && c.likes.includes(currentUser.uid) ? 'liked-heart' : ''; const timeString = timeAgo(c.cId);
            let cClass = ""; if(cUser.philPlusUntil && cUser.philPlusUntil > Date.now() && cUser.philPlusTier >= 1) cClass = "name-phil-plus";
            let cCreatorHeartHtml = ''; if (c.creatorHeart) cCreatorHeartHtml = `<div class="creator-heart-wrap" onclick="toggleCreatorHeart('${id}', '${commentId}')" style="cursor:${isCreator?'pointer':'default'};" title="Vom Creator geliket"><div class="creator-heart-img" style="background-image: url('${creatorPic}')"></div><i class="fas fa-heart creator-heart-badge"></i></div>`; else if (isCreator) cCreatorHeartHtml = `<div class="creator-heart-wrap creator-heart-inactive" onclick="toggleCreatorHeart('${id}', '${commentId}')" title="Creator Herz geben"><i class="far fa-heart creator-heart-badge-outline"></i></div>`;
            let renderedGif = ''; if(c.gifUrl) renderedGif = `<img src="${c.gifUrl}" class="comment-gif" alt="GIF">`;
            let pinBadgeHtml = c.pinned ? `<div style="font-size:11px; color:#aaa; margin-bottom:5px;"><i class="fas fa-thumbtack" style="color:#ffd700;"></i> Vom Ersteller angeheftet</div>` : '';
            let pinActionHtml = (isCreator && checkPhilPlusStatus(3)) ? `<span onclick="pinComment('${id}', '${commentId}')"><i class="fas fa-thumbtack"></i> ${c.pinned ? 'Lösen' : 'Anheften'}</span>` : '';
            let translateBtnHtml = checkPhilPlusStatus(3) ? `<i class="fas fa-language translate-btn" onclick="translateComment(this, '${commentId}')" title="Übersetzen (Plus+++)" style="color:#00f2fe; margin-left:10px; cursor:pointer;"></i>` : '';
            let replyVideoHtml = `<i class="fas fa-video reply-video-btn" onclick="startCommentReplyVideo('${id}', '${commentId}')" title="Mit Video antworten"></i>`;

            const superClass = c.superComment ? 'super-comment' : '';
            const superBadge = c.superComment ? '<div class="super-comment-badge"><i class="fas fa-star"></i> Super Comment</div>' : '';

            let repliesHtml = '';
            if (c.replies && c.replies.length > 0) {
                let validReplies = c.replies.filter(r => !blocked.includes(r.uid));
                if(validReplies.length > 0) {
                    repliesHtml = `<div class="reply-container">` + validReplies.map(r => {
                        const rUser = getUserData(r.uid, r.name, r.username, r.pic, r.verified); const rBadge = getVerifiedBadge(rUser.verified); const rCanDelete = currentUser && (currentUser.uid === r.uid || currentUser.email === "schleimyverteilung@gmail.com" || currentUser.isAdmin); const rDeleteBtn = rCanDelete ? `<i class="fas fa-trash delete-comment-icon" onclick="deleteReply('${id}', '${commentId}', '${r.rId}')"></i>` : ''; const rLikeCount = r.likes ? r.likes.length : 0; const rHasLiked = r.likes && currentUser && r.likes.includes(currentUser.uid) ? 'liked-heart' : ''; const replyTimeString = timeAgo(r.rId);
                        let rClass = ""; if(rUser.philPlusUntil && rUser.philPlusUntil > Date.now() && rUser.philPlusTier >= 1) rClass = "name-phil-plus";
                        let rCreatorHeartHtml = ''; if (r.creatorHeart) rCreatorHeartHtml = `<div class="creator-heart-wrap" onclick="toggleCreatorHeart('${id}', '${commentId}', '${r.rId}')" style="cursor:${isCreator?'pointer':'default'};" title="Vom Creator geliket"><div class="creator-heart-img" style="background-image: url('${creatorPic}')"></div><i class="fas fa-heart creator-heart-badge"></i></div>`; else if (isCreator) rCreatorHeartHtml = `<div class="creator-heart-wrap creator-heart-inactive" onclick="toggleCreatorHeart('${id}', '${commentId}', '${r.rId}')" title="Creator Herz geben"><i class="far fa-heart creator-heart-badge-outline"></i></div>`;
                        return `<div class="reply-item"><img src="${rUser.pic}" class="live-pic-${r.uid}" alt="User" onclick="openProfile('${r.uid}')" style="cursor:pointer;"><div style="flex:1; min-width: 0;"><strong onclick="openProfile('${r.uid}')" style="cursor:pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;"><span class="live-name-${r.uid} ${rClass}">${rUser.displayName}${rBadge}</span> <span class="live-username-${r.uid}" style="color:#888; font-weight:normal; font-size:12px;">@${rUser.username}</span> <span class="comment-time">${replyTimeString}</span></strong><p style="word-break: break-word;">${formatText(r.text)}</p><div class="comment-actions"><span onclick="toggleReplyBox('${commentId}')">Antworten</span><span class="${rHasLiked}" onclick="likeReply('${id}', '${commentId}', '${r.rId}')"><i class="fas fa-heart"></i> ${rLikeCount}</span>${rCreatorHeartHtml}</div></div>${rDeleteBtn}</div>`;
                    }).join('') + `</div>`;
                }
            }
            const replyBoxHtml = `<div class="reply-box" id="reply-box-${commentId}" style="display:none;"><input type="text" placeholder="Antworten..." id="reply-input-${commentId}" class="comment-input" style="font-size:16px; padding:8px 15px;"><button onclick="submitReply('${id}', '${commentId}')" class="chat-send-btn" style="width:32px; height:32px; font-size:12px; flex-shrink: 0;"><i class="fas fa-paper-plane"></i></button></div>`;
            return `<div class="comment-wrapper">${pinBadgeHtml}<div class="comment ${superClass}" style="display:flex; align-items:flex-start; width:100%; padding: 10px; border-radius: 12px;"><img src="${cUser.pic}" class="live-pic-${c.uid}" alt="User" onclick="openProfile('${c.uid}')" style="cursor:pointer;"><div style="flex:1; min-width: 0;">${superBadge}<strong onclick="openProfile('${c.uid}')" style="cursor:pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;"><span class="live-name-${c.uid} ${cClass}">${cUser.displayName}${badge}</span> <span class="live-username-${c.uid}" style="color:#888; font-weight:normal; font-size:12px;">@${cUser.username}</span> <span class="comment-time">${timeString}</span></strong><p id="comment-text-${commentId}" style="word-break: break-word;">${formatText(c.text)}${translateBtnHtml}</p>${renderedGif}<div class="comment-actions"><span onclick="toggleReplyBox('${commentId}')">Antworten</span><span class="${hasLiked}" onclick="likeComment('${id}', '${commentId}')"><i class="fas fa-heart"></i> ${likeCount}</span>${cCreatorHeartHtml}${pinActionHtml}${replyVideoHtml}</div></div>${deleteBtn}</div>${repliesHtml}${replyBoxHtml}</div>`;
        }).join('');
    } else { list.innerHTML = '<div class="no-comments">Sei der Erste, der kommentiert!</div>'; }
}

let currentPendingGifUrl = null;
document.getElementById('btn-gif-comment')?.addEventListener('click', () => { 
    if(!checkPhilPlusStatus(2)) return showCustomAlert("Phil Shorts++", "GIFs in Kommentaren erfordern Phil Shorts++!"); 
    document.getElementById('giphy-modal').classList.add('show'); fetchGiphyTrending(); 
});
document.getElementById('close-giphy-modal')?.addEventListener('click', () => document.getElementById('giphy-modal').classList.remove('show'));
document.getElementById('remove-pending-gif')?.addEventListener('click', () => { currentPendingGifUrl = null; document.getElementById('pending-gif-preview').style.display = 'none'; });

async function fetchGiphyTrending() {
    const resultsDiv = document.getElementById('giphy-results'); resultsDiv.innerHTML = '<div style="grid-column: span 2; text-align: center;"><i class="fas fa-spinner fa-spin"></i></div>';
    try { const response = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=g`); const json = await response.json(); renderGiphyResults(json.data); } catch(e) { resultsDiv.innerHTML = '<div style="grid-column: span 2; text-align: center; color: #888;">Fehler beim Laden von Giphy.</div>'; }
}

document.getElementById('giphy-search-input')?.addEventListener('input', async (e) => {
    const q = e.target.value.trim(); if(q.length < 2) return fetchGiphyTrending();
    try { const response = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=20&rating=g`); const json = await response.json(); renderGiphyResults(json.data); } catch(e) {}
});

function renderGiphyResults(gifs) {
    const resultsDiv = document.getElementById('giphy-results'); resultsDiv.innerHTML = '';
    if(!gifs || gifs.length === 0) { resultsDiv.innerHTML = '<div style="grid-column: span 2; text-align: center; color: #888;">Keine GIFs gefunden.</div>'; return; }
    gifs.forEach(gif => { const url = gif.images.fixed_height.url; resultsDiv.innerHTML += `<div class="gif-item" onclick="selectGifForComment('${url}')"><img src="${url}" alt="GIF"></div>`; });
}

window.selectGifForComment = function(url) { currentPendingGifUrl = url; document.getElementById('pending-gif-img').src = url; document.getElementById('pending-gif-preview').style.display = 'block'; document.getElementById('giphy-modal').classList.remove('show'); }

window.isSuperComment = false;
document.getElementById('btn-super-comment')?.addEventListener('click', () => {
    if (!currentUser) return showCustomAlert("Fehler", "Bitte logge dich ein.");
    if (currentUser.coins < 50) return showCustomAlert("Zu wenig Coins", "Ein Super Comment kostet 50 Coins.");
    window.isSuperComment = !window.isSuperComment;
    const btn = document.getElementById('btn-super-comment');
    if(window.isSuperComment) { btn.style.transform = 'scale(1.1)'; btn.style.boxShadow = '0 0 10px #ffd700'; }
    else { btn.style.transform = 'scale(1)'; btn.style.boxShadow = 'none'; }
});

document.getElementById('submit-comment')?.addEventListener('click', async() => {
    const input = document.getElementById('new-comment-input'); const text = input.value.trim();
    if ((!text && !currentPendingGifUrl) || !window.currentCommentVideoId || !currentUser) return;
    
    if(window.isSuperComment) {
        currentUser.coins -= 50;
        await updateDoc(doc(db, "users", currentUser.uid), { coins: increment(-50) });
        document.getElementById('my-coins').innerText = currentUser.coins;
    }

    awardXP(5);
    const commentId = Date.now().toString();
    const comment = { cId: commentId, uid: currentUser.uid, name: currentUser.displayName, username: currentUser.username, pic: currentUser.photoURL, verified: currentUser.verified || false, text: text, gifUrl: currentPendingGifUrl || null, likes: [], replies: [], creatorHeart: false, pinned: false, superComment: window.isSuperComment };
    const videoIndex = allVideosData.findIndex(v => v.id === window.currentCommentVideoId);
    
    window.isSuperComment = false;
    const superBtn = document.getElementById('btn-super-comment');
    if(superBtn) { superBtn.style.transform = 'scale(1)'; superBtn.style.boxShadow = 'none'; }

    if (videoIndex > -1) { if (!allVideosData[videoIndex].comments) allVideosData[videoIndex].comments = []; allVideosData[videoIndex].comments.push(comment); renderComments(window.currentCommentVideoId); document.querySelectorAll(`.comment-btn[data-id="${window.currentCommentVideoId}"] .comment-count-txt`).forEach(el => el.innerText = allVideosData[videoIndex].comments.length); }
    input.value = ''; currentPendingGifUrl = null; document.getElementById('pending-gif-preview').style.display = 'none';
    await updateDoc(doc(db, "videos", window.currentCommentVideoId), { comments: arrayUnion(comment) });
    const targetVidData = allVideosData.find(vd => vd.id === window.currentCommentVideoId); if (targetVidData) addNotification(targetVidData.authorUid, "comment", `hat kommentiert${text ? ': "'+text+'"' : ' mit einem GIF'}`, window.currentCommentVideoId);
});

window.toggleFollow = async function(targetUid, element, event) {
    if (event) event.stopPropagation(); if (!currentUser) return;
    const userRef = doc(db, "users", currentUser.uid); const targetRef = doc(db, "users", targetUid);
    const actionBtn = document.getElementById('profile-action-btn'); const statFollowers = document.getElementById('stat-followers');
    if (!currentUser.following.includes(targetUid)) {
        currentUser.following.push(targetUid); localStorage.setItem('phil_session', JSON.stringify(currentUser)); showToast("Gefolgt!"); document.querySelectorAll(`.follow-btn[data-target="${targetUid}"]`).forEach(btn => btn.style.display = 'none'); if (actionBtn && actionBtn.dataset.uid === targetUid) { actionBtn.innerText = "Entfolgen"; actionBtn.classList.add('edit-btn'); statFollowers.innerText = (Number(statFollowers.innerText) || 0) + 1; }
        await updateDoc(userRef, { following: arrayUnion(targetUid) }); await updateDoc(targetRef, { followers: arrayUnion(currentUser.uid) }); addNotification(targetUid, "follow", "folgt dir jetzt.");
    } else {
        currentUser.following = currentUser.following.filter(uid => uid !== targetUid); localStorage.setItem('phil_session', JSON.stringify(currentUser)); showToast("Entfolgt."); document.querySelectorAll(`.follow-btn[data-target="${targetUid}"]`).forEach(btn => btn.style.display = 'block'); if (actionBtn && actionBtn.dataset.uid === targetUid) { actionBtn.innerText = "Folgen"; actionBtn.classList.remove('edit-btn'); statFollowers.innerText = Math.max(0, (Number(statFollowers.innerText) || 0) - 1); }
        await updateDoc(userRef, { following: arrayRemove(targetUid) }); await updateDoc(targetRef, { followers: arrayRemove(currentUser.uid) });
    }
};

window.renderBlockedUsersList = function() {
    const list = document.getElementById('blocked-users-list'); if(!list) return;
    if(!currentUser || !currentUser.blockedUsers || currentUser.blockedUsers.length === 0) { list.innerHTML = '<p style="color:#888; font-size:13px; text-align:center;">Keine blockierten Nutzer.</p>'; return; }
    list.innerHTML = '';
    currentUser.blockedUsers.forEach(uid => {
        const u = allKnownUsers.find(x => x.uid === uid);
        if(u) list.innerHTML += `<div class="blocked-user-item"><div style="display:flex; align-items:center; gap:10px;"><img src="${u.photoURL}" style="width:30px; height:30px; border-radius:50%; object-fit:cover;"><span style="font-size:14px; font-weight:bold; color:white;">@${u.username}</span></div><button class="profile-action-btn edit-btn" onclick="toggleBlockUser('${uid}')" style="min-height:30px; font-size:12px; padding:0 10px; background:#ff4444; color:white; border:none;">Entblocken</button></div>`;
    });
};

window.toggleBlockUser = async function(targetUid) {
    if(!currentUser) return; const isBlocked = currentUser.blockedUsers && currentUser.blockedUsers.includes(targetUid);
    try {
        if(isBlocked) { currentUser.blockedUsers = currentUser.blockedUsers.filter(id => id !== targetUid); await updateDoc(doc(db, "users", currentUser.uid), { blockedUsers: arrayRemove(targetUid) }); showToast("Nutzer entblockt."); } 
        else {
            if(!currentUser.blockedUsers) currentUser.blockedUsers = []; currentUser.blockedUsers.push(targetUid);
            if(currentUser.following.includes(targetUid)) { currentUser.following = currentUser.following.filter(id => id !== targetUid); await updateDoc(doc(db, "users", currentUser.uid), { following: arrayRemove(targetUid) }); }
            await updateDoc(doc(db, "users", currentUser.uid), { blockedUsers: arrayUnion(targetUid) }); showToast("Nutzer blockiert. Lade neu..."); setTimeout(() => window.location.reload(), 1500); 
        }
        localStorage.setItem('phil_session', JSON.stringify(currentUser)); if(document.getElementById('view-profile').classList.contains('active')) openProfile(targetUid); renderBlockedUsersList();
    } catch(e) { showCustomAlert("Fehler", "Blockieren fehlgeschlagen."); }
};

window.currentProfileTab = 'grid'; 
window.switchProfileTab = function(tabName) { window.currentProfileTab = tabName; document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active')); document.getElementById(`tab-profile-${tabName}`).classList.add('active'); const uid = document.getElementById('profile-action-btn').dataset.uid; if(uid) renderProfileGrid(uid); };

let currentProfileUnsubscribe = null; let profileUserStories = [];
window.renderProfileGrid = function(targetUid) {
    const grid = document.getElementById('profile-grid'); let blocked = (currentUser && currentUser.blockedUsers) ? currentUser.blockedUsers : []; let videosToRender = [];
    if(window.currentProfileTab === 'grid') videosToRender = allVideosData.filter(v => v.authorUid === targetUid && !blocked.includes(v.authorUid));
    else if (window.currentProfileTab === 'likes') videosToRender = allVideosData.filter(v => v.likedBy && v.likedBy.includes(targetUid) && !blocked.includes(v.authorUid));
    else if (window.currentProfileTab === 'saved') if(currentUser && targetUid === currentUser.uid) videosToRender = allVideosData.filter(v => currentUser.savedVideos.includes(v.id) && !blocked.includes(v.authorUid));
    grid.innerHTML = '';
    if (videosToRender.length === 0) { grid.innerHTML = `<div style="grid-column: span 3; text-align: center; margin-top: 50px; color: #555;">Keine Videos</div>`; } 
    else { videosToRender.forEach(v => { const previewSrc = v.mediaType === 'images' && v.urls ? v.urls[0] : `${v.url}#t=0.5`; const mediaTag = v.mediaType === 'images' ? `<img src="${previewSrc}" style="width:100%; height:100%; object-fit:cover;">` : `<video src="${previewSrc}" muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>`; const icon = v.mediaType === 'images' ? 'fa-images' : 'fa-play'; grid.innerHTML += `<div class="grid-item" onclick="jumpToVideo('${v.id}')">${mediaTag}<div class="grid-views"><i class="fas ${icon}"></i> ${v.likedBy ? v.likedBy.length : 0}</div></div>`; }); }
}

window.openProfile = async function(targetUid) {
    switchView('profile'); 
    
    // FIX: Nur neu rendern, wenn sich die UID ändert
    const grid = document.getElementById('profile-grid');
    if (grid.dataset.lastUid !== targetUid || grid.innerHTML === "" || grid.innerHTML.includes('loading-screen')) {
        grid.innerHTML = '<div class="loading-screen"><i class="fas fa-circle-notch fa-spin"></i></div>';
        grid.dataset.lastUid = targetUid;
    }

    document.getElementById('view-profile').style.background = ''; document.getElementById('profile-audio-player').src = ''; document.getElementById('profile-audio-player').pause();
    if (currentProfileUnsubscribe) currentProfileUnsubscribe();
    currentProfileUnsubscribe = onSnapshot(doc(db, "users", targetUid), (docSnap) => {
        if (!docSnap.exists()) return; const targetUser = docSnap.data();
        let totalLikes = 0; let totalGifts = 0; const userVideos = allVideosData.filter(v => v.authorUid === targetUid); userVideos.forEach(v => { totalLikes += (v.likedBy ? v.likedBy.length : 0); totalGifts += (v.gifts || 0); });
        let level = 1; if (totalLikes > 10 || totalGifts > 50) level = 2; if (totalLikes > 50 || totalGifts > 200) level = 3; if (totalLikes > 500) level = "Pro"; document.getElementById('profile-level').innerText = `Level ${level} Creator 🌟`;
        const verifiedBadge = targetUser.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : ''; const realFollowersCount = targetUser.followers ? targetUser.followers.length : 0; const cleanUsername = targetUser.username || targetUser.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        let nameClass = ""; let tier3Badge = "";
        if(targetUser.philPlusUntil && targetUser.philPlusUntil > Date.now() && (targetUser.philPlusTier || 1) >= 1) { 
            nameClass = "name-phil-plus"; document.getElementById('phil-plus-badge-container').style.display = 'block'; let tierText = "Phil Shorts+"; if(targetUser.philPlusTier === 2) tierText = "Phil Shorts++";
            if(targetUser.philPlusTier === 3) { tierText = "Phil Shorts+++"; tier3Badge = ' <i class="fas fa-gem" style="color: #00f2fe; font-size: 14px;" title="Plus+++ Legende"></i>'; }
            document.getElementById('phil-plus-badge-text').innerHTML = `<i class="fas fa-star"></i> ${tierText}`;
        } else document.getElementById('phil-plus-badge-container').style.display = 'none';

        if(targetUser.philPlusUntil && targetUser.philPlusUntil > Date.now() && targetUser.philPlusTier === 3) {
            if(targetUser.profileColor) document.getElementById('view-profile').style.background = targetUser.profileColor;
            if(targetUser.profileSong && document.getElementById('profile-audio-player').src !== targetUser.profileSong) { document.getElementById('profile-audio-player').src = targetUser.profileSong; document.getElementById('profile-audio-player').volume = 0.5; document.getElementById('profile-audio-player').play().catch(e => {}); }
        }

        document.getElementById('profile-title').innerHTML = '@' + cleanUsername; document.getElementById('profile-name').innerHTML = `<span class="${nameClass}">${targetUser.displayName}</span>${verifiedBadge}${tier3Badge}`; document.getElementById('profile-username').innerText = '@' + cleanUsername; document.getElementById('profile-bio').innerHTML = formatText(targetUser.bio || "Keine Bio vorhanden."); document.getElementById('profile-pic').src = targetUser.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback'; document.getElementById('stat-likes').innerText = totalLikes; document.getElementById('stat-followers').innerText = realFollowersCount; document.getElementById('stat-following').innerText = targetUser.following ? targetUser.following.length : 0;
        applyBorderStyles(document.getElementById('profile-pic'), targetUser.activeBorder, targetUser.customBorder);
        
        const socialContainer = document.getElementById('profile-social-links'); socialContainer.innerHTML = '';
        if(targetUser.socialLinks) {
            if(targetUser.socialLinks.ig) socialContainer.innerHTML += `<a href="https://instagram.com/${targetUser.socialLinks.ig}" target="_blank" class="social-btn"><i class="fab fa-instagram"></i></a>`;
            if(targetUser.socialLinks.yt) socialContainer.innerHTML += `<a href="https://youtube.com/@${targetUser.socialLinks.yt}" target="_blank" class="social-btn"><i class="fab fa-youtube"></i></a>`;
            if(targetUser.socialLinks.tt) socialContainer.innerHTML += `<a href="https://tiktok.com/@${targetUser.socialLinks.tt}" target="_blank" class="social-btn"><i class="fab fa-tiktok"></i></a>`;
            if(targetUser.socialLinks.tw) socialContainer.innerHTML += `<a href="https://twitch.tv/${targetUser.socialLinks.tw}" target="_blank" class="social-btn"><i class="fab fa-twitch"></i></a>`;
        }

        const actionBtn = document.getElementById('profile-action-btn'); const msgBtn = document.getElementById('profile-message-btn'); const shopBtn = document.getElementById('profile-shop-btn'); const blockBtn = document.getElementById('profile-block-btn');
        actionBtn.dataset.uid = targetUid; const settingsIcon = document.getElementById('open-settings'); const adminDashboardBtn = document.getElementById('open-admin-dashboard'); const privateStats = document.getElementById('private-stats'); const adminControls = document.getElementById('admin-controls'); adminControls.innerHTML = '';
        
        if (currentUser && (currentUser.email === "schleimyverteilung@gmail.com" || currentUser.isAdmin) && targetUid !== currentUser.uid) { const isVerif = targetUser.verified || false; adminControls.innerHTML = `<button onclick="toggleVerify('${targetUid}', ${isVerif})" class="profile-action-btn" style="background: transparent; color: #00f2fe; border: 1px solid #00f2fe; margin-top: 15px; width: 100%;">👑 Admin: ${isVerif ? 'Blauen Haken entfernen' : 'Blauen Haken geben'}</button> <button onclick="openAdminPlusModal('${targetUid}')" class="profile-action-btn" style="background: transparent; color: #ffd700; border: 1px solid #ffd700; margin-top: 10px; width: 100%;">👑 Abo verwalten</button>`; }
        
        if (currentUser && targetUid === currentUser.uid) { 
            msgBtn.style.display = 'none'; shopBtn.style.display = 'block'; blockBtn.style.display = 'none'; document.getElementById('tab-profile-saved').style.display = 'block';
            actionBtn.innerText = "Profil bearbeiten"; actionBtn.classList.add('edit-btn'); actionBtn.onclick = () => { 
                document.getElementById('edit-displayname-input').value = currentUser.displayName; document.getElementById('edit-username-input').value = currentUser.username || cleanUsername; document.getElementById('edit-pic-input').value = currentUser.photoURL; document.getElementById('edit-bio-input').value = currentUser.bio; document.getElementById('edit-song-input').value = currentUser.profileSong || ""; document.getElementById('edit-color-input').value = currentUser.profileColor || "#000000"; document.getElementById('edit-social-ig').value = currentUser.socialLinks?.ig || ""; document.getElementById('edit-social-yt').value = currentUser.socialLinks?.yt || ""; document.getElementById('edit-social-tt').value = currentUser.socialLinks?.tt || ""; document.getElementById('edit-social-tw').value = currentUser.socialLinks?.tw || ""; document.getElementById('settings-modal').classList.add('show'); 
            }; 
            settingsIcon.style.display = 'block'; settingsIcon.onclick = () => { updateNotifUI(); renderBlockedUsersList(); document.getElementById('app-settings-modal').classList.add('show'); }; adminDashboardBtn.style.display = (currentUser.email === "schleimyverteilung@gmail.com" || currentUser.isAdmin) ? 'block' : 'none'; privateStats.style.display = 'block'; document.getElementById('my-coins').innerText = targetUser.coins || 0; document.getElementById('my-views').innerText = targetUser.profileViews || 0; 
        } 
        else { 
            adminDashboardBtn.style.display = 'none'; privateStats.style.display = 'none'; shopBtn.style.display = 'none'; document.getElementById('tab-profile-saved').style.display = 'none';
            if(window.currentProfileTab === 'saved') switchProfileTab('grid');
            if (currentUser) { 
                msgBtn.style.display = 'block'; msgBtn.onclick = () => { window.openDM(targetUid, cleanUsername, targetUser.photoURL); }; blockBtn.style.display = 'block';
                if(currentUser.blockedUsers && currentUser.blockedUsers.includes(targetUid)) { blockBtn.innerHTML = '<i class="fas fa-ban"></i> Entblocken'; blockBtn.classList.add('blocked-user'); } else { blockBtn.innerHTML = '<i class="fas fa-ban"></i> Blockieren'; blockBtn.classList.remove('blocked-user'); }
                blockBtn.onclick = () => toggleBlockUser(targetUid);
            } 
            if (currentUser && currentUser.following && currentUser.following.includes(targetUid)) { actionBtn.innerText = "Entfolgen"; actionBtn.classList.add('edit-btn'); } else { actionBtn.innerText = "Folgen"; actionBtn.classList.remove('edit-btn'); } actionBtn.onclick = () => toggleFollow(targetUid); settingsIcon.style.display = 'none'; 
        }
        let storyDuration = 86400000; if (targetUser.philPlusUntil && targetUser.philPlusUntil > Date.now() && (targetUser.philPlusTier || 1) >= 1) storyDuration = 172800000;
        profileUserStories = (targetUser.stories || []).filter(s => (Date.now() - s.timestamp) < storyDuration); 
        const picContainer = document.getElementById('profile-pic-container'); const storyBadge = document.getElementById('story-badge');
        if(profileUserStories.length > 0) { picContainer.classList.add('story-ring'); storyBadge.style.display = 'none'; } else { picContainer.classList.remove('story-ring'); if(currentUser && targetUid === currentUser.uid) storyBadge.style.display = 'flex'; else storyBadge.style.display = 'none'; }
        window.renderProfileGrid(targetUid);
        updateProfileGamificationUI();
    });
    if (currentUser && targetUid !== currentUser.uid && !checkPhilPlusStatus(3)) updateDoc(doc(db, "users", targetUid), { profileViews: increment(1) }).catch(e => {}); 
};


const shopItems = [ { id: 'b1', name: 'Ohne', type: 'border', cost: 0, cssClass: 'none' }, { id: 'b2', name: 'Neon Blau', type: 'border', cost: 500, cssClass: 'neon-blue' }, { id: 'b3', name: 'Gold', type: 'border', cost: 1000, cssClass: 'gold' }, { id: 'b4', name: '3663 Pro', type: 'border', cost: 2500, cssClass: '3663' }, { id: 'b5', name: 'Diamant', type: 'border', cost: 5000, cssClass: 'diamond' }, { id: 'b6', name: 'RGB Chroma (Plus++)', type: 'border', cost: 0, cssClass: 'chroma', requiresPlusLevel: 2 }, { id: 'b7', name: 'Rot', type: 'border', cost: 100, cssClass: 'solid-red' }, { id: 'b8', name: 'Blau', type: 'border', cost: 100, cssClass: 'solid-blue' }, { id: 'b9', name: 'Grün', type: 'border', cost: 100, cssClass: 'solid-green' }, { id: 'b10', name: 'Gelb', type: 'border', cost: 100, cssClass: 'solid-yellow' }, { id: 'b11', name: 'Lila', type: 'border', cost: 100, cssClass: 'solid-purple' }, { id: 'b12', name: 'Orange', type: 'border', cost: 100, cssClass: 'solid-orange' }, { id: 'b13', name: 'Pink', type: 'border', cost: 100, cssClass: 'solid-white' }, { id: 'b15', name: 'Neon Rot', type: 'border', cost: 800, cssClass: 'neon-red' }, { id: 'b16', name: 'Neon Grün', type: 'border', cost: 800, cssClass: 'neon-green' }, { id: 'b17', name: 'Neon Lila', type: 'border', cost: 800, cssClass: 'neon-purple' }, { id: 'b18', name: 'Neon Pink', type: 'border', cost: 800, cssClass: 'neon-pink' }, { id: 'b19', name: 'Neon Orange', type: 'border', cost: 800, cssClass: 'neon-orange' }, { id: 'b20', name: 'Dashed Rot', type: 'border', cost: 300, cssClass: 'dashed-red' }, { id: 'b21', name: 'Dashed Blau', type: 'border', cost: 300, cssClass: 'dashed-blue' }, { id: 'b22', name: 'Dotted Grün', type: 'border', cost: 300, cssClass: 'dotted-green' }, { id: 'b23', name: 'Double Lila', type: 'border', cost: 400, cssClass: 'double-purple' }, { id: 'b24', name: 'Double Gold', type: 'border', cost: 1500, cssClass: 'double-gold' }, { id: 'b25', name: 'Fire Gradient', type: 'border', cost: 2000, cssClass: 'grad-fire' }, { id: 'b26', name: 'Ice Gradient', type: 'border', cost: 2000, cssClass: 'grad-ice' }, { id: 'b27', name: 'Toxic Gradient', type: 'border', cost: 2000, cssClass: 'grad-toxic' }, { id: 'b28', name: 'Sunset Gradient', type: 'border', cost: 2000, cssClass: 'grad-sunset' }, { id: 'b29', name: 'Cyberpunk', type: 'border', cost: 3000, cssClass: 'cyberpunk' }, { id: 'b30', name: 'Vaporwave', type: 'border', cost: 3000, cssClass: 'vaporwave' }, { id: 'b31', name: 'Cosmic', type: 'border', cost: 3500, cssClass: 'cosmic' }, { id: 'b32', name: 'Rainbow', type: 'border', cost: 4000, cssClass: 'rainbow' }, { id: 'b_custom', name: 'Custom (Plus+++)', type: 'border', cost: 0, cssClass: 'custom', requiresPlusLevel: 3 } ];

document.getElementById('profile-shop-btn')?.addEventListener('click', () => { if(!currentUser) return; document.getElementById('shop-modal-coins').innerText = currentUser.coins; renderShopBorders(); document.getElementById('shop-modal').classList.add('show'); });
document.querySelectorAll('.shop-tab:not(.pro-tab-btn)').forEach(tab => { tab.addEventListener('click', (e) => { document.querySelectorAll('.shop-tab:not(.pro-tab-btn)').forEach(t => t.classList.remove('active')); e.target.classList.add('active'); document.querySelectorAll('.shop-content-section').forEach(s => s.style.display = 'none'); document.getElementById(e.target.dataset.tab).style.display = 'block'; }); });
document.getElementById('close-shop-modal')?.addEventListener('click', () => document.getElementById('shop-modal').classList.remove('show'));

function renderShopBorders() {
    const grid = document.getElementById('shop-borders-grid');
    grid.innerHTML = shopItems.filter(i => i.type === 'border').map(item => {
        const hasRequiredLevel = item.requiresPlusLevel ? checkPhilPlusStatus(item.requiresPlusLevel) : true; const isOwned = currentUser.decorations && currentUser.decorations.includes(item.id) || item.cost === 0; const isEquipped = currentUser.activeBorder === item.cssClass;
        let btnHtml = ''; if(item.requiresPlusLevel && !hasRequiredLevel) btnHtml = `<button class="profile-action-btn edit-btn" style="width:100%; font-size:12px; min-height:30px;">Level ${item.requiresPlusLevel} benötigt</button>`; 
        else if(item.cssClass === 'custom') btnHtml = `<button class="profile-action-btn" onclick="openCustomBorderConfig()" style="width:100%; font-size:12px; min-height:30px; background:#00f2fe; color:black;">Anpassen</button>`;
        else if(isEquipped) btnHtml = `<button class="profile-action-btn edit-btn" style="width:100%; font-size:12px; min-height:30px;">Ausgerüstet</button>`; 
        else if(isOwned) btnHtml = `<button class="profile-action-btn" onclick="equipDecoration('${item.id}', '${item.cssClass}')" style="width:100%; font-size:12px; min-height:30px; background:#00f2fe; color:black;">Ausrüsten</button>`; 
        else btnHtml = `<button class="profile-action-btn" onclick="buyDecoration('${item.id}', ${item.cost})" style="width:100%; font-size:12px; min-height:30px;"><i class="fas fa-coins"></i> ${item.cost}</button>`; 
        let previewStyle = item.cssClass === 'custom' && currentUser.customBorder ? getInlineBorderStyle('custom', currentUser.customBorder) : '';
        return `<div class="shop-item-card"><div class="shop-item-preview border-${item.cssClass}" style="${previewStyle}"></div><strong style="font-size: 14px; display:block; margin-bottom:10px;">${item.name}</strong>${btnHtml}</div>`;
    }).join('');
}

window.buyDecoration = async function(id, cost) { if(!currentUser) return; if(currentUser.coins < cost) return showCustomAlert("Zu wenig Coins", "Du hast nicht genug Coins dafür!"); try { currentUser.coins -= cost; if(!currentUser.decorations) currentUser.decorations = []; currentUser.decorations.push(id); await updateDoc(doc(db, "users", currentUser.uid), { coins: increment(-cost), decorations: arrayUnion(id) }); document.getElementById('shop-modal-coins').innerText = currentUser.coins; document.getElementById('my-coins').innerText = currentUser.coins; renderShopBorders(); showToast("Gekauft!"); } catch(e) {} }
window.equipDecoration = async function(id, cssClass) { if(!currentUser) return; try { let finalClass = cssClass === 'none' ? "" : cssClass; currentUser.activeBorder = finalClass; await updateDoc(doc(db, "users", currentUser.uid), { activeBorder: finalClass }); renderShopBorders(); showToast("Ausgerüstet!"); } catch(e) {} }

window.openCustomBorderConfig = function() { if(!checkPhilPlusStatus(3)) return; const modal = document.getElementById('custom-border-modal'); if(currentUser.customBorder) { document.getElementById('cb-color1').value = currentUser.customBorder.c1; document.getElementById('cb-color2').value = currentUser.customBorder.c2; document.getElementById('cb-grad-toggle').checked = currentUser.customBorder.grad; } updateCustomBorderPreview(); modal.classList.add('show'); }
function updateCustomBorderPreview() { const c1 = document.getElementById('cb-color1').value; const c2 = document.getElementById('cb-color2').value; const grad = document.getElementById('cb-grad-toggle').checked; document.getElementById('cb-color2-container').style.display = grad ? 'block' : 'none'; applyBorderStyles(document.getElementById('custom-border-preview'), 'custom', { c1, c2, grad }); }
document.getElementById('cb-color1')?.addEventListener('input', updateCustomBorderPreview); document.getElementById('cb-color2')?.addEventListener('input', updateCustomBorderPreview); document.getElementById('cb-grad-toggle')?.addEventListener('change', updateCustomBorderPreview);
window.saveCustomBorder = async function() { if(!currentUser || !checkPhilPlusStatus(3)) return; const c1 = document.getElementById('cb-color1').value; const c2 = document.getElementById('cb-color2').value; const grad = document.getElementById('cb-grad-toggle').checked; try { currentUser.activeBorder = 'custom'; currentUser.customBorder = { c1, c2, grad }; await updateDoc(doc(db, "users", currentUser.uid), { activeBorder: 'custom', customBorder: { c1, c2, grad } }); document.getElementById('custom-border-modal').classList.remove('show'); renderShopBorders(); showToast("Ausgerüstet!"); } catch(e) {} }

window.pendingSub = null;
window.buyPhilPlus = async function(days, tier) { 
    if(!currentUser) return; 
    
    const secureCost = SUBSCRIPTION_PRICES[tier]?.[days];
    if(!secureCost) return showCustomAlert("Fehler", "Ungültiges Abo ausgewählt.");

    if(checkPhilPlusStatus(1)) {
        window.pendingSub = { days, cost: secureCost, tier };
        let msg = currentUser.philPlusTier === tier ? `Du hast bereits Stufe ${tier}. Möchtest du dein Abo um ${days} Tage verlängern, oder das Abo abbestellen?` : `Du besitzt aktuell Stufe ${currentUser.philPlusTier}. Möchtest du dein neues Abo (Stufe ${tier}) kaufen und das aktuelle überschreiben, oder dein Abo komplett löschen?`;
        document.getElementById('sub-conflict-msg').innerText = msg; document.getElementById('shop-modal').classList.remove('show'); document.getElementById('sub-conflict-modal').classList.add('show'); return;
    }
    if(currentUser.coins < secureCost) return showCustomAlert("Zu wenig Coins", "Du hast nicht genug Coins."); 
    if(confirm(`Möchtest du Phil Shorts+ (Stufe ${tier}) für ${days} Tage kaufen? Kosten: ${secureCost} Coins.`)) executeSubPurchase(days, secureCost, tier);
}

window.confirmSubPurchase = function() { 
    if(!window.pendingSub) return; 
    const { days, cost, tier } = window.pendingSub; 
    if(currentUser.coins < cost) return showCustomAlert("Zu wenig Coins", "Du hast nicht genug Coins."); 
    document.getElementById('sub-conflict-modal').classList.remove('show'); 
    executeSubPurchase(days, cost, tier); 
}
window.cancelSubscription = async function() { if(!currentUser) return; if(confirm("Möchtest du dein Phil Shorts+ Abo WIRKLICH endgültig löschen?")) { try { currentUser.philPlusUntil = 0; currentUser.philPlusTier = 0; await updateDoc(doc(db, "users", currentUser.uid), { philPlusUntil: 0, philPlusTier: 0 }); document.getElementById('sub-conflict-modal').classList.remove('show'); showToast("Abo gelöscht."); initLiveUser(); } catch(e) {} } }

async function executeSubPurchase(days, cost, tier) { 
    try { 
        currentUser.coins -= cost; 
        let currentUntil = currentUser.philPlusUntil && currentUser.philPlusUntil > Date.now() ? currentUser.philPlusUntil : Date.now(); 
        let newUntil = currentUntil + (days * 86400000); 
        currentUser.philPlusUntil = newUntil; 
        currentUser.philPlusTier = tier; 
        await updateDoc(doc(db, "users", currentUser.uid), { coins: increment(-cost), philPlusUntil: newUntil, philPlusTier: tier }); 
        document.getElementById('shop-modal-coins').innerText = currentUser.coins; 
        document.getElementById('my-coins').innerText = currentUser.coins; 
        showToast(`Phil Shorts+ aktiviert! 🎉`); 
        document.getElementById('shop-modal').classList.remove('show'); 
        initLiveUser(); 
    } catch(e) {} 
}

window.openStoryUpload = function() { if(!currentUser) return; document.getElementById('shop-modal').classList.remove('show'); document.getElementById('story-upload-modal').classList.add('show'); }
document.getElementById('close-story-upload')?.addEventListener('click', () => document.getElementById('story-upload-modal').classList.remove('show'));
document.getElementById('up-story-file')?.addEventListener('change', function(e) { const file = e.target.files[0]; if(file) { document.querySelector('#up-story-btn p').innerText = file.name; document.querySelector('#up-story-btn i').style.color = "#00f2fe"; document.getElementById('story-preview-img').src = URL.createObjectURL(file); document.getElementById('story-preview-img').style.display = 'block'; } });
document.getElementById('submit-story-upload')?.addEventListener('click', async() => { 
    const file = document.getElementById('up-story-file').files[0]; if(!file) return showCustomAlert("Fehler", "Bitte wähle ein Bild aus."); if(!currentUser) return; if(currentUser.coins < 1000) return showCustomAlert("Zu wenig Coins", "Eine Story kostet 1000 Coins."); 
    const linkInput = document.getElementById('up-story-link').value.trim(); if(linkInput && !checkPhilPlusStatus(3)) return showCustomAlert("Fehler", "Links in Stories erfordern Plus+++!");
    const btn = document.getElementById('submit-story-upload'); const status = document.getElementById('story-upload-status'); btn.disabled = true; status.innerText = "Lade hoch... Bitte warten!"; 
    try { 
        const secure_url = await uploadFileToFirebase(file, 'stories'); const storyObj = { id: Date.now().toString(), url: secure_url, timestamp: Date.now(), link: linkInput || null }; currentUser.coins -= 1000; await updateDoc(doc(db, "users", currentUser.uid), { coins: increment(-1000), stories: arrayUnion(storyObj) }); document.getElementById('my-coins').innerText = currentUser.coins; showToast("Story gepostet! 📸"); document.getElementById('story-upload-modal').classList.remove('show'); document.getElementById('up-story-file').value = ''; document.getElementById('up-story-link').value = ''; document.getElementById('story-preview-img').style.display = 'none'; document.querySelector('#up-story-btn p').innerText = "Bild für Story auswählen"; document.querySelector('#up-story-btn i').style.color = "#aaa"; 
    } catch(e) { showCustomAlert("Upload Fehler", "Story konnte nicht hochgeladen werden."); } finally { btn.disabled = false; status.innerText = ""; } 
});

let storyViewerTimer = null; window.currentStoryIndex = 0;
window.viewUserStory = function(index = 0) {
    if(profileUserStories.length === 0) { if(currentUser && document.getElementById('profile-action-btn').dataset.uid === currentUser.uid) openStoryUpload(); return; }
    if(index >= profileUserStories.length) return closeStoryViewer(); if(index < 0) index = 0;
    window.currentStoryIndex = index; const story = profileUserStories[index]; const uid = document.getElementById('profile-action-btn').dataset.uid; const authorData = getUserData(uid, "User", "user", "", false);
    document.getElementById('sv-pic').src = authorData.pic || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback'; document.getElementById('sv-name').innerText = authorData.displayName; document.getElementById('sv-time').innerText = timeAgo(story.timestamp); document.getElementById('sv-counter').innerText = `${index + 1}/${profileUserStories.length}`; document.getElementById('sv-img').src = story.url; document.getElementById('story-viewer').classList.add('show');
    const linkBtn = document.getElementById('sv-link-btn'); if(story.link) { linkBtn.href = story.link; linkBtn.style.display = 'inline-flex'; } else linkBtn.style.display = 'none';
    
    const deleteBtn = document.getElementById('sv-delete-btn');
    const isAdmin = currentUser && (currentUser.email === "schleimyverteilung@gmail.com" || currentUser.isAdmin);
    const isMine = currentUser && currentUser.uid === uid;
    if(isMine || isAdmin) { deleteBtn.style.display = 'block'; } else { deleteBtn.style.display = 'none'; }

    const container = document.getElementById('sv-progress-container'); container.innerHTML = '';
    for(let i=0; i < profileUserStories.length; i++){ let width = (i < index) ? '100%' : '0%'; container.innerHTML += `<div style="flex:1; height:100%; background:rgba(255,255,255,0.3); border-radius:2px; overflow:hidden;"><div id="sv-prog-${i}" style="height:100%; width:${width}; background:white; transition:${i === index ? 'width 5s linear' : 'none'};"></div></div>`; }
    setTimeout(() => { const currentProg = document.getElementById(`sv-prog-${index}`); if(currentProg) currentProg.style.width = '100%'; }, 50);
    clearTimeout(storyViewerTimer); storyViewerTimer = setTimeout(() => { nextStory(); }, 5000);
}
window.nextStory = function() { viewUserStory(window.currentStoryIndex + 1); }
window.prevStory = function() { viewUserStory(window.currentStoryIndex - 1); }
window.closeStoryViewer = function() { clearTimeout(storyViewerTimer); document.getElementById('story-viewer').classList.remove('show'); }

window.deleteStory = async function() {
    if(profileUserStories.length === 0) return;
    const story = profileUserStories[window.currentStoryIndex];
    const uid = document.getElementById('profile-action-btn').dataset.uid;
    const isAdmin = currentUser && (currentUser.email === "schleimyverteilung@gmail.com" || currentUser.isAdmin);
    const isMine = currentUser && currentUser.uid === uid;
    if(!isMine && !isAdmin) return;
    if(confirm("Möchtest du diese Story wirklich löschen?")) {
        try {
            const targetUserRef = doc(db, "users", uid);
            const targetUserSnap = await getDoc(targetUserRef);
            if(targetUserSnap.exists()) {
                let stories = targetUserSnap.data().stories || [];
                stories = stories.filter(s => s.id !== story.id);
                await updateDoc(targetUserRef, { stories: stories });
                showToast("Story erfolgreich gelöscht!");
                closeStoryViewer();
                openProfile(uid); 
            }
        } catch(e) { showCustomAlert("Fehler", "Story konnte nicht gelöscht werden."); }
    }
};

window.sendSupport = async function() { const msg = document.getElementById('support-msg').value.trim(); if(!msg || !currentUser) return; const ticketRef = await addDoc(collection(db, "reports"), { uid: currentUser.uid, name: currentUser.displayName, hasPlus: checkPhilPlusStatus(1), tier: currentUser.philPlusTier || 0, status: 'open', timestamp: Date.now() }); await addDoc(collection(db, `reports/${ticketRef.id}/messages`), { senderUid: currentUser.uid, text: msg, timestamp: Date.now() }); showToast("Ticket erstellt!"); document.getElementById('support-msg').value = ''; document.getElementById('app-settings-modal').classList.remove('show'); switchView('inbox'); document.getElementById('tab-support').click(); }
window.toggleVerify = async function(targetUid, currentStatus) { try { await updateDoc(doc(db, "users", targetUid), { verified: !currentStatus }); showToast(!currentStatus ? "Blauer Haken vergeben! 🔵" : "Haken entfernt."); } catch (e) {} };

document.getElementById('save-settings-btn')?.addEventListener('click', async() => {
    const newDisplayName = document.getElementById('edit-displayname-input').value.trim(); const newUsername = document.getElementById('edit-username-input').value.trim().replace(/[^a-zA-Z0-9_]/g, '').toLowerCase(); const newBio = document.getElementById('edit-bio-input').value.trim(); const newPic = document.getElementById('edit-pic-input').value.trim() || currentUser.photoURL; const newSong = document.getElementById('edit-song-input').value.trim(); const newColor = document.getElementById('edit-color-input').value; const newIg = document.getElementById('edit-social-ig').value.trim().replace('@', ''); const newYt = document.getElementById('edit-social-yt').value.trim().replace('@', ''); const newTt = document.getElementById('edit-social-tt').value.trim().replace('@', ''); const newTw = document.getElementById('edit-social-tw').value.trim().replace('@', '');
    if (newUsername.length < 3) return showCustomAlert("Hinweis", "Benutzername mind. 3 Zeichen."); if (newDisplayName.length < 2) return showCustomAlert("Hinweis", "Anzeigename zu kurz.");
    const btn = document.getElementById('save-settings-btn'); btn.innerText = "Prüfe..."; btn.disabled = true;
    try {
        const targetUid = window.editingProfileUid || currentUser.uid;
        if (targetUid === currentUser.uid) {
            const nameQuery = query(collection(db, "users"), where("username", "==", newUsername)); const nameSnap = await getDocs(nameQuery); let nameTaken = false; nameSnap.forEach(d => { if (d.id !== currentUser.uid) nameTaken = true; });
            if (nameTaken) { btn.innerText = "Profil Speichern"; btn.disabled = false; return showCustomAlert("Name vergeben", "Existiert bereits!"); }
        }
        btn.innerText = "Speichere..."; 
        let updates = { displayName: newDisplayName, username: newUsername, bio: newBio, photoURL: newPic, socialLinks: { ig: newIg, yt: newYt, tt: newTt, tw: newTw } };
        if(checkPhilPlusStatus(3) || window.editingProfileUid) { updates.profileSong = newSong; updates.profileColor = newColor; }
        await updateDoc(doc(db, "users", targetUid), updates);
        
        if (targetUid === currentUser.uid) {
            const q = query(collection(db, "videos")); const snapshot = await getDocs(q);
            snapshot.forEach(async(vDoc) => {
                let vData = vDoc.data(); let videoUpdates = {}; let changed = false;
                if (vData.authorUid === currentUser.uid) { videoUpdates.authorName = newDisplayName; videoUpdates.authorUsername = newUsername; videoUpdates.authorPic = newPic; changed = true; }
                if (vData.comments && vData.comments.length > 0) { let commentsChanged = false; let newComments = vData.comments.map(c => { if (c.uid === currentUser.uid) { c.name = newDisplayName; c.username = newUsername; c.pic = newPic; commentsChanged = true; } if (c.replies) { c.replies = c.replies.map(r => { if (r.uid === currentUser.uid) { r.name = newDisplayName; r.username = newUsername; r.pic = newPic; commentsChanged = true; } return r; }); } return c; }); if (commentsChanged) { videoUpdates.comments = newComments; changed = true; } }
                if (changed) await updateDoc(doc(db, "videos", vDoc.id), videoUpdates);
            });
        }
        
        showToast(window.editingProfileUid ? "Nutzerprofil aktualisiert!" : "Profil aktualisiert!"); 
        document.getElementById('settings-modal').classList.remove('show');
        window.editingProfileUid = null;
    } catch (e) {} finally { btn.innerText = "Profil Speichern"; btn.disabled = false; }
});

document.getElementById('nav-profile')?.addEventListener('click', () => { if (currentUser) openProfile(currentUser.uid); });
document.getElementById('open-admin-dashboard')?.addEventListener('click', () => { switchView('admin'); loadAdminDashboard(); });

window.openAdminPlusModal = function(targetUid) {
    if (!currentUser || (currentUser.email !== "schleimyverteilung@gmail.com" && !currentUser.isAdmin)) return;
    window.adminTargetUid = targetUid;
    document.getElementById('admin-plus-modal').classList.add('show');
};

window.adminGrantPlus = async function(tier) {
    if (!currentUser || !window.adminTargetUid || (currentUser.email !== "schleimyverteilung@gmail.com" && !currentUser.isAdmin)) return;
    try {
        if (tier === 0) {
            if(confirm("Sicher, dass du das Abo von diesem Nutzer komplett löschen willst?")) {
                await updateDoc(doc(db, "users", window.adminTargetUid), { philPlusUntil: 0, philPlusTier: 0 });
                showToast("Abo des Nutzers gelöscht.");
            }
        } else {
            let newUntil = Date.now() + (30 * 86400000); 
            await updateDoc(doc(db, "users", window.adminTargetUid), { philPlusUntil: newUntil, philPlusTier: tier });
            showToast(`Stufe ${tier} Plus für 30 Tage an Nutzer verschenkt!`);
        }
        document.getElementById('admin-plus-modal').classList.remove('show');
        openProfile(window.adminTargetUid); 
    } catch(e) {
        showCustomAlert("Fehler", "Abo konnte nicht verwaltet werden.");
    }
};

window.adminEditProfile = function(uid) {
    const user = allKnownUsers.find(u => u.uid === uid);
    if(!user) return;
    window.editingProfileUid = uid;
    document.getElementById('edit-displayname-input').value = user.displayName || '';
    document.getElementById('edit-username-input').value = user.username || '';
    document.getElementById('edit-bio-input').value = user.bio || '';
    document.getElementById('edit-pic-input').value = user.photoURL || '';
    document.getElementById('edit-song-input').value = user.profileSong || "";
    document.getElementById('edit-color-input').value = user.profileColor || "#000000";
    document.getElementById('edit-social-ig').value = user.socialLinks?.ig || "";
    document.getElementById('edit-social-yt').value = user.socialLinks?.yt || "";
    document.getElementById('edit-social-tt').value = user.socialLinks?.tt || "";
    document.getElementById('edit-social-tw').value = user.socialLinks?.tw || "";
    document.getElementById('settings-modal').classList.add('show');
};

window.switchAdminTab = function(tabId) {
    document.querySelectorAll('#view-admin .shop-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#view-admin .admin-content-section').forEach(s => s.style.display = 'none');
    document.querySelector(`#view-admin .shop-tab[onclick="switchAdminTab('${tabId}')"]`).classList.add('active');
    document.getElementById(`admin-tab-${tabId}`).style.display = 'block';
};

window.loadAdminDashboard = async function() {
    if (!currentUser || (currentUser.email !== "schleimyverteilung@gmail.com" && !currentUser.isAdmin)) return;
    const userList = document.getElementById('admin-user-list'); userList.innerHTML = '<div class="loading-screen"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const usersSnap = await getDocs(collection(db, "users")); document.getElementById('admin-total-users').innerText = usersSnap.size; document.getElementById('admin-total-videos').innerText = allVideosData.length; userList.innerHTML = '';
        usersSnap.forEach(docSnap => {
            const u = docSnap.data(); const isVerif = u.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : ''; const isAdminBadge = u.isAdmin ? '<i class="fas fa-shield-alt" style="color:#ffd700; margin-left:5px;"></i>' : ''; const isBannedBadge = u.banned ? '<span style="color:#ff4444; font-size:10px; margin-left:5px; font-weight:bold;">[GEBANNT]</span>' : ''; let actionsHtml = '';
            if (u.email !== "schleimyverteilung@gmail.com") { actionsHtml = `<div class="admin-actions"><button class="admin-btn btn-gold" onclick="adminEditProfile('${u.uid}')">Profil Editieren</button><button class="admin-btn btn-blue" onclick="toggleVerifyAdmin('${u.uid}', ${u.verified || false})">${u.verified ? 'Haken weg' : 'Haken'}</button><button class="admin-btn btn-gold" onclick="giveCoins('${u.uid}')">+1000 Coins</button></div><div class="admin-actions" style="margin-top: 8px;"><button class="admin-btn ${u.isAdmin ? 'btn-red' : 'btn-green'}" onclick="toggleAdminRole('${u.uid}', ${u.isAdmin || false})">${u.isAdmin ? 'Admin weg' : 'Admin machen'}</button><button class="admin-btn ${u.banned ? 'btn-green' : 'btn-red'}" onclick="toggleBanStatus('${u.uid}', ${u.banned || false})">${u.banned ? 'Entbannen' : 'Bannen'}</button></div>`; }
            userList.innerHTML += `<div class="admin-user-card ${u.banned ? 'banned-card' : ''}"><div class="admin-user-header" onclick="openProfile('${u.uid}')" style="cursor:pointer;"><img src="${u.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback'}"><div style="flex:1; min-width:0;"><strong style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">@${u.displayName} ${isVerif}${isAdminBadge}${isBannedBadge}</strong><div style="font-size:11px; color:#888;">${u.email} | Coins: ${u.coins || 0}</div></div></div>${actionsHtml}</div>`;
        });

        // Admin Sound Requests Laden
        const soundList = document.getElementById('admin-sound-requests-list');
        onSnapshot(collection(db, "sound_requests"), (snap) => {
            soundList.innerHTML = '';
            if (snap.empty) { soundList.innerHTML = '<p style="color:#555; text-align:center;">Keine neuen Anfragen.</p>'; return; }
            snap.forEach(d => {
                const r = d.data();
                soundList.innerHTML += `<div class="admin-sound-card" style="margin-bottom:10px; padding:10px; background:#1a1a1a; border-radius:10px; border:1px solid #333;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div><strong style="color:white; font-size:14px;">${r.title}</strong><p style="font-size:11px; color:#888;">Von: ${r.senderName}</p></div>
                        <div style="display:flex; gap:8px;">
                            <button class="admin-btn btn-blue" onclick="previewSound('${r.url}', this)"><i class="fas fa-play"></i></button>
                            <button class="admin-btn btn-green" onclick="approveSound('${d.id}')">Freigeben</button>
                        </div>
                    </div></div>`;
            });
        });

    } catch (e) {}
}

window.approveSound = async function(id) {
    const docRef = doc(db, "sound_requests", id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        const data = snap.data();
        await addDoc(collection(db, "official_sounds"), {
            title: data.title,
            url: data.url,
            senderUid: data.senderUid,
            timestamp: Date.now()
        });
        await deleteDoc(docRef);
        showToast("Sound wurde veröffentlicht! 🎧");
    }
};

window.toggleVerifyAdmin = async function(targetUid, currentStatus) { if (!currentUser || (currentUser.email !== "schleimyverteilung@gmail.com" && !currentUser.isAdmin)) return; await updateDoc(doc(db, "users", targetUid), { verified: !currentStatus }); loadAdminDashboard(); };
window.toggleAdminRole = async function(targetUid, currentStatus) { if (!currentUser || (currentUser.email !== "schleimyverteilung@gmail.com" && !currentUser.isAdmin)) return; await updateDoc(doc(db, "users", targetUid), { isAdmin: !currentStatus }); loadAdminDashboard(); };
window.toggleBanStatus = async function(targetUid, currentStatus) { if (!currentUser || (currentUser.email !== "schleimyverteilung@gmail.com" && !currentUser.isAdmin)) return; await updateDoc(doc(db, "users", targetUid), { banned: !currentStatus }); loadAdminDashboard(); };
window.giveCoins = async function(targetUid) { await updateDoc(doc(db, "users", targetUid), { coins: increment(1000) }); loadAdminDashboard(); };

document.getElementById('search-input')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase(); const resultsGrid = document.getElementById('search-results'); const trendingSection = document.getElementById('trending-tags');
    let blocked = (currentUser && currentUser.blockedUsers) ? currentUser.blockedUsers : [];
    if (query.length < 2) { resultsGrid.style.display = 'none'; trendingSection.style.display = 'block'; return; } trendingSection.style.display = 'none'; resultsGrid.style.display = 'block';
    
    const matchedUsers = allKnownUsers.filter(u => ((u.displayName || "").toLowerCase().includes(query) || (u.username || "").toLowerCase().includes(query)));
    const matchedVideos = allVideosData.filter(v => !blocked.includes(v.authorUid) && ((v.description || "").toLowerCase().includes(query) || (v.authorName || "").toLowerCase().includes(query) || (v.title || "").toLowerCase().includes(query)));
    
    let html = '';
    if (matchedUsers.length > 0) {
        html += '<h4 style="padding: 10px 15px; color:#888; font-size:14px; text-transform:uppercase;">Benutzer</h4><div style="display:flex; flex-direction:column; gap:15px; padding: 0 15px 20px;">';
        matchedUsers.forEach(u => { const isVerif = u.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : ''; const cleanUsername = u.username || u.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase(); let nameClass = u.philPlusUntil && u.philPlusUntil > Date.now() && u.philPlusTier >= 1 ? "name-phil-plus" : ""; let isBlocked = blocked.includes(u.uid); let blockedBadge = isBlocked ? '<span style="color:#ff4444; font-size:10px; margin-left:5px; font-weight:bold;">[BLOCKIERT]</span>' : ''; html += `<div style="display:flex; align-items:center; gap:15px; cursor:pointer;" onclick="openProfile('${u.uid}')"><img src="${u.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback'}" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border: 1px solid #333; flex-shrink:0;"><div style="flex:1; min-width:0;"><strong style="font-size:16px; display:block; margin-bottom:3px; color:white;"><span class="live-name-${u.uid} ${nameClass}">${u.displayName}${isVerif}${blockedBadge}</span></strong><p class="live-username-${u.uid}" style="font-size:13px; color:#888;">@${cleanUsername}</p></div></div>`; });
        html += '</div>';
    }
    if (matchedVideos.length > 0) {
        html += '<h4 style="padding: 10px 15px; color:#888; font-size:14px; text-transform:uppercase;">Videos</h4><div class="grid-container">';
        html += matchedVideos.map(v => { const authorData = getUserData(v.authorUid, v.authorName, v.authorUsername || v.authorName, v.authorPic, v.authorVerified); const vBadge = getVerifiedBadge(v.authorVerified); const previewSrc = v.mediaType === 'images' && v.urls ? v.urls[0] : `${v.url}#t=0.5`; const mediaTag = v.mediaType === 'images' ? `<img src="${previewSrc}" style="width:100%; height:100%; object-fit:cover;">` : `<video src="${previewSrc}" muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>`; const icon = v.mediaType === 'images' ? 'fa-images' : 'fa-play'; return `<div class="grid-item" onclick="jumpToVideo('${v.id}')">${mediaTag}<div class="grid-views" style="font-size: 11px;"><i class="fas ${icon}"></i> ${v.likedBy ? v.likedBy.length : 0} @${authorData.username}${vBadge}</div></div>`; }).join('');
        html += '</div>';
    }
    if (matchedUsers.length === 0 && matchedVideos.length === 0) { html = '<div style="text-align: center; margin-top: 50px; color: #555;">Nichts gefunden</div>'; } resultsGrid.innerHTML = html;
});

document.getElementById('tab-notifications')?.addEventListener('click', function() { this.classList.add('active'); document.getElementById('tab-messages').classList.remove('active'); document.getElementById('tab-support').classList.remove('active'); document.getElementById('inbox-notifications-box').style.display = 'flex'; document.getElementById('inbox-messages-box').style.display = 'none'; document.getElementById('inbox-support-box').style.display = 'none'; });
document.getElementById('tab-messages')?.addEventListener('click', function() { this.classList.add('active'); document.getElementById('tab-notifications').classList.remove('active'); document.getElementById('tab-support').classList.remove('active'); document.getElementById('inbox-notifications-box').style.display = 'none'; document.getElementById('inbox-messages-box').style.display = 'flex'; document.getElementById('inbox-support-box').style.display = 'none'; });
document.getElementById('tab-support')?.addEventListener('click', function() { this.classList.add('active'); document.getElementById('tab-notifications').classList.remove('active'); document.getElementById('tab-messages').classList.remove('active'); document.getElementById('inbox-notifications-box').style.display = 'none'; document.getElementById('inbox-messages-box').style.display = 'none'; document.getElementById('inbox-support-box').style.display = 'flex'; });

let inboxUnsubscribe = null; let isInitialNotifLoad = true;
function initInbox() {
    const inboxBox = document.getElementById('inbox-notifications-box'); if (!currentUser) return; if (inboxUnsubscribe) inboxUnsubscribe(); isInitialNotifLoad = true;
    inboxUnsubscribe = onSnapshot(query(collection(db, "users", currentUser.uid, "notifications"), orderBy("timestamp", "desc")), (snapshot) => {
        let blocked = (currentUser && currentUser.blockedUsers) ? currentUser.blockedUsers : [];
        if (!isInitialNotifLoad) { snapshot.docChanges().forEach((change) => { if (change.type === "added") { const n = change.doc.data(); if(blocked.includes(n.fromUid)) return; const isCurrentlyChatting = document.getElementById('view-dm').classList.contains('active') && window.currentChatPartner && window.currentChatPartner.uid === n.fromUid; if (!isCurrentlyChatting) { const nUser = getUserData(n.fromUid, n.fromName, n.fromUsername, n.fromPic, false); let toastMsg = `🔔 Aktivität von @${nUser.username}`; if (n.type === 'message') toastMsg = `💬 Nachricht von @${nUser.username}`; else if (n.type === 'like') toastMsg = `❤️ @${nUser.username} mag dein Post`; else if (n.type === 'follow') toastMsg = `👤 @${nUser.username} folgt dir`; else if (n.type === 'gift') toastMsg = `🎁 @${nUser.username} hat gespendet!`; else if (n.type === 'comment') toastMsg = `💬 @${nUser.username} hat kommentiert`; showToast(toastMsg); window.sendDesktopNotification("Phil Shorts", toastMsg, n.type); } } }); }
        isInitialNotifLoad = false; inboxBox.innerHTML = '';
        let validNotifs = []; snapshot.forEach((doc) => { const n = doc.data(); if(!blocked.includes(n.fromUid)) validNotifs.push(n); });
        if (validNotifs.length === 0) { inboxBox.innerHTML = '<div class="empty-state" style="height: 100%;"><p>Keine neuen Benachrichtigungen</p></div>'; return; }
        validNotifs.forEach((n) => {
            let icon = 'fa-bell'; let color = '#aaa'; if (n.type === 'like') { icon = 'fa-heart'; color = '#ff0050'; } if (n.type === 'follow') { icon = 'fa-user-plus'; color = '#00f2fe'; } if (n.type === 'comment') { icon = 'fa-comment-dots'; color = '#fff'; } if (n.type === 'gift') { icon = 'fa-gift'; color = '#ffd700'; } if (n.type === 'message') { icon = 'fa-envelope'; color = '#00f2fe'; }
            const nUser = getUserData(n.fromUid, n.fromName, n.fromUsername, n.fromPic, false); let clickAction = `openProfile('${n.fromUid}')`; if (n.type === 'message') clickAction = `openDM('${n.fromUid}', '${nUser.username.replace(/'/g, "\\'")}', '${nUser.pic}')`; else if (n.videoId) clickAction = `jumpToVideo('${n.videoId}')`; const isVerif = getVerifiedBadge(nUser.verified); let nameClass = nUser.philPlusUntil && nUser.philPlusUntil > Date.now() && nUser.philPlusTier >= 1 ? "name-phil-plus" : "";
            inboxBox.innerHTML += `<div class="inbox-msg" onclick="${clickAction}"><img src="${nUser.pic}" class="chat-avatar live-pic-${n.fromUid}" style="flex-shrink:0;"><div style="flex:1; min-width:0;"><span class="chat-username" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><span class="live-name-${n.fromUid} ${nameClass}">${nUser.displayName}${isVerif}</span></span><div class="chat-bubble" style="background: transparent; padding: 0;">${formatText(n.text)}</div><div class="chat-time" style="font-size: 11px; color: #666; margin-top: 4px;">${timeAgo(n.timestamp)}</div></div></div>`;
        });
    });
}

let inboxChatsUnsubscribe = null;
function initInboxChats() {
    if (!currentUser) return; const msgBox = document.getElementById('inbox-messages-box'); if (inboxChatsUnsubscribe) inboxChatsUnsubscribe();
    inboxChatsUnsubscribe = onSnapshot(collection(db, "chats"), (snapshot) => {
        let blocked = (currentUser && currentUser.blockedUsers) ? currentUser.blockedUsers : [];
        let chats = []; snapshot.forEach(doc => { const chat = doc.data(); if (chat.participants && chat.participants.includes(currentUser.uid)) { const partnerUid = chat.participants.find(uid => uid !== currentUser.uid); if(!blocked.includes(partnerUid)) chats.push({ id: doc.id, ...chat }); } }); 
        chats.sort((a, b) => b.lastMessageTime - a.lastMessageTime); msgBox.innerHTML = '';
        if (chats.length === 0) { msgBox.innerHTML = '<div class="empty-state" style="height:100%;"><p>Keine Nachrichten</p></div>'; return; }
        
        chats.forEach(chat => {
            const partnerUid = chat.participants.find(uid => uid !== currentUser.uid); 
            const partner = chat.users[partnerUid]; if (!partner) return; 
            const nUser = getUserData(partnerUid, partner.name, partner.name, partner.pic, false); 
            const safeName = nUser.username.replace(/'/g, "\\'"); 
            const isVerif = getVerifiedBadge(nUser.verified); 
            let nameClass = nUser.philPlusUntil && nUser.philPlusUntil > Date.now() && nUser.philPlusTier >= 1 ? "name-phil-plus" : "";
            
            let previewText = chat.lastMessage; if(previewText && previewText.startsWith('[IMAGE]')) previewText = "📸 Bild gesendet";
            let isUnread = chat.lastMessageSender === partnerUid && chat.lastMessageRead === false;
            let fontWeight = isUnread ? "bold" : "normal";
            let colorMsg = isUnread ? "white" : "#888";
            let unreadDot = isUnread ? '<div style="width:10px; height:10px; background:#ff0050; border-radius:50%; margin-left:auto;"></div>' : '';
            
            let partnerData = allKnownUsers.find(u => u.uid === partnerUid);
            let showReadReceipts = checkPhilPlusStatus(2) || (partnerData && partnerData.philPlusUntil > Date.now() && partnerData.philPlusTier >= 2);
            let tickHtml = '';
            if (chat.lastMessageSender === currentUser.uid && showReadReceipts) {
                tickHtml = chat.lastMessageRead ? '<span style="color:#00f2fe; margin-right:4px;">✓✓</span>' : '<span style="color:#888; margin-right:4px;">✓</span>';
            }
            
            msgBox.innerHTML += `<div class="inbox-msg" onclick="openDM('${partnerUid}', '${safeName}', '${nUser.pic}')"><img src="${nUser.pic}" class="chat-avatar live-pic-${partnerUid}" style="flex-shrink:0;"><div style="flex:1; min-width:0;"><span class="chat-username" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><span class="live-name-${partnerUid} ${nameClass}">${nUser.displayName}${isVerif}</span></span><div class="chat-bubble" style="background: transparent; padding: 0; color: ${colorMsg}; font-weight: ${fontWeight};">${tickHtml}${formatText(previewText) || 'Neuer Chat...'}</div><div class="chat-time" style="font-size: 11px; color: #666; margin-top: 4px;">${timeAgo(chat.lastMessageTime)}</div></div>${unreadDot}</div>`;
        });
    });
}

let supportUnsubscribe = null;
window.initSupportTickets = function() {
    if (!currentUser) return; const supportBox = document.getElementById('inbox-support-box'); const isAdmin = (currentUser.email === "schleimyverteilung@gmail.com" || currentUser.isAdmin);
    if (supportUnsubscribe) supportUnsubscribe();
    supportUnsubscribe = onSnapshot(query(collection(db, "reports"), orderBy("timestamp", "desc")), (snapshot) => {
        supportBox.innerHTML = ''; let foundAny = false;
        snapshot.forEach(docSnap => {
            const ticket = docSnap.data(); if (!isAdmin && ticket.uid !== currentUser.uid) return; foundAny = true;
            const ticketId = docSnap.id; const isVip = ticket.hasPlus ? 'vip' : ''; 
            let plusText = ticket.tier === 3 ? "PLUS+++" : (ticket.tier === 2 ? "PLUS++" : "PLUS");
            const vipBadge = ticket.hasPlus ? `<span class="phil-plus-badge" style="font-size:9px; margin-left:5px;">${plusText}</span>` : ''; 
            const uData = getUserData(ticket.uid, ticket.name, ticket.name, 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback', false);
            let adminButtons = '';
            if (isAdmin) {
                if (ticket.status === 'closed') adminButtons = `<button class="profile-action-btn edit-btn" onclick="deleteTicket(event, '${ticketId}')" style="min-height:26px; font-size:11px; background:transparent; border:1px solid #ff4444; color:#ff4444; padding:0 8px;"><i class="fas fa-trash"></i> Löschen</button>`;
                else adminButtons = `<button class="profile-action-btn edit-btn" onclick="resolveTicket(event, '${ticketId}')" style="min-height:26px; font-size:11px; background:transparent; border:1px solid #ffd700; color:#ffd700; padding:0 8px;"><i class="fas fa-lock"></i> Schließen</button>`;
            }
            supportBox.innerHTML += `<div class="support-ticket ${isVip}" onclick="openTicketChat('${ticketId}', '${uData.username.replace(/'/g, "\\'")}', '${ticket.uid}')" style="cursor:pointer; display:flex; flex-direction:column; gap:8px;"><div style="display:flex; justify-content:space-between; align-items:center;"><strong style="color:white; font-size:14px;">@${uData.username} ${vipBadge}</strong><span style="color:#888; font-size:11px;">${timeAgo(ticket.timestamp)}</span></div><div style="display:flex; justify-content:space-between; align-items:center;"><div style="font-size:12px; color:#aaa;"><i class="fas fa-ticket-alt"></i> Status: <span style="color:${ticket.status === 'closed' ? '#ff4444' : '#39ff14'}; font-weight:bold;">${ticket.status === 'closed' ? 'Geschlossen' : 'Offen'}</span></div>${adminButtons}</div></div>`;
        });
        if (!foundAny) supportBox.innerHTML = '<div class="empty-state" style="height:100%;"><i class="fas fa-check-circle" style="color:#00f2fe; font-size:40px; margin-bottom:10px;"></i><p>Keine Support-Tickets gefunden!</p></div>';
    });
}

window.resolveTicket = async function(event, ticketId) { event.stopPropagation(); if(confirm("Ticket schließen?")) { await updateDoc(doc(db, "reports", ticketId), { status: 'closed' }); showToast("Geschlossen."); } };
window.deleteTicket = async function(event, ticketId) { event.stopPropagation(); if(confirm("Ticket löschen?")) { await deleteDoc(doc(db, "reports", ticketId)); showToast("Gelöscht."); } };

let currentTicketSnapshot = null; let currentTicketMetaSnapshot = null; window.currentActiveTicketId = null;
window.openTicketChat = async function(ticketId, username, ticketOwnerUid) {
    if (!currentUser) return; window.currentActiveTicketId = ticketId; document.getElementById('ticket-title').innerText = "Ticket: @" + username; switchView('ticket');
    const ticketBox = document.getElementById('ticket-box'); ticketBox.innerHTML = '<div class="loading-screen"><i class="fas fa-circle-notch fa-spin"></i></div>';
    const isAdmin = (currentUser.email === "schleimyverteilung@gmail.com" || currentUser.isAdmin);
    if (currentTicketSnapshot) currentTicketSnapshot(); if (currentTicketMetaSnapshot) currentTicketMetaSnapshot();
    currentTicketSnapshot = onSnapshot(query(collection(db, `reports/${ticketId}/messages`), orderBy("timestamp", "asc")), (snapshot) => {
        ticketBox.innerHTML = '';
        if (snapshot.empty) ticketBox.innerHTML = '<div class="empty-state" style="height:100%;"><p>Keine Nachrichten</p></div>'; 
        else {
            snapshot.forEach(docSnap => {
                const msg = docSnap.data(); const isMe = msg.senderUid === currentUser.uid ? 'me' : ''; const isSupportSender = msg.senderUid !== ticketOwnerUid;
                const pic = isSupportSender ? 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin' : (msg.senderUid === currentUser.uid ? currentUser.photoURL : `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.senderUid}`);
                let bg = isMe ? '#ff0050' : '#333'; let adminLabel = isSupportSender ? '<div style="font-size:10px; color:#ffd700; margin-bottom:4px;"><i class="fas fa-shield-alt"></i> Support Team</div>' : '';
                ticketBox.innerHTML += `<div class="chat-msg ${isMe}"><img src="${pic}" class="chat-avatar" style="flex-shrink:0;"><div style="min-width:0; max-width: 100%;"><div class="chat-bubble" style="background:${bg}; border-color:${bg};">${adminLabel}${formatText(msg.text)}</div><div class="chat-time" style="font-size: 10px; color: #666; margin-top: 4px; text-align: ${isMe ? 'right' : 'left'};">${timeAgo(msg.timestamp)}</div></div></div>`;
            });
        }
        ticketBox.scrollTop = ticketBox.scrollHeight;
    });
    currentTicketMetaSnapshot = onSnapshot(doc(db, "reports", ticketId), (docSnap) => {
        const statEl = document.getElementById('ticket-status');
        if(docSnap.exists()) {
            const tData = docSnap.data(); 
            if(tData.status === 'closed') { statEl.innerText = "Geschlossen"; statEl.style.background = "#ff4444"; statEl.style.color = "white"; document.getElementById('ticket-input-area').style.display = 'none'; document.getElementById('admin-close-ticket-btn').style.display = 'none'; } 
            else { statEl.innerText = "Offen"; statEl.style.background = "#39ff14"; statEl.style.color = "black"; document.getElementById('ticket-input-area').style.display = 'flex'; document.getElementById('admin-close-ticket-btn').style.display = isAdmin ? 'block' : 'none'; }
        } else { statEl.innerText = "Gelöscht"; statEl.style.background = "#ff4444"; document.getElementById('ticket-input-area').style.display = 'none'; document.getElementById('admin-close-ticket-btn').style.display = 'none'; }
    });
};

document.getElementById('send-ticket-btn')?.addEventListener('click', async() => { const input = document.getElementById('ticket-input'); const text = input.value.trim(); if (!text || !window.currentActiveTicketId || !currentUser) return; input.value = ''; await addDoc(collection(db, `reports/${window.currentActiveTicketId}/messages`), { senderUid: currentUser.uid, text: text, timestamp: Date.now() }); });
document.getElementById('ticket-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('send-ticket-btn').click(); });
document.getElementById('admin-close-ticket-btn')?.addEventListener('click', async() => { if(!window.currentActiveTicketId) return; if(confirm("Ticket schließen?")) { await updateDoc(doc(db, "reports", window.currentActiveTicketId), { status: 'closed' }); showToast("Ticket geschlossen."); } });

// === DM KONTEXT MENÜ LOKIK ===
window.dmPressTimer = null;
window.dmReplyTarget = null;
window.currentEditDMId = null;

window.openDMContextMenu = function(msgId, senderUid, text) {
    if(!currentUser) return;
    const isOwner = currentUser.uid === senderUid;
    let html = '';
    
    html += `<button class="profile-action-btn edit-btn" onclick="copyDM('${text.replace(/'/g, "\\'")}')"><i class="fas fa-copy"></i> Kopieren</button>`;
    html += `<button class="profile-action-btn edit-btn" onclick="replyDM('${msgId}', '${text.replace(/'/g, "\\'")}', '${senderUid}')"><i class="fas fa-reply"></i> Antworten</button>`;
    
    if (isOwner) {
        html += `<button class="profile-action-btn edit-btn" onclick="openEditDMModal('${msgId}', '${text.replace(/'/g, "\\'")}')"><i class="fas fa-pen"></i> Bearbeiten</button>`;
        html += `<button class="profile-action-btn" style="background:#ff4444; color:white;" onclick="deleteDM('${msgId}')"><i class="fas fa-trash"></i> Löschen</button>`;
    } else {
        html += `<button class="profile-action-btn" style="background:#ff4444; color:white;" onclick="reportDM('${msgId}', '${senderUid}', '${text.replace(/'/g, "\\'")}')"><i class="fas fa-flag"></i> Melden</button>`;
    }
    
    document.getElementById('dm-context-content').innerHTML = html;
    document.getElementById('dm-context-modal').classList.add('show');
};

window.copyDM = function(text) {
    navigator.clipboard.writeText(text);
    showToast("Nachricht kopiert!");
    document.getElementById('dm-context-modal').classList.remove('show');
};

window.replyDM = function(msgId, text, senderUid) {
    const sender = allKnownUsers.find(u => u.uid === senderUid) || window.currentChatPartner;
    window.dmReplyTarget = { id: msgId, text: text, name: sender ? sender.displayName : 'User' };
    document.getElementById('dm-reply-name').innerText = window.dmReplyTarget.name;
    document.getElementById('dm-reply-text').innerText = text;
    document.getElementById('dm-reply-preview').style.display = 'flex';
    document.getElementById('dm-context-modal').classList.remove('show');
    document.getElementById('dm-input').focus();
};

document.getElementById('close-dm-reply')?.addEventListener('click', () => {
    window.dmReplyTarget = null;
    document.getElementById('dm-reply-preview').style.display = 'none';
});

window.deleteDM = async function(msgId) {
    if(confirm("Möchtest du diese Nachricht für alle löschen?")) {
        try {
            await deleteDoc(doc(db, `chats/${window.currentChatId}/messages`, msgId));
            showToast("Nachricht gelöscht.");
            document.getElementById('dm-context-modal').classList.remove('show');
        } catch(e) { showCustomAlert("Fehler", "Konnte nicht gelöscht werden."); }
    }
};

window.reportDM = async function(msgId, senderUid, text) {
    if (!currentUser) return;
    try {
        const ticketRef = await addDoc(collection(db, "reports"), { 
            uid: currentUser.uid, 
            name: currentUser.displayName, 
            hasPlus: checkPhilPlusStatus(1), 
            tier: currentUser.philPlusTier || 0, 
            status: 'open', 
            type: 'dm_report',
            reportedUser: senderUid,
            timestamp: Date.now() 
        }); 
        
        await addDoc(collection(db, `reports/${ticketRef.id}/messages`), { 
            senderUid: currentUser.uid, 
            text: `[SYSTEM] DM MELDUNG:\nChat-ID: ${window.currentChatId}\nNachricht: "${text}"`, 
            timestamp: Date.now() 
        });

        showToast("Nachricht gemeldet! Ticket erstellt.");
    } catch(e) {
        showCustomAlert("Fehler", "Meldung fehlgeschlagen.");
    }
    document.getElementById('dm-context-modal').classList.remove('show');
};

window.openEditDMModal = function(msgId, oldText) {
    window.currentEditDMId = msgId;
    document.getElementById('dm-edit-input').value = oldText;
    document.getElementById('dm-context-modal').classList.remove('show');
    document.getElementById('dm-edit-modal').classList.add('show');
};

document.getElementById('save-dm-edit-btn')?.addEventListener('click', async () => {
    const newText = document.getElementById('dm-edit-input').value.trim();
    if(!newText || !window.currentEditDMId) return;
    try {
        await updateDoc(doc(db, `chats/${window.currentChatId}/messages`, window.currentEditDMId), {
            text: newText,
            edited: true
        });
        showToast("Nachricht bearbeitet.");
        document.getElementById('dm-edit-modal').classList.remove('show');
    } catch(e) { showCustomAlert("Fehler", "Konnte nicht bearbeitet werden."); }
});

let currentDMSnapshot = null; window.currentChatId = null; window.currentChatPartner = null;
window.openDM = async function(targetUid, targetName, targetPic) {
    if (!currentUser) return; 

    // DM PRIVACY CHECK
    const tUser = allKnownUsers.find(u => u.uid === targetUid);
    if(tUser) {
        const privacy = tUser.dmPrivacy || 'everyone';
        if(privacy === 'off') {
            showCustomAlert("Privatsphäre", "Dieser Nutzer empfängt momentan keine Nachrichten.");
            return;
        }
        if(privacy === 'friends') {
            const theyFollowMe = tUser.following && tUser.following.includes(currentUser.uid);
            const iFollowThem = currentUser.following && currentUser.following.includes(targetUid);
            if(!theyFollowMe || !iFollowThem) {
                showCustomAlert("Privatsphäre", "Ihr müsst euch gegenseitig folgen (Freunde sein), um Nachrichten zu senden.");
                return;
            }
        }
    }

    window.currentChatPartner = { uid: targetUid, name: targetName, pic: targetPic }; const uids = [currentUser.uid, targetUid].sort(); window.currentChatId = `${uids[0]}_${uids[1]}`; const nUser = getUserData(targetUid, targetName, targetName, targetPic, false); const isVerif = getVerifiedBadge(nUser.verified);
    document.getElementById('dm-name-span').innerHTML = '@' + targetName + ' ' + isVerif; switchView('dm');
    
    let statusHtml = ''; if(nUser.lastActive) { let diff = Date.now() - nUser.lastActive; statusHtml = diff < 5 * 60000 ? '<span style="color:#39ff14;">🟢 Online</span>' : 'Zuletzt online: ' + timeAgo(nUser.lastActive); }
    document.getElementById('dm-status-span').innerHTML = statusHtml;

    if (currentDMSnapshot) currentDMSnapshot(); const dmBox = document.getElementById('dm-box'); dmBox.innerHTML = '<div class="loading-screen"><i class="fas fa-circle-notch fa-spin"></i></div>';
    const chatRef = doc(db, "chats", window.currentChatId); const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) await setDoc(chatRef, { participants: [currentUser.uid, targetUid], users: { [currentUser.uid]: { name: currentUser.displayName, pic: currentUser.photoURL }, [targetUid]: { name: targetName, pic: targetPic } }, lastMessage: "", lastMessageTime: Date.now(), lastMessageRead: false });
    
    let showReadReceipts = checkPhilPlusStatus(2);
    if (!showReadReceipts) {
        const tDoc = await getDoc(doc(db, "users", targetUid));
        if (tDoc.exists() && tDoc.data().philPlusUntil > Date.now() && tDoc.data().philPlusTier >= 2) {
            showReadReceipts = true;
        }
    }
    
    currentDMSnapshot = onSnapshot(query(collection(db, `chats/${window.currentChatId}/messages`), orderBy("timestamp", "asc")), (snapshot) => {
        dmBox.innerHTML = '';
        let unreadIds = [];
        if (snapshot.empty) dmBox.innerHTML = '<div class="empty-state" style="height:100%;"><p>Schreib die erste Nachricht!</p></div>'; 
        else { 
            snapshot.forEach(docSnap => { 
                const msg = docSnap.data(); const isMe = msg.senderUid === currentUser.uid ? 'me' : ''; const pic = isMe ? currentUser.photoURL : targetPic; 
                if (!isMe && !msg.read) unreadIds.push(docSnap.id);
                
                let readReceipt = '';
                if (isMe && showReadReceipts) {
                    readReceipt = msg.read ? `<span style="font-size:10px; color:#00f2fe; margin-left:5px; font-weight:bold; letter-spacing:-2px;">✓✓</span>` : `<span style="font-size:10px; color:#888; margin-left:5px; font-weight:bold;">✓</span>`;
                }

                let replyHtml = '';
                if (msg.replyTo) {
                    replyHtml = `<div class="chat-reply-quote" onclick="document.getElementById('dm-reply-preview').style.display='none';"><strong>${msg.replyTo.name}</strong><br>${formatText(msg.replyTo.text)}</div>`;
                }

                let editedHtml = msg.edited ? `<span style="font-size:10px; color:#888; margin-left:5px;">(bearbeitet)</span>` : '';
                let extraClass = isMe && checkPhilPlusStatus(2) ? 'gold-bubble' : ''; 
                let bubbleContent = formatDMText(msg.text);

                let safeText = msg.text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                let interactions = `oncontextmenu="event.preventDefault(); window.openDMContextMenu('${docSnap.id}', '${msg.senderUid}', '${safeText}');"`;
                interactions += ` onmousedown="window.dmPressTimer = setTimeout(() => { window.openDMContextMenu('${docSnap.id}', '${msg.senderUid}', '${safeText}'); }, 500);" onmouseup="clearTimeout(window.dmPressTimer)" onmouseleave="clearTimeout(window.dmPressTimer)" ontouchstart="window.dmPressTimer = setTimeout(() => { window.openDMContextMenu('${docSnap.id}', '${msg.senderUid}', '${safeText}'); }, 500);" ontouchend="clearTimeout(window.dmPressTimer)"`;

                dmBox.innerHTML += `<div class="chat-msg ${isMe}"><img src="${pic}" class="chat-avatar" style="flex-shrink:0;"><div style="min-width:0; max-width: 100%;"><div class="chat-bubble ${extraClass}" ${interactions} style="cursor:pointer;">${replyHtml}${bubbleContent}${editedHtml}</div><div class="chat-time" style="font-size: 10px; color: #666; margin-top: 4px; text-align: ${isMe ? 'right' : 'left'};">${timeAgo(msg.timestamp)}${readReceipt}</div></div></div>`; 
            }); 
        }
        dmBox.scrollTop = dmBox.scrollHeight;
        
        window.processEmbeds();

        if (unreadIds.length > 0) {
            unreadIds.forEach(id => updateDoc(doc(db, `chats/${window.currentChatId}/messages`, id), { read: true }));
            updateDoc(doc(db, "chats", window.currentChatId), { lastMessageRead: true });
        }
    });
};

document.getElementById('send-dm-btn')?.addEventListener('click', async() => { 
    const input = document.getElementById('dm-input'); 
    const text = input.value.trim(); 
    if (!text || !window.currentChatId || !currentUser) return; 
    input.value = ''; 

    let msgObj = { senderUid: currentUser.uid, text: text, timestamp: Date.now(), read: false };
    if(window.dmReplyTarget) {
        msgObj.replyTo = window.dmReplyTarget;
        window.dmReplyTarget = null;
        document.getElementById('dm-reply-preview').style.display = 'none';
    }

    await addDoc(collection(db, `chats/${window.currentChatId}/messages`), msgObj); 

    await updateDoc(doc(db, "chats", window.currentChatId), { 
        lastMessage: text, 
        lastMessageTime: Date.now(), 
        lastMessageSender: currentUser.uid, 
        lastMessageRead: false, 
        users: { [currentUser.uid]: { name: currentUser.displayName, pic: currentUser.photoURL }, [window.currentChatPartner.uid]: { name: window.currentChatPartner.name, pic: window.currentChatPartner.pic } } 
    }); 
    addNotification(window.currentChatPartner.uid, "message", `hat geschrieben: "${text}"`); 
});
document.getElementById('dm-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('send-dm-btn').click(); });

let duetStream = null; let duetRecorder = null; let duetChunks = []; window.duetVideoId = null;

window.openDuet = async function(vidId) {
    if(!currentUser) return showCustomAlert("Fehler", "Bitte einloggen!");
    const v = allVideosData.find(x => x.id === vidId); if(!v || v.mediaType !== 'video') return showCustomAlert("Hinweis", "Duetts gehen nur mit echten Videos.");
    window.duetVideoId = vidId; switchView('duet');
    const origVid = document.getElementById('duet-orig-video'); origVid.src = v.url; origVid.loop = true; origVid.style.display = 'block'; document.getElementById('duet-cam-video').style.width = '50%';
    document.getElementById('comment-reply-overlay').style.display = 'none'; 
    try {
        duetStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('duet-cam-video').srcObject = duetStream;
    } catch(e) { showCustomAlert("Kamera-Fehler", "Kamera konnte nicht gestartet werden."); }
}

window.closeDuet = function() {
    switchView('feed');
    if(duetStream) duetStream.getTracks().forEach(t => t.stop());
    const origVid = document.getElementById('duet-orig-video'); origVid.pause(); origVid.src = "";
    document.getElementById('duet-cam-video').srcObject = null;
    document.getElementById('comment-reply-overlay').style.display = 'none';
}

document.getElementById('duet-record-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('duet-record-btn'); const icon = document.getElementById('duet-record-icon'); const status = document.getElementById('duet-status');
    const origVid = document.getElementById('duet-orig-video'); const camVid = document.getElementById('duet-cam-video');
    const canvas = document.getElementById('duet-canvas'); const ctx = canvas.getContext('2d');
    
    if(btn.classList.contains('recording')) {
        btn.classList.remove('recording'); icon.className = "fas fa-video"; btn.style.borderRadius = "50%";
        if(duetRecorder) duetRecorder.stop(); origVid.pause();
    } else {
        btn.classList.add('recording'); icon.className = "fas fa-square"; btn.style.borderRadius = "20%";
        status.innerText = "Nimmt auf..."; origVid.currentTime = 0; origVid.play();
        
        canvas.width = 720; canvas.height = 1280;
        const canvasStream = canvas.captureStream(30);
        
        const audioCtx = new AudioContext(); const dest = audioCtx.createMediaStreamDestination();
        const src1 = audioCtx.createMediaElementSource(origVid); src1.connect(dest);
        const src2 = audioCtx.createMediaStreamSource(duetStream); src2.connect(dest);
        dest.stream.getAudioTracks().forEach(t => canvasStream.addTrack(t));

        duetChunks = [];
        duetRecorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm' });
        duetRecorder.ondataavailable = e => { if(e.data.size > 0) duetChunks.push(e.data); };
        duetRecorder.onstop = async () => {
            status.innerText = "Verarbeite Video...";
            const finalBlob = new Blob(duetChunks, { type: 'video/webm' });
            const file = new File([finalBlob], "video.webm", { type: 'video/webm' });
            try {
                const finalUrl = await uploadFileToFirebase(file, 'videos');
                const v = allVideosData.find(x => x.id === window.duetVideoId);
                
                const isCommentReply = document.getElementById('comment-reply-overlay').style.display === 'block';
                let videoTitle = isCommentReply ? `Antwort auf einen Kommentar` : `Duett mit @${v.authorUsername}`;
                let videoDesc = isCommentReply ? `Antwort auf den Kommentar` : `#duett @${v.authorUsername}`;
                
                awardXP(20); 
                
                await addDoc(collection(db, "videos"), { mediaType: 'video', url: finalUrl, authorUid: currentUser.uid, authorName: currentUser.displayName, authorUsername: currentUser.username, authorPic: currentUser.photoURL, authorVerified: currentUser.verified || false, title: videoTitle, description: videoDesc, likedBy: [], gifts: 0, comments: [], views: 0, timestamp: Date.now() });
                showToast("Video veröffentlicht!"); closeDuet();
            } catch(err) { showCustomAlert("Fehler", "Video Upload fehlgeschlagen."); status.innerText = ""; }
        };
        
        duetRecorder.start();
        function drawFrame() {
            if(!btn.classList.contains('recording')) return;
            ctx.fillStyle = "black"; ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const isCommentReply = document.getElementById('comment-reply-overlay').style.display === 'block';
            
            if(isCommentReply) {
                ctx.save(); ctx.translate(720, 0); ctx.scale(-1, 1); ctx.drawImage(camVid, 0, 0, 720, 1280); ctx.restore();
            } else {
                ctx.drawImage(origVid, 0, 0, 360, 1280);
                ctx.save(); ctx.translate(1080, 0); ctx.scale(-1, 1); ctx.drawImage(camVid, 0, 0, 360, 1280); ctx.restore();
            }
            requestAnimationFrame(drawFrame);
        }
        drawFrame();
    }
});

// === EMAIL & PASSWORT AUTH ===
let isRegisterMode = false;
let generatedOTP = null;
let pendingRegData = null;

// Trage hier deine EmailJS Daten ein
const EMAILJS_SERVICE_ID = "service_0w0m1ns";
const EMAILJS_TEMPLATE_ID = "template_ae1lp14";

window.sendEmailOTP = async function(email, code) {
    console.log("DEBUG: Code für " + email + " ist " + code);
    try {
        if(typeof emailjs !== 'undefined') {
            // Berechne die Uhrzeit in 15 Minuten
            const expirationTime = new Date(Date.now() + 15 * 60000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';

            // Hier schicken wir die korrekten Platzhalter an EmailJS
            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
                to_email: email,
                passcode: code,
                time: expirationTime
            });
            showToast("Code an E-Mail gesendet! 📧");
        } else {
            showToast("EmailJS fehlt. Code steht in der Konsole.");
        }
    } catch (err) {
        console.error(err);
        showToast("Email-Versand Fehler. Code in Konsole.");
    }
};

document.getElementById('auth-switch-register-btn')?.addEventListener('click', (e) => {
    isRegisterMode = !isRegisterMode;
    document.getElementById('auth-username').style.display = isRegisterMode ? 'block' : 'none';
    document.getElementById('auth-login-btn').innerText = isRegisterMode ? "Registrieren" : "Einloggen";
    e.target.innerText = isRegisterMode ? "Zurück zum Login" : "Neuen Account erstellen";
});

document.getElementById('auth-login-btn')?.addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const username = document.getElementById('auth-username').value.trim().toLowerCase();
    const btn = document.getElementById('auth-login-btn');

    if(!email || !password) return showCustomAlert("Fehler", "Bitte alle Felder ausfüllen.");

    btn.disabled = true;
    btn.innerText = "Lädt...";

    try {
        if(isRegisterMode) {
            if(password.length < 6) throw new Error("Passwort muss mind. 6 Zeichen lang sein.");
            if(username.length < 3) throw new Error("Benutzername muss mind. 3 Zeichen lang sein.");

            const nameSnap = await getDocs(query(collection(db, "users"), where("username", "==", username)));
            if (!nameSnap.empty) throw new Error("Dieser Benutzername ist bereits vergeben.");

            generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
            pendingRegData = { email, password, username };

            console.log("\n=============================================");
            console.log("🔐 DEIN PHIL SHORTS BESTÄTIGUNGSCODE IST: " + generatedOTP);
            console.log("=============================================\n");

            await window.sendEmailOTP(email, generatedOTP);

            document.getElementById('login-input-section').style.display = 'none';
            document.getElementById('google-login-container').style.display = 'none';
            document.getElementById('otp-section').style.display = 'flex';
        } else {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
            if(userDoc.exists()) {
                currentUser = userDoc.data();
                if (currentUser.banned) {
                    auth.signOut();
                    throw new Error("Dein Account wurde gesperrt.");
                }
                localStorage.setItem('phil_session', JSON.stringify(currentUser));
                document.getElementById('login-screen').classList.remove('show');
                window.location.reload();
            } else {
                throw new Error("Benutzerdaten nicht gefunden.");
            }
        }
    } catch (error) {
        let msg = error.message;
        if(error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') msg = "E-Mail oder Passwort ist falsch.";
        if(error.code === 'auth/invalid-email') msg = "Ungültige E-Mail Adresse.";
        if(error.code === 'auth/email-already-in-use') msg = "Diese E-Mail ist bereits registriert.";
        showCustomAlert("Fehler", msg);
    } finally {
        btn.disabled = false;
        btn.innerText = isRegisterMode ? "Registrieren" : "Einloggen";
    }
});

document.getElementById('auth-cancel-btn')?.addEventListener('click', () => {
    generatedOTP = null;
    pendingRegData = null;
    document.getElementById('auth-otp').value = '';
    document.getElementById('otp-section').style.display = 'none';
    document.getElementById('login-input-section').style.display = 'flex';
    document.getElementById('google-login-container').style.display = 'block';
});

document.getElementById('auth-verify-btn')?.addEventListener('click', async () => {
    const inputCode = document.getElementById('auth-otp').value.trim();
    if(inputCode !== generatedOTP) return showCustomAlert("Falscher Code", "Der eingegebene Code ist inkorrekt.");

    const btn = document.getElementById('auth-verify-btn');
    btn.disabled = true;
    btn.innerText = "Erstelle Account...";

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, pendingRegData.email, pendingRegData.password);
        const uid = userCredential.user.uid;

        const newUser = { 
            uid: uid, 
            displayName: pendingRegData.username, 
            username: pendingRegData.username, 
            email: pendingRegData.email, 
            photoURL: "https://api.dicebear.com/7.x/avataaars/svg?seed=" + uid, 
            bio: "Neu in der Community! 👋", 
            following: [], followers: [], savedVideos: [], blockedUsers: [], 
            socialLinks: { ig: '', yt: '', tw: '', tt: '' }, 
            verified: false, coins: 1000, xp: 0, streak: 1, profileViews: 0, 
            isAdmin: false, banned: false, decorations: [], activeBorder: "", stories: [], 
            appTheme: 'default', dmPrivacy: 'everyone', philPlusTier: 0, 
            lastLogin: new Date().toDateString(), lastActive: Date.now(), 
            customBorder: { c1: '#ff0050', c2: '#00f2fe', grad: true } 
        };

        await setDoc(doc(db, "users", uid), newUser);
        
        currentUser = newUser;
        localStorage.setItem('phil_session', JSON.stringify(currentUser));
        
        showToast("Erfolgreich registriert! 🎉");
        document.getElementById('login-screen').classList.remove('show');
        window.location.reload(); 
        
    } catch (error) {
        let msg = "Fehler bei der Registrierung.";
        if(error.code === 'auth/email-already-in-use') msg = "Diese E-Mail Adresse ist bereits vergeben!";
        showCustomAlert("Registrierung fehlgeschlagen", msg);
        document.getElementById('auth-cancel-btn').click();
    } finally {
        btn.disabled = false;
        btn.innerText = "Code Bestätigen";
    }
});

window.updateAccountSecurity = async function() {
    const newEmail = document.getElementById('settings-email-input').value.trim();
    const newPass = document.getElementById('settings-pass-input').value;
    const confirmPass = document.getElementById('settings-pass-confirm').value;

    if (!newEmail && !newPass) return showToast("Keine Änderungen eingetragen.");

    const user = auth.currentUser;
    if(!user && (newEmail || newPass)) return showCustomAlert("Sicherheit", "Bitte melde dich erneut an, um sensible Daten zu ändern.");

    try {
        let updates = {};
        if (newEmail) {
            if (!newEmail.includes('@')) return showCustomAlert("Fehler", "Ungültige E-Mail Adresse.");
            await updateEmail(user, newEmail);
            updates.email = newEmail;
        }

        if (newPass) {
            if (newPass.length < 6) return showCustomAlert("Fehler", "Passwort muss mind. 6 Zeichen haben.");
            if (newPass !== confirmPass) return showCustomAlert("Fehler", "Passwörter stimmen nicht überein.");
            await updatePassword(user, newPass);
        }

        if(Object.keys(updates).length > 0) {
            await updateDoc(doc(db, "users", currentUser.uid), updates);
            currentUser = { ...currentUser, ...updates };
            localStorage.setItem('phil_session', JSON.stringify(currentUser));
        }

        showToast("Sicherheitsdaten aktualisiert! 🛡️");
        document.getElementById('settings-email-input').value = "";
        document.getElementById('settings-pass-input').value = "";
        document.getElementById('settings-pass-confirm').value = "";
    } catch (e) {
        if(e.code === 'auth/requires-recent-login') {
            showCustomAlert("Sicherheit", "Bitte logge dich kurz aus und wieder ein, um diese Daten zu ändern.");
        } else {
            showCustomAlert("Fehler", "Daten konnten nicht gespeichert werden.");
        }
    }
};

function initResponsiveLayout() {
    const appContainer = document.querySelector('.app'); const originalNav = appContainer.querySelector('.app__bottom-nav'); let currentMode = ''; let pcSidebar = null;
    function createPCContainers() { if (!pcSidebar) { pcSidebar = document.createElement('div'); pcSidebar.id = 'pc-nav-sidebar'; pcSidebar.innerHTML = `<div class="logo-area"><img src="https://i.imgur.com/JDPRzCc.png" class="app-logo" alt="Logo">Phil Shorts</div>`; appContainer.prepend(pcSidebar); } }
    function restructureVideoForPC(videoEl) { const inner = videoEl.querySelector('.video-inner'); if (!inner) return; let infoPanel = inner.querySelector('.pc-info-panel-container'); if (!infoPanel) { infoPanel = document.createElement('div'); infoPanel.className = 'pc-info-panel-container'; inner.appendChild(infoPanel); const videoFooter = inner.querySelector('.video__footer'); const videoSidebar = inner.querySelector('.video__sidebar'); if (videoFooter) infoPanel.appendChild(videoFooter); if (videoSidebar) infoPanel.appendChild(videoSidebar); } }
    function rollBackVideoForHandy(videoEl) { const inner = videoEl.querySelector('.video-inner'); if (!inner) return; const infoPanel = inner.querySelector('.pc-info-panel-container'); if (infoPanel) { const videoFooter = infoPanel.querySelector('.video__footer'); const videoSidebar = infoPanel.querySelector('.video__sidebar'); if (videoFooter) inner.appendChild(videoFooter); if (videoSidebar) inner.appendChild(videoSidebar); infoPanel.remove(); } }
    function checkResponsiveMode() { const isPC = window.innerWidth > 768; if (isPC && currentMode !== 'pc') { currentMode = 'pc'; createPCContainers(); if (originalNav) pcSidebar.appendChild(originalNav); document.querySelectorAll('.app__videos .video').forEach(restructureVideoForPC); } else if (!isPC && currentMode !== 'handy') { currentMode = 'handy'; if (originalNav) appContainer.appendChild(originalNav); if (pcSidebar) { pcSidebar.remove(); pcSidebar = null; } document.querySelectorAll('.app__videos .video').forEach(rollBackVideoForHandy); } }
    checkResponsiveMode(); window.addEventListener('resize', checkResponsiveMode);
    if (window.innerWidth > 768) { 
        const videoObserver2 = new MutationObserver(function(mutations) { if (currentMode === 'pc') mutations.forEach(mutation => mutation.addedNodes.forEach(node => { if (node.classList && node.classList.contains('video')) restructureVideoForPC(node); })); }); const videoContainer = document.getElementById('video-container'); if (videoContainer) videoObserver2.observe(videoContainer, { childList: true }); 
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initResponsiveLayout); else initResponsiveLayout();

// =========================================================================
// 🔥 LIVE MANAGER & ZUSCHAUER LOGIK 🔥
// =========================================================================

// 1. DYNAMISCHES PREMIUM CSS FÜR DIE KARTEN INJIZIEREN
if (!document.getElementById('premium-live-styles')) {
    const style = document.createElement('style');
    style.id = 'premium-live-styles';
    style.innerHTML = `
        .ultra-live-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
        .premium-live-card { background: #111; border-radius: 16px; overflow: hidden; cursor: pointer; position: relative; border: 1px solid rgba(255,255,255,0.05); transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .premium-live-card:hover { transform: translateY(-5px) scale(1.02); border-color: #00f2fe; box-shadow: 0 15px 40px rgba(0, 242, 254, 0.2); }
        
        .card-thumbnail { position: relative; height: 280px; width: 100%; overflow: hidden; background: #000; display: flex; align-items: center; justify-content: center; }
        .thumb-bg { position: absolute; width: 100%; height: 100%; background-size: cover; background-position: center; filter: blur(20px) brightness(0.5); transform: scale(1.2); }
        .card-thumbnail img { position: relative; z-index: 1; height: 100%; width: 100%; object-fit: cover; }
        
        .live-badge-glow { position: absolute; top: 12px; left: 12px; background: rgba(255, 0, 80, 0.9); backdrop-filter: blur(10px); color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 800; letter-spacing: 1px; z-index: 2; display: flex; align-items: center; gap: 6px; box-shadow: 0 0 15px rgba(255,0,80,0.6); }
        .live-badge-glow i { animation: pulseLive 2s infinite; }
        .viewer-count { position: absolute; top: 12px; right: 12px; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(10px); color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; z-index: 2; border: 1px solid rgba(255,255,255,0.1); }
        
        .play-overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 40px; color: rgba(255,255,255,0.8); z-index: 2; opacity: 0; transition: 0.2s; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.5)); }
        .premium-live-card:hover .play-overlay { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
        
        .card-info { padding: 15px; background: linear-gradient(to top, rgba(10,10,10,1) 0%, rgba(20,20,20,0.8) 100%); position: absolute; bottom: 0; left: 0; width: 100%; z-index: 3; display: flex; gap: 12px; align-items: center; backdrop-filter: blur(10px); border-top: 1px solid rgba(255,255,255,0.05); }
        .card-info .avatar { width: 40px; height: 40px; border-radius: 50%; border: 2px solid #00f2fe; object-fit: cover; }
        .card-info .text-info { flex: 1; min-width: 0; }
        .card-info h4 { margin: 0; font-size: 14px; font-weight: 700; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 2px 4px rgba(0,0,0,0.8); }
        .card-info span { font-size: 12px; color: #aaa; font-weight: 500; }
    `;
    document.head.appendChild(style);
}

// 2. DER LIVE MANAGER (Rendert die Liste)
window.LiveManager = {
    unsubscribe: null,
    init: function() {
        const grid = document.getElementById('live-streams-grid');
        if(!grid) return;

        if (this.unsubscribe) this.unsubscribe();

        this.unsubscribe = onSnapshot(collection(db, "live_streams"), (snapshot) => {
            grid.innerHTML = ''; // Entfernt den Ladekreis

            if (snapshot.empty) {
                grid.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height: 60vh; text-align: center;">
                        <div style="width: 80px; height: 80px; border-radius: 50%; background: #111; display:flex; align-items:center; justify-content:center; margin-bottom: 20px; box-shadow: inset 0 0 20px rgba(0,0,0,0.8); border: 1px solid #222;">
                            <i class="fas fa-video-slash" style="font-size: 30px; color: #444;"></i>
                        </div>
                        <h3 style="color: white; margin-bottom: 8px;">Niemand ist live</h3>
                        <p style="font-size: 14px; color: #888;">Die Creator schlafen wahrscheinlich gerade. Zzz...</p>
                    </div>
                `;
                return;
            }

            let html = '<div class="ultra-live-grid">';
            snapshot.forEach(docSnap => {
                const stream = docSnap.data();
                html += `
                    <div class="premium-live-card" onclick="joinLiveStream('${docSnap.id}')">
                        <div class="card-thumbnail">
                            <div class="thumb-bg" style="background-image: url('${stream.broadcasterPic}')"></div>
                            <img src="${stream.broadcasterPic}">
                            <div class="live-badge-glow"><i class="fas fa-circle" style="font-size:8px;"></i> LIVE</div>
                            <div class="viewer-count"><i class="fas fa-eye"></i> ${stream.viewers || 0}</div>
                            <i class="fas fa-play-circle play-overlay"></i>
                            <div class="card-info">
                                <img src="${stream.broadcasterPic}" class="avatar">
                                <div class="text-info">
                                    <h4>${stream.title || 'Live Stream'}</h4>
                                    <span>@${stream.broadcasterName}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            grid.innerHTML = html;
        });
    }
};

// 3. STREAM BEITRETEN & WEBRTC LOGIK (🔥 LIVEKIT UPGRADE 🔥)
let currentRoom = null;
window.currentLiveStreamId = null;
window.currentLiveStreamerUid = null;
window.liveRoomUnsubscribes = [];
let currentLiveMods = [];

window.joinLiveStream = async function(streamId) {
    if(!currentUser) return showToast("Bitte erst einloggen!");
    
    window.currentLiveStreamId = streamId;
    switchView('live-room');
    
    const videoEl = document.getElementById('live-video-player');
    const offlineText = document.getElementById('live-stream-offline-text');
    
    if(videoEl) {
        videoEl.srcObject = null;
        
        // 🔥 PC Lautstärke Regler
        const volSlider = document.getElementById('live-pc-volume');
        if(volSlider) {
            videoEl.volume = volSlider.value;
            volSlider.oninput = (e) => {
                videoEl.volume = e.target.value;
                const icon = document.getElementById('live-vol-icon');
                if(icon) {
                    if(e.target.value == 0) icon.className = 'fas fa-volume-mute';
                    else if(e.target.value < 0.5) icon.className = 'fas fa-volume-down';
                    else icon.className = 'fas fa-volume-up';
                }
            };
        }
    }

    if(offlineText) {
        offlineText.style.display = 'flex';
        offlineText.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="font-size:40px; color:#00f2fe; margin-bottom:10px;"></i><span>Verbinde mit Live-Server...</span>';
    }
    
    const streamSnap = await getDoc(doc(db, "live_streams", streamId));
    if(!streamSnap.exists()) {
        showToast("Stream ist offline.");
        leaveLiveRoom();
        return;
    }
    const streamData = streamSnap.data();
    window.currentLiveStreamerUid = streamData.broadcasterUid;
    
    document.getElementById('live-broadcaster-pic').src = streamData.broadcasterPic || 'https://i.imgur.com/JDPRzCc.png';
    document.getElementById('live-broadcaster-name').innerText = streamData.broadcasterName || 'Creator';
    
    await updateDoc(doc(db, "live_streams", streamId), { viewers: increment(1) }).catch(()=>{});
    
    // Alten Raum schließen, falls vorhanden
    if(currentRoom) {
        currentRoom.disconnect();
    }
    
    // ==========================================
    // 🔥 LIVEKIT CONNECTION 🔥
    // ==========================================
    const livekitUrl = "wss://phil-shorts-cv9pfxjq.livekit.cloud"; // WICHTIG: Hier deine LiveKit Server-URL eintragen!
    const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzU4NzI2NDcsImlkZW50aXR5IjoienVzY2hhdWVyMSIsImlzcyI6IkFQSWFidW1Gc2ZZQ2Z3SiIsIm5iZiI6MTc3NTg2OTA0Nywic3ViIjoienVzY2hhdWVyMSIsInZpZGVvIjp7ImNhblB1Ymxpc2giOmZhbHNlLCJjYW5QdWJsaXNoRGF0YSI6dHJ1ZSwiY2FuU3Vic2NyaWJlIjp0cnVlLCJyb29tIjoidGVzdHJhdW0iLCJyb29tSm9pbiI6dHJ1ZX19.O3IENCJWCOyKlJ_7zIR8j9NCZZtlC14ycGX8TfFwfuI"; // WICHTIG: Hier muss der Token rein, den dein Server für den Zuschauer generiert!

    currentRoom = new LivekitClient.Room({
        adaptiveStream: false, // 🔥 Zwingt die App, IMMER den HD-Stream zu laden, egal wie groß das Handyfenster ist
        dynacast: false,       
    });

    // Event: Sobald der Streamer sein Video/Audio hochlädt, kommt es hier an
    currentRoom.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if(offlineText) offlineText.style.display = 'none';
        
        // LiveKit hängt Video und Audio direkt an unser <video> Element an
        if (track.kind === 'video' || track.kind === 'audio') {
            track.attach(videoEl);
        }
        
        // Zeigt einen "Tippen zum Entmuten" Screen, da Browser Autoplay mit Ton blockieren
        const unmuteOverlay = document.getElementById('live-unmute-overlay');
        if(unmuteOverlay) {
            unmuteOverlay.style.display = 'flex';
            unmuteOverlay.onclick = () => {
                videoEl.muted = false;
                unmuteOverlay.style.display = 'none';
            };
        }
    });

    currentRoom.on(LivekitClient.RoomEvent.Disconnected, () => {
        if(offlineText) {
            offlineText.style.display = 'flex';
            offlineText.innerHTML = '<i class="fas fa-broadcast-tower" style="font-size:40px; color:#ff4444; margin-bottom:10px;"></i><span>Stream beendet</span>';
        }
    });

    try {
        // Raum betreten!
        await currentRoom.connect(livekitUrl, token);
        console.log("Erfolgreich mit LiveKit Raum verbunden!");
    } catch (error) {
        console.error("LiveKit Error:", error);
        if(offlineText) {
            offlineText.innerHTML = '<i class="fas fa-exclamation-triangle" style="font-size:40px; color:#ff4444; margin-bottom:10px;"></i><span style="color:#ff4444;">Verbindungsfehler</span>';
        }
    }
    
    initLiveRoomListeners(streamId);
};

window.leaveLiveRoom = async function() {
    if(window.currentLiveStreamId && currentUser) {
        await updateDoc(doc(db, "live_streams", window.currentLiveStreamId), { viewers: increment(-1) }).catch(()=>{});
    }
    
    // LiveKit Raum sauber verlassen
    if(currentRoom) {
        currentRoom.disconnect();
        currentRoom = null;
    }
    
    const videoEl = document.getElementById('live-video-player');
    if(videoEl) { videoEl.pause(); videoEl.srcObject = null; }
    
    if(window.liveRoomUnsubscribes) {
        window.liveRoomUnsubscribes.forEach(unsub => unsub());
        window.liveRoomUnsubscribes = [];
    }
    
    window.currentLiveStreamId = null;
    switchView('live-list');
};

// 5. CHAT, MODERATION & GIFTS
let ctxTargetUid = null;
let ctxTargetMsgId = null;
let ctxTargetName = null;

function initLiveRoomListeners(streamId) {
    if(window.liveRoomUnsubscribes) window.liveRoomUnsubscribes.forEach(unsub => unsub());
    window.liveRoomUnsubscribes = [];
    
    const chatBox = document.getElementById('live-chat-box');
    if(chatBox) chatBox.innerHTML = '';
    
    // Aktuelle Mods laden
    const modUnsub = onSnapshot(collection(db, `live_streams/${streamId}/mods`), snap => {
        currentLiveMods = snap.docs.map(d => d.id);
    });
    window.liveRoomUnsubscribes.push(modUnsub);

    // Timeouts lokal laden
    let timedOutUsers = {};
    const timeoutUnsub = onSnapshot(collection(db, `live_streams/${streamId}/timeouts`), snap => {
        snap.docs.forEach(d => { timedOutUsers[d.id] = d.data().expire; });
    });
    window.liveRoomUnsubscribes.push(timeoutUnsub);
    
    // --- CHAT LISTENER ---
    const chatUnsub = onSnapshot(query(collection(db, `live_streams/${streamId}/chat`), orderBy("timestamp", "desc"), limit(50)), snap => {
        if(!chatBox) return;
        chatBox.innerHTML = '';
        
        const amIHost = currentUser.uid === streamId;
        const amIMod = currentLiveMods.includes(currentUser.uid);
        const amIAppAdmin = currentUser.isAdmin || currentUser.email === "schleimyverteilung@gmail.com";
        const hasModPower = amIHost || amIMod || amIAppAdmin;

        snap.forEach(d => {
            const m = d.data();
            
            // Verstecke die Nachricht, wenn User im Timeout ist
            if(timedOutUsers[m.uid] && timedOutUsers[m.uid] > Date.now()) return;

            const isHost = m.uid === streamId;
            const isMod = currentLiveMods.includes(m.uid);
            
            let badge = '';
            if(isHost) badge = '<span class="chat-badge badge-host">HOST</span>';
            else if(m.uid === "schleimyverteilung@gmail.com" || m.isAdmin) badge = '<span class="chat-badge badge-admin">ADMIN</span>';
            else if(isMod) badge = '<span class="chat-badge badge-mod">MOD</span>';
            
            // 🔥 FIX: Wenn du Mod bist ODER es deine eigene Nachricht ist, darfst du ins Menü!
            const canManageMsg = hasModPower || m.uid === currentUser.uid;
            
            const clickInt = canManageMsg ? `oncontextmenu="window.openLiveCtxMenu(event, '${m.uid}', '${d.id}', '${m.name.replace(/'/g, "\\'")}')" onclick="window.openLiveCtxMenu(event, '${m.uid}', '${d.id}', '${m.name.replace(/'/g, "\\'")}')"` : '';

            chatBox.innerHTML += `<div class="lr-chat-msg" ${clickInt} style="cursor:${canManageMsg ? 'pointer' : 'default'}">
                ${badge}<strong>${m.name}</strong><span>:</span> <span style="color:#efeff1;">${m.text}</span>
            </div>`;
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
    window.liveRoomUnsubscribes.push(chatUnsub);
    // ------------------------------------------------


    // --- CONTEXT MENU LOGIK ---
    window.openLiveCtxMenu = function(e, uid, msgId, name) {
        e.preventDefault();
        ctxTargetUid = uid;
        ctxTargetMsgId = msgId;
        ctxTargetName = name;

        const menu = document.getElementById('live-ctx-menu');
        if(!menu) return;

        const amIHost = currentUser.uid === window.currentLiveStreamId;
        const amIMod = currentLiveMods.includes(currentUser.uid);
        const amIAppAdmin = currentUser.isAdmin || currentUser.email === "schleimyverteilung@gmail.com";
        const hasModPower = amIHost || amIMod || amIAppAdmin;

        const targetIsHost = uid === window.currentLiveStreamId;
        const targetIsMod = currentLiveMods.includes(uid);
        const isMe = uid === currentUser.uid;

        // 1. Zuerst alles ausblenden
        document.getElementById('lctx-whisper').style.display = isMe ? 'none' : 'flex';
        document.getElementById('lctx-delete').style.display = 'none';
        document.getElementById('lctx-ban').style.display = 'none';
        document.getElementById('lctx-timeout').style.display = 'none';
        document.getElementById('lctx-mod').style.display = 'none';

        // 2. Löschen: Erlaubt wenn es die EIGENE Nachricht ist, oder man Mod/Host ist
        if (isMe || (hasModPower && !targetIsHost)) {
            document.getElementById('lctx-delete').style.display = 'flex';
        }

        // 3. Bann/Timeout: Nur Mods/Hosts dürfen das (aber nicht beim Host anwenden und nicht bei sich selbst)
        if (hasModPower && !targetIsHost && !isMe) {
            document.getElementById('lctx-ban').style.display = 'flex';
            document.getElementById('lctx-timeout').style.display = 'flex';
        }

        // 4. Mod machen: Nur Host & AppAdmin darf das
        if ((amIHost || amIAppAdmin) && !targetIsHost && !isMe) {
            document.getElementById('lctx-mod').style.display = 'flex';
            document.getElementById('lctx-mod').innerHTML = targetIsMod ? '<i class="fas fa-user-minus" style="color:#ff4444;"></i> Mod-Status entfernen' : '<i class="fas fa-shield-alt"></i> Moderator machen';
        }

        let x = e.clientX; let y = e.clientY;
        if (x + 200 > window.innerWidth) x = window.innerWidth - 210;
        if (y + 250 > window.innerHeight) y = window.innerHeight - 260;
        menu.style.left = `${x}px`; menu.style.top = `${y}px`;
        menu.classList.add('active');
    };

    document.addEventListener('click', (e) => { 
        const menu = document.getElementById('live-ctx-menu');
        if(menu && !e.target.closest('.live-ctx-menu')) menu.classList.remove('active'); 
    });

    document.getElementById('lctx-whisper')?.addEventListener('click', () => {
        window.open(`index.html?dm=${ctxTargetUid}`, '_blank');
        document.getElementById('live-ctx-menu').classList.remove('active');
    });

    document.getElementById('lctx-delete')?.addEventListener('click', async () => {
        if(ctxTargetMsgId && window.currentLiveStreamId) {
            await deleteDoc(doc(db, `live_streams/${window.currentLiveStreamId}/chat`, ctxTargetMsgId));
            showToast("Nachricht gelöscht");
            document.getElementById('live-ctx-menu').classList.remove('active');
        }
    });

    document.getElementById('lctx-timeout')?.addEventListener('click', async () => {
        if(ctxTargetUid && window.currentLiveStreamId) {
            let mins = prompt(`Wie viele Minuten Timeout für ${ctxTargetName}?`, "5");
            if(mins && !isNaN(mins)) {
                await setDoc(doc(db, `live_streams/${window.currentLiveStreamId}/timeouts`, ctxTargetUid), { expire: Date.now() + (parseInt(mins) * 60000) });
                showToast(`${ctxTargetName} hat ${mins}m Timeout.`);
                document.getElementById('live-ctx-menu').classList.remove('active');
            }
        }
    });

    document.getElementById('lctx-ban')?.addEventListener('click', async () => {
        if(ctxTargetUid && confirm(`Willst du ${ctxTargetName} wirklich aus dem Stream bannen?`)) {
            // Bann bedeutet: Wir packen den User in die Block-Liste des Streamers
            await updateDoc(doc(db, "users", window.currentLiveStreamId), { blockedUsers: arrayUnion(ctxTargetUid) });
            showToast("User gebannt!");
            document.getElementById('live-ctx-menu').classList.remove('active');
        }
    });

    document.getElementById('lctx-mod')?.addEventListener('click', async () => {
        if(ctxTargetUid && window.currentLiveStreamId) {
            const targetIsMod = currentLiveMods.includes(ctxTargetUid);
            if(targetIsMod) {
                await deleteDoc(doc(db, `live_streams/${window.currentLiveStreamId}/mods`, ctxTargetUid));
                showToast(`Mod-Rechte von ${ctxTargetName} entfernt.`);
            } else {
                await setDoc(doc(db, `live_streams/${window.currentLiveStreamId}/mods`, ctxTargetUid), { uid: ctxTargetUid });
                showToast(`${ctxTargetName} ist nun Mod!`);
            }
            document.getElementById('live-ctx-menu').classList.remove('active');
        }
    });
}

document.getElementById('send-live-chat-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('live-chat-input');
    const text = input.value.trim();
    if(!text || !window.currentLiveStreamId || !currentUser) return;
    
    await addDoc(collection(db, `live_streams/${window.currentLiveStreamId}/chat`), {
        uid: currentUser.uid, name: currentUser.displayName, text: text, timestamp: Date.now()
    });
    input.value = '';
});

document.getElementById('live-chat-input')?.addEventListener('keypress', (e) => {
    if(e.key === 'Enter') document.getElementById('send-live-chat-btn').click();
});

document.getElementById('live-gift-btn')?.addEventListener('click', () => {
    if(window.currentLiveStreamId) window.openGiftModal(window.currentLiveStreamId);
});