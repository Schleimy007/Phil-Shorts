// ==========================================
// js/script.js - Main UI, Utilities & Setup
// ==========================================

// === UI & SYSTEM HELPERS ===
window.showToast = function(msg) { window.triggerHaptic('light'); const toast = document.getElementById('toast'); toast.innerText = msg; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2500); };
window.showCustomAlert = function(title, message) { document.getElementById('alert-title').innerText = title; document.getElementById('alert-message').innerText = message; document.getElementById('custom-alert-modal').classList.add('show'); };
window.triggerHaptic = function(type = 'light') { if (!navigator.vibrate) return; if (type === 'light') navigator.vibrate(20); else if (type === 'heavy') navigator.vibrate([40, 30, 40]); else if (type === 'success') navigator.vibrate([30, 50, 30, 50, 50]); };
window.createParticles = function(x, y, parent) { for (let i = 0; i < 12; i++) { const p = document.createElement('div'); p.className = 'particle'; parent.appendChild(p); const angle = Math.random() * Math.PI * 2; const distance = 40 + Math.random() * 60; p.style.setProperty('--tx', Math.cos(angle) * distance + 'px'); p.style.setProperty('--ty', Math.sin(angle) * distance + 'px'); p.style.left = x + 'px'; p.style.top = y + 'px'; p.style.animation = 'shootParticle 0.6s cubic-bezier(0.25, 1, 0.5, 1) forwards'; setTimeout(() => p.remove(), 600); } };
window.showAchievement = function(text) { window.triggerHaptic('success'); const popup = document.getElementById('achievement-popup'); if (popup) { document.getElementById('achievement-text').innerText = text; popup.classList.add('show'); setTimeout(() => popup.classList.remove('show'), 3000); } };

window.parseJwt = function(token) { var base64Url = token.split('.')[1]; var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/'); var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join('')); return JSON.parse(jsonPayload); };
window.getUserData = function(uid, fallbackName, fallbackUsername, fallbackPic, fallbackVerified) { const user = window.allKnownUsers.find(u => u.uid === uid); return { displayName: user ? user.displayName : fallbackName, username: user && user.username ? user.username : (user ? user.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() : (fallbackUsername || fallbackName)), pic: user ? user.photoURL : fallbackPic, verified: user ? (user.verified === true) : fallbackVerified, philPlusUntil: user ? user.philPlusUntil : 0, philPlusTier: user ? user.philPlusTier : 0, activeBorder: user ? user.activeBorder : "", customBorder: user ? user.customBorder : null, lastActive: user ? user.lastActive : 0 }; };
window.getVerifiedBadge = function(isVerif) { return isVerif ? '<i class="fas fa-check-circle verified-badge"></i>' : ''; };
window.timeAgo = function(timestamp) { const now = Date.now(); const diff = now - Number(timestamp); const minutes = Math.floor(diff / 60000); const hours = Math.floor(minutes / 60); const days = Math.floor(hours / 24); if (minutes < 1) return 'gerade eben'; if (minutes < 60) return `vor ${minutes} Min.`; if (hours < 24) return `vor ${hours} Std.`; if (days < 7) return `vor ${days} T.`; return new Date(Number(timestamp)).toLocaleDateString('de-DE'); };

// === NAVIGATION ===
window.switchView = function(viewId) {
    if (viewId !== 'sound' && window.soundPreviewPlayer) { window.soundPreviewPlayer.pause(); const icon = document.getElementById('sound-play-icon'); if (icon) icon.className = 'fas fa-play'; }
    if (window.soundPreviewPlayer) window.soundPreviewPlayer.pause();
    document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); });
    const targetView = document.getElementById('view-' + viewId); if(targetView) { targetView.classList.add('active'); }
    document.querySelectorAll('.nav__item').forEach(n => n.classList.remove('active'));
    if (viewId === 'feed') document.querySelectorAll('.nav__item')[0].classList.add('active');
    if (viewId === 'search') document.querySelectorAll('.nav__item')[1].classList.add('active');
    if (viewId === 'inbox' || viewId === 'dm' || viewId === 'ticket') document.querySelectorAll('.nav__item')[3].classList.add('active');
    if (viewId === 'profile' && window.currentUser && document.getElementById('profile-name').innerText.includes(window.currentUser.displayName)) { document.querySelectorAll('.nav__item')[4].classList.add('active'); window.updateProfileGamificationUI(); }
    if (viewId !== 'feed' && viewId !== 'duet' && viewId !== 'live-room') document.querySelectorAll('.video__player').forEach(v => { v.pause(); v.currentTime = 0; });
    const audioPlayer = document.getElementById('profile-audio-player'); if (viewId !== 'profile' && audioPlayer) audioPlayer.pause();
    if (viewId === 'live-list' && window.LiveManager) window.LiveManager.init();
};

window.jumpToVideo = function(videoId) {
    window.switchView('feed');
    setTimeout(() => { const targetVid = document.querySelector(`.video[data-id="${videoId}"]`); if (targetVid) { targetVid.scrollIntoView({ behavior: 'smooth', block: 'center' }); document.querySelectorAll('.video__player').forEach(v => { v.pause(); v.currentTime = 0; }); const player = targetVid.querySelector('.video__player'); if (player) { player.muted = window.globalMuted; player.play().catch(() => {}); } } }, 250);
};

// === INITIALISIERUNG (ONLOAD) ===
window.onload = async function() {
    if (!window.currentUser) { document.getElementById('login-screen').classList.add('show'); } else {
        document.getElementById('login-screen').classList.remove('show');
        if (!window.currentUser.username) window.currentUser.username = window.currentUser.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        if (!window.currentUser.savedVideos) window.currentUser.savedVideos = [];
        if (!window.currentUser.blockedUsers) window.currentUser.blockedUsers = [];
        if (!window.currentUser.socialLinks) window.currentUser.socialLinks = { ig: '', yt: '', tw: '', tt: '' };
        if (!window.currentUser.dmPrivacy) window.currentUser.dmPrivacy = 'everyone';
        if(window.initLiveDatabase) window.initLiveDatabase();
        if(window.initLiveUser) window.initLiveUser();
        if(window.initInbox) window.initInbox();
        if(window.initInboxChats) window.initInboxChats();
        if(window.initSearchUsers) window.initSearchUsers();
        if(window.LiveManager) window.LiveManager.init();
        if(window.checkDailyStreak) window.checkDailyStreak();
    }
    
    document.querySelectorAll('#open-upload, .add-btn').forEach(btn => { btn.addEventListener('click', () => { document.querySelectorAll('#upload-modal').forEach(modal => modal.classList.add('show')); }); });
    document.querySelectorAll('.close-modal').forEach(btn => { btn.addEventListener('click', (e) => { e.target.closest('.modal').classList.remove('show'); window.editingProfileUid = null; }); });
    document.getElementById('close-settings')?.addEventListener('click', () => { document.getElementById('settings-modal').classList.remove('show'); window.editingProfileUid = null; });
    document.getElementById('close-alert-btn')?.addEventListener('click', () => document.getElementById('custom-alert-modal').classList.remove('show'));
    document.getElementById('logout-btn')?.addEventListener('click', () => { localStorage.removeItem('phil_session'); window.location.reload(); });
};

// === DESIGN & BORDERS ===
window.checkPhilPlusStatus = function(requiredTier = 1) { return window.currentUser && window.currentUser.philPlusUntil && window.currentUser.philPlusUntil > Date.now() && (window.currentUser.philPlusTier || 1) >= requiredTier; };
window.applyAppTheme = function(themeName) { document.body.className = (!themeName || themeName === 'default') ? '' : `theme-${themeName}`; };
window.getInlineBorderStyle = function(activeBorder, customBorder) { if (!activeBorder || activeBorder === 'none') return ''; if (activeBorder === 'custom' && customBorder) { return customBorder.grad ? `border: 3px solid transparent; background: linear-gradient(#000, #000) padding-box, linear-gradient(45deg, ${customBorder.c1}, ${customBorder.c2}) border-box; padding: 2px;` : `border: 3px solid ${customBorder.c1}; box-shadow: 0 0 10px ${customBorder.c1}, inset 0 0 5px ${customBorder.c1}; padding: 2px;`; } return ''; };
window.getBorderClass = function(activeBorder) { return (!activeBorder || activeBorder === 'none' || activeBorder === 'custom') ? '' : `border-${activeBorder}`; };
window.applyBorderStyles = function(el, activeBorder, customBorder) { el.className = el.className.replace(/border-[^\s]+/g, ''); el.classList.remove('border-none', 'border-custom'); if (!activeBorder || activeBorder === 'none') { el.style.cssText = ''; el.classList.add('border-none'); } else if (activeBorder === 'custom' && customBorder) { el.style.cssText = window.getInlineBorderStyle('custom', customBorder); } else { el.style.cssText = ''; el.classList.add(`border-${activeBorder}`); } };

// === PROFIL LOGIK ===
window.openProfile = async function(targetUid) {
    window.switchView('profile'); 
    const grid = document.getElementById('profile-grid');
    if (grid.dataset.lastUid !== targetUid || grid.innerHTML === "" || grid.innerHTML.includes('loading-screen')) { grid.innerHTML = '<div class="loading-screen"><i class="fas fa-circle-notch fa-spin"></i></div>'; grid.dataset.lastUid = targetUid; }
    document.getElementById('view-profile').style.background = ''; document.getElementById('profile-audio-player').src = ''; document.getElementById('profile-audio-player').pause();
    
    if (window.currentProfileUnsubscribe) window.currentProfileUnsubscribe();
    window.currentProfileUnsubscribe = window.fs.onSnapshot(window.fs.doc(window.db, "users", targetUid), (docSnap) => {
        if (!docSnap.exists()) return; const targetUser = docSnap.data();
        let totalLikes = 0; let totalGifts = 0; const userVideos = window.allVideosData.filter(v => v.authorUid === targetUid); userVideos.forEach(v => { totalLikes += (v.likedBy ? v.likedBy.length : 0); totalGifts += (v.gifts || 0); });
        let level = 1; if (totalLikes > 10 || totalGifts > 50) level = 2; if (totalLikes > 50 || totalGifts > 200) level = 3; if (totalLikes > 500) level = "Pro"; document.getElementById('profile-level').innerText = `Level ${level} Creator 🌟`;
        const verifiedBadge = targetUser.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : ''; const realFollowersCount = targetUser.followers ? targetUser.followers.length : 0; const cleanUsername = targetUser.username || targetUser.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        let nameClass = ""; let tier3Badge = "";
        if(targetUser.philPlusUntil && targetUser.philPlusUntil > Date.now() && (targetUser.philPlusTier || 1) >= 1) { nameClass = "name-phil-plus"; document.getElementById('phil-plus-badge-container').style.display = 'block'; let tierText = "Phil Shorts+"; if(targetUser.philPlusTier === 2) tierText = "Phil Shorts++"; if(targetUser.philPlusTier === 3) { tierText = "Phil Shorts+++"; tier3Badge = ' <i class="fas fa-gem" style="color: #00f2fe; font-size: 14px;" title="Plus+++ Legende"></i>'; } document.getElementById('phil-plus-badge-text').innerHTML = `<i class="fas fa-star"></i> ${tierText}`; } else document.getElementById('phil-plus-badge-container').style.display = 'none';
        if(targetUser.philPlusUntil && targetUser.philPlusUntil > Date.now() && targetUser.philPlusTier === 3) { if(targetUser.profileColor) document.getElementById('view-profile').style.background = targetUser.profileColor; if(targetUser.profileSong && document.getElementById('profile-audio-player').src !== targetUser.profileSong) { document.getElementById('profile-audio-player').src = targetUser.profileSong; document.getElementById('profile-audio-player').volume = 0.5; document.getElementById('profile-audio-player').play().catch(e => {}); } }

        document.getElementById('profile-title').innerHTML = '@' + cleanUsername; document.getElementById('profile-name').innerHTML = `<span class="${nameClass}">${targetUser.displayName}</span>${verifiedBadge}${tier3Badge}`; document.getElementById('profile-username').innerText = '@' + cleanUsername; document.getElementById('profile-bio').innerHTML = window.formatText(targetUser.bio || "Keine Bio vorhanden."); document.getElementById('profile-pic').src = targetUser.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback'; document.getElementById('stat-likes').innerText = totalLikes; document.getElementById('stat-followers').innerText = realFollowersCount; document.getElementById('stat-following').innerText = targetUser.following ? targetUser.following.length : 0;
        window.applyBorderStyles(document.getElementById('profile-pic'), targetUser.activeBorder, targetUser.customBorder);
        
        const actionBtn = document.getElementById('profile-action-btn'); const msgBtn = document.getElementById('profile-message-btn'); const shopBtn = document.getElementById('profile-shop-btn'); const blockBtn = document.getElementById('profile-block-btn');
        actionBtn.dataset.uid = targetUid; const settingsIcon = document.getElementById('open-settings'); const adminDashboardBtn = document.getElementById('open-admin-dashboard'); const privateStats = document.getElementById('private-stats'); const adminControls = document.getElementById('admin-controls'); adminControls.innerHTML = '';
        
        if (window.currentUser && targetUid === window.currentUser.uid) { 
            msgBtn.style.display = 'none'; shopBtn.style.display = 'block'; blockBtn.style.display = 'none'; document.getElementById('tab-profile-saved').style.display = 'block';
            actionBtn.innerText = "Profil bearbeiten"; actionBtn.classList.add('edit-btn'); actionBtn.onclick = () => { document.getElementById('edit-displayname-input').value = window.currentUser.displayName; document.getElementById('edit-username-input').value = window.currentUser.username || cleanUsername; document.getElementById('edit-pic-input').value = window.currentUser.photoURL; document.getElementById('edit-bio-input').value = window.currentUser.bio; document.getElementById('settings-modal').classList.add('show'); }; 
            settingsIcon.style.display = 'block'; settingsIcon.onclick = () => { document.getElementById('app-settings-modal').classList.add('show'); }; adminDashboardBtn.style.display = (window.currentUser.email === "schleimyverteilung@gmail.com" || window.currentUser.isAdmin) ? 'block' : 'none'; privateStats.style.display = 'block'; document.getElementById('my-coins').innerText = targetUser.coins || 0; document.getElementById('my-views').innerText = targetUser.profileViews || 0; 
        } else { 
            adminDashboardBtn.style.display = 'none'; privateStats.style.display = 'none'; shopBtn.style.display = 'none'; document.getElementById('tab-profile-saved').style.display = 'none';
            if (window.currentUser) { msgBtn.style.display = 'block'; msgBtn.onclick = () => { window.openDM(targetUid, cleanUsername, targetUser.photoURL); }; blockBtn.style.display = 'block'; blockBtn.onclick = () => window.toggleBlockUser(targetUid); } 
            if (window.currentUser && window.currentUser.following && window.currentUser.following.includes(targetUid)) { actionBtn.innerText = "Entfolgen"; actionBtn.classList.add('edit-btn'); } else { actionBtn.innerText = "Folgen"; actionBtn.classList.remove('edit-btn'); } actionBtn.onclick = () => window.toggleFollow(targetUid); settingsIcon.style.display = 'none'; 
        }
        window.renderProfileGrid(targetUid);
    });
};

window.renderProfileGrid = function(targetUid) {
    const grid = document.getElementById('profile-grid'); let blocked = (window.currentUser && window.currentUser.blockedUsers) ? window.currentUser.blockedUsers : []; let videosToRender = window.allVideosData.filter(v => v.authorUid === targetUid && !blocked.includes(v.authorUid));
    grid.innerHTML = '';
    if (videosToRender.length === 0) { grid.innerHTML = `<div style="grid-column: span 3; text-align: center; margin-top: 50px; color: #555;">Keine Videos</div>`; } 
    else { videosToRender.forEach(v => { const previewSrc = v.mediaType === 'images' && v.urls ? v.urls[0] : `${v.url}#t=0.5`; const mediaTag = v.mediaType === 'images' ? `<img src="${previewSrc}" style="width:100%; height:100%; object-fit:cover;">` : `<video src="${previewSrc}" muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>`; const icon = v.mediaType === 'images' ? 'fa-images' : 'fa-play'; grid.innerHTML += `<div class="grid-item" onclick="window.jumpToVideo('${v.id}')">${mediaTag}<div class="grid-views"><i class="fas ${icon}"></i> ${v.likedBy ? v.likedBy.length : 0}</div></div>`; }); }
};

// === GESCHENKE (GIFTS) ===
const allGifts = [ { id: 'g1', name: 'Rose', emoji: '🌹', price: 1 }, { id: 'g3', name: 'Herz', emoji: '❤️', price: 5 }, { id: 'g6', name: 'Flamme', emoji: '🔥', price: 10 }, { id: 'g12', name: 'Diamant', emoji: '💎', price: 100 }, { id: 'g16', name: 'Löwe', emoji: '🦁', price: 500 }, { id: 'g21', name: 'TRICHTER', emoji: '🌪️', price: 10000, reqTier: 3 } ];
window.openGiftModal = function(contextId) {
    if (!window.currentUser) return window.showCustomAlert("Fehler", "Bitte logge dich ein.");
    window.currentGiftContextId = contextId; window.isGiftingLive = document.getElementById('view-live-room').classList.contains('active');
    document.getElementById('gift-modal-coins').innerText = window.currentUser.coins || 0;
    const grid = document.getElementById('gift-grid'); 
    grid.innerHTML = allGifts.map(g => { if(g.reqTier && !window.checkPhilPlusStatus(g.reqTier)) { return `<div class="gift-card" style="opacity:0.3; cursor:not-allowed;" onclick="window.showCustomAlert('Plus++ erforderlich', 'Exklusiv für Phil Shorts++ User!')"><span class="gift-emoji">${g.emoji}</span><span class="gift-name">${g.name}</span><span class="gift-price"><i class="fas fa-lock"></i> Plus++</span></div>`; } return `<div class="gift-card" onclick="window.sendSpecificGift('${g.id}', ${g.price}, '${g.emoji}', '${g.name}')"><span class="gift-emoji">${g.emoji}</span><span class="gift-name">${g.name}</span><span class="gift-price"><i class="fas fa-coins"></i> ${g.price}</span></div>`; }).join('');
    document.getElementById('gift-modal').classList.add('show');
};

window.sendSpecificGift = async function(giftId, price, emoji, name) {
    if (!window.currentUser || !window.currentGiftContextId) return; 
    if (window.currentUser.coins < price) return window.showCustomAlert("Zu wenig Coins", "Du hast nicht genug Coins.");
    document.getElementById('gift-modal').classList.remove('show'); window.currentUser.coins -= price; window.triggerHaptic('heavy'); 
    const myCoinsEl = document.getElementById('my-coins'); if (myCoinsEl) myCoinsEl.innerText = window.currentUser.coins;
    
    if (window.isGiftingLive) {
        const streamId = window.currentGiftContextId;
        try { await window.fs.updateDoc(window.fs.doc(window.db, "users", window.currentUser.uid), { coins: window.fs.increment(-price) }); await window.fs.updateDoc(window.fs.doc(window.db, "users", streamId), { coins: window.fs.increment(price) }); await window.fs.updateDoc(window.fs.doc(window.db, "live_streams", streamId), { goalCurrent: window.fs.increment(price) }).catch(()=>{}); await window.fs.addDoc(window.fs.collection(window.db, `live_streams/${streamId}/gifts`), { uid: window.currentUser.uid, name: window.currentUser.displayName, emoji: emoji, giftName: name, price: price, timestamp: Date.now() }); } catch (err) {}
    } else {
        const videoId = window.currentGiftContextId; const targetVidData = window.allVideosData.find(vd => vd.id === videoId); if (!targetVidData || !targetVidData.authorUid) return window.showToast("Fehler beim Spenden!");
        document.querySelectorAll(`.gift-btn[data-id="${videoId}"] .gift-count`).forEach(el => { let currentGifts = Number(el.innerText) || 0; el.innerText = currentGifts + price; });
        const anim = document.getElementById(`gift-anim-${videoId}`); if(anim) { anim.innerHTML = `${emoji}<span class="gift-animation-name">${name}</span>`; anim.style.animation = 'none'; void anim.offsetWidth; anim.style.animation = 'flyUpGift 2s ease-out forwards'; }
        window.showToast(`${name} gesendet! 🎁`);
        try { await window.fs.updateDoc(window.fs.doc(window.db, "users", window.currentUser.uid), { coins: window.fs.increment(-price) }); await window.fs.updateDoc(window.fs.doc(window.db, "videos", videoId), { gifts: window.fs.increment(price) }); await window.fs.updateDoc(window.fs.doc(window.db, "users", targetVidData.authorUid), { coins: window.fs.increment(price) }); window.addNotification(targetVidData.authorUid, "gift", `hat dir ein ${name} ${emoji} gesendet!`, videoId); } catch (err) {}
    }
};

document.getElementById('save-settings-btn')?.addEventListener('click', async() => {
    const newDisplayName = document.getElementById('edit-displayname-input').value.trim(); const newUsername = document.getElementById('edit-username-input').value.trim().replace(/[^a-zA-Z0-9_]/g, '').toLowerCase(); const newBio = document.getElementById('edit-bio-input').value.trim(); const newPic = document.getElementById('edit-pic-input').value.trim() || window.currentUser.photoURL;
    const btn = document.getElementById('save-settings-btn'); btn.innerText = "Speichere..."; btn.disabled = true;
    try {
        await window.fs.updateDoc(window.fs.doc(window.db, "users", window.currentUser.uid), { displayName: newDisplayName, username: newUsername, bio: newBio, photoURL: newPic });
        window.showToast("Profil aktualisiert!"); document.getElementById('settings-modal').classList.remove('show');
    } catch (e) {} finally { btn.innerText = "Profil Speichern"; btn.disabled = false; }
});