// ==========================================
// js/videos.js - Video Feed, Uploads & Comments
// ==========================================

window.allVideosData = [];
let currentFeedMode = 'foryou';
let isInitialLoad = true;
let sortedFeed = [];
const viewedVideos = new Set();
window.linkPreviewCache = window.linkPreviewCache || {};
let cropperInstance = null;

// === SUPABASE UPLOAD (Wie in deinem Original) ===
window.uploadFileToFirebase = async function(file, folderName) {
    return new Promise(async(resolve, reject) => {
        try {
            const statusEl = document.getElementById('upload-status') || document.getElementById('story-upload-status') || document.getElementById('duet-status');
            if (statusEl) statusEl.innerText = `Lade hoch zu Datenbank...`;
            let fileExt = file.name ? file.name.split('.').pop() : 'png';
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `${folderName}/${fileName}`;
            const { data, error } = await window.supabase.storage.from('phil-shorts-media').upload(filePath, file, { cacheControl: '3600', upsert: false });
            if (error) throw error;
            const { data: publicUrlData } = window.supabase.storage.from('phil-shorts-media').getPublicUrl(filePath);
            if (statusEl) statusEl.innerText = `Upload erfolgreich!`;
            resolve(publicUrlData.publicUrl);
        } catch (error) { reject(error); }
    });
};

// === ALGORITHMUS ===
window.applyAlgorithm = function(videos, mode) {
    if (mode === 'following') { 
        let followedVids = videos.filter(v => window.currentUser && window.currentUser.following && window.currentUser.following.includes(v.authorUid)); 
        return followedVids.sort((a, b) => b.timestamp - a.timestamp);
    } else {
        const now = Date.now();
        let scoredVids = videos.map(v => {
            let likes = v.likedBy ? v.likedBy.length : 0;
            let comments = v.comments ? v.comments.length : 0;
            let gifts = v.gifts || 0; let views = Math.max(v.views || 1, 1);
            let completions = v.completions || 0; let rewatches = v.rewatches || 0; 
            let completionRate = completions / views; let retentionScore = (completionRate * 500) + (rewatches * 50);
            let hoursOld = Math.max((now - v.timestamp) / 3600000, 0.1);
            let interactions = likes + comments + (gifts * 5); let velocity = interactions / hoursOld;
            let viralMultiplier = velocity > 10 ? 2.5 : 1; let timeDecay = Math.pow(0.8, hoursOld / 12); 
            let sessionBoost = 1;
            if (v.description) { let tags = v.description.toLowerCase().match(/#\w+/g) || []; tags.forEach(tag => { if (window.sessionInterests[tag]) sessionBoost += (window.sessionInterests[tag] * 0.5); }); }
            let creatorBoost = 1; if (window.creatorAffinities[v.authorUid]) { creatorBoost += (window.creatorAffinities[v.authorUid] * 0.2); }
            let affinityScore = 1;
            if (window.currentUser) { if (window.currentUser.following && window.currentUser.following.includes(v.authorUid)) affinityScore *= 2.0; if (viewedVideos.has(v.id)) affinityScore *= 0.1; }
            let qualityBoost = 1; let authorData = window.allKnownUsers.find(u => u.uid === v.authorUid);
            if (authorData) { if (authorData.verified) qualityBoost *= 1.2; if (authorData.philPlusUntil > now && authorData.philPlusTier >= 2) qualityBoost *= 1.3; }
            let fastSkips = v.fastSkips || 0; let skipRate = views > 5 ? (fastSkips / views) : 0; let skipPenalty = Math.max(0.1, 1 - skipRate); 
            let wildcardBoost = (views < 10 && hoursOld < 24) ? (Math.random() * 500) : 0;
            let totalScore = ((retentionScore + (interactions * 10)) * timeDecay * sessionBoost * creatorBoost * affinityScore * viralMultiplier * qualityBoost * skipPenalty) + wildcardBoost + (Math.random() * 20);
            return { ...v, algoScore: totalScore };
        });
        return scoredVids.sort((a, b) => b.algoScore - a.algoScore);
    }
};

window.createAdElement = function() {
    const div = document.createElement('div'); div.className = "video dummy-ad-video";
    div.innerHTML = `<div class="video-inner is-paused" style="background: #111; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center;"><i class="fas fa-ad" style="font-size:50px; color:#aaa; margin-bottom: 20px;"></i><h3 style="margin-bottom:10px;">Werbung</h3><p style="color:#888; font-size:14px; max-width:80%;">Hole dir Phil Shorts++ für 100% werbefreien Genuss!</p><button class="profile-action-btn" onclick="document.getElementById('profile-shop-btn').click();" style="margin-top:20px; background:#ffd700; color:black;">Plus++ holen</button></div>`;
    return div;
};

// === DATABASE FEED INIT ===
window.initLiveDatabase = function() {
    const initLoader = document.getElementById('initial-loader'); if (initLoader) initLoader.style.display = 'flex';
    const skelLoader = document.getElementById('skeleton-loader'); if (skelLoader) skelLoader.style.display = 'block';
    const q = window.fs.query(window.fs.collection(window.db, "videos"), window.fs.orderBy("timestamp", "desc"), window.fs.limit(30));
    
    window.fs.onSnapshot(q, (snapshot) => {
        window.allVideosData = []; let blocked = (window.currentUser && window.currentUser.blockedUsers) ? window.currentUser.blockedUsers : [];
        snapshot.forEach(doc => { const v = { id: doc.id, ...doc.data() }; if (!blocked.includes(v.authorUid)) window.allVideosData.push(v); });
        window.allVideosData.reverse();
        if (isInitialLoad) {
            window.renderFeed(true); isInitialLoad = false;
            if (initLoader) initLoader.style.display = 'none'; if (skelLoader) skelLoader.style.display = 'none';
            const urlParams = new URLSearchParams(window.location.search);
            const sharedVideoId = urlParams.get('video'); const sharedProfileUid = urlParams.get('profile'); 
            if (sharedVideoId) { window.history.replaceState({}, document.title, window.location.pathname); setTimeout(() => window.jumpToVideo(sharedVideoId), 800); } 
            else if (sharedProfileUid) { window.history.replaceState({}, document.title, window.location.pathname); setTimeout(() => window.openProfile(sharedProfileUid), 800); }
        } else {
            snapshot.docChanges().forEach((change) => {
                const vData = { id: change.doc.id, ...change.doc.data() }; if (blocked.includes(vData.authorUid)) return;
                if (change.type === "added" && !document.querySelector(`.video[data-id="${vData.id}"]`)) {
                    const newVidEl = window.createVideoElement(vData);
                    if (currentFeedMode === 'foryou' || (currentFeedMode === 'following' && window.currentUser.following.includes(vData.authorUid))) {
                        const container = document.getElementById('video-container'); const loader = container.querySelector('.feed-end-loader');
                        if (loader) container.insertBefore(newVidEl, loader); else container.appendChild(newVidEl);
                        const emptyState = container.querySelector('.empty-state'); if (emptyState) emptyState.remove();
                        window.updateGlobalVolumeUI();
                    }
                }
                if (change.type === "modified") {
                    document.querySelectorAll(`.like-btn[data-id="${vData.id}"] .like-count`).forEach(el => el.innerText = vData.likedBy ? vData.likedBy.length : 0);
                    document.querySelectorAll(`.like-btn[data-id="${vData.id}"]`).forEach(btn => { if (window.currentUser && vData.likedBy && vData.likedBy.includes(window.currentUser.uid)) btn.classList.add('liked'); else btn.classList.remove('liked'); });
                    document.querySelectorAll(`.comment-btn[data-id="${vData.id}"] .comment-count-txt`).forEach(el => el.innerText = vData.comments ? vData.comments.length : 0);
                    document.querySelectorAll(`.gift-btn[data-id="${vData.id}"] .gift-count`).forEach(el => el.innerText = vData.gifts || 0);
                    document.querySelectorAll(`.video[data-id="${vData.id}"] .video__footer .video-desc-preview`).forEach(el => { let rawPreview = (vData.description || "").substring(0, 50); let previewHtml = window.formatText(rawPreview); if (vData.description && vData.description.length > 50) previewHtml += '... <strong>mehr anzeigen</strong>'; el.innerHTML = previewHtml; });
                    document.querySelectorAll(`.video[data-id="${vData.id}"] .video__footer .video-title`).forEach(el => el.innerText = vData.title || 'Ohne Titel');
                    if (window.currentCommentVideoId === vData.id && document.getElementById('comment-modal').classList.contains('show')) window.renderComments(vData.id);
                    if (document.getElementById('video-details-modal').classList.contains('show') && document.getElementById('detail-title').innerText === (vData.title || 'Ohne Titel')) { document.getElementById('detail-likes').innerHTML = `<i class="fas fa-heart" style="color: #ff0050;"></i> ${vData.likedBy ? vData.likedBy.length : 0}`; document.getElementById('detail-views').innerHTML = `<i class="fas fa-play" style="color: #00f2fe;"></i> ${vData.views || 0}`; }
                }
                if (change.type === "removed") { const vidEl = document.querySelector(`.video[data-id="${vData.id}"]`); if (vidEl) vidEl.remove(); }
            });
            if (document.getElementById('view-profile').classList.contains('active')) { const currentProfileUid = document.getElementById('profile-action-btn').dataset.uid; if (currentProfileUid) { const grid = document.getElementById('profile-grid'); if (grid.dataset.lastUid !== currentProfileUid || grid.innerHTML === "" || grid.innerHTML.includes('loading-screen')) { grid.dataset.lastUid = currentProfileUid; window.renderProfileGrid(currentProfileUid); } } }
        }
    }, (error) => { document.getElementById('video-container').innerHTML = '<div class="empty-state"><h3>Netzwerkfehler</h3></div>'; });
};

window.renderFeed = function(reset = false) {
    const container = document.getElementById('video-container');
    if (reset) {
        const oldVids = container.querySelectorAll('.video');
        oldVids.forEach(v => { const player = v.querySelector('.video__player'); if(player) { player.pause(); player.src = ""; player.load(); } v.remove(); });
        const oldLoaders = container.querySelectorAll('.feed-end-loader'); oldLoaders.forEach(l => l.remove());
        const emptyState = container.querySelector('.empty-state'); if (emptyState) emptyState.remove();

        sortedFeed = window.applyAlgorithm(window.allVideosData, currentFeedMode);
        if (sortedFeed.length === 0) { const emptyTxt = currentFeedMode === 'following' ? 'Folge Creatorn' : 'Feed ist leer'; const emptyIco = currentFeedMode === 'following' ? 'fa-user-plus' : 'fa-video-slash'; container.innerHTML += `<div class="empty-state"><i class="fas ${emptyIco}"></i><h3>${emptyTxt}</h3></div>`; return; }
        let count = 0;
        sortedFeed.forEach(video => { container.appendChild(window.createVideoElement(video)); count++; if (!window.checkPhilPlusStatus(2) && count % 5 === 0) container.appendChild(window.createAdElement()); });
        window.appendLoader(container, true);
    }
};

window.appendLoader = function(container, isEnd) {
    const loader = document.createElement('div'); loader.className = 'feed-end-loader';
    if (isEnd) { loader.innerHTML = '<i class="fas fa-check-circle"></i><span>Du bist auf dem neuesten Stand</span>'; loader.classList.add('no-more'); } 
    else { loader.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Prüfe Algorithmus...</span>'; }
    container.appendChild(loader);
};

window.updateGlobalVolumeUI = function() {
    document.querySelectorAll('.video-inner').forEach(container => {
        const v = container.querySelector('.video__player'); const muteBtn = container.querySelector('.mute-btn'); const volumeSlider = container.querySelector('.volume-slider');
        if (!muteBtn || !volumeSlider) return; 
        const vidId = container.closest('.video').dataset.id; const vData = window.allVideosData.find(x => x.id === vidId); const audioEl = container.closest('.video').audioEl;
        if (v) { const postVol = vData && vData.videoVolume !== undefined ? vData.videoVolume : 1; const origMuted = vData && vData.muteOriginal ? true : false; v.volume = window.globalVolume * postVol; v.muted = window.globalMuted || origMuted; }
        if(audioEl) { const musicVol = vData && vData.musicVolume !== undefined ? vData.musicVolume : 1; audioEl.volume = window.globalVolume * musicVol; audioEl.muted = window.globalMuted; }
        if (window.globalMuted || window.globalVolume == 0) { muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>'; volumeSlider.value = 0; volumeSlider.style.background = `linear-gradient(to right, #fff 0%, rgba(255, 255, 255, 0.3) 0%)`; } 
        else { if (window.globalVolume < 0.5) muteBtn.innerHTML = '<i class="fas fa-volume-down"></i>'; else muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>'; volumeSlider.value = window.globalVolume; volumeSlider.style.background = `linear-gradient(to right, #fff ${window.globalVolume * 100}%, rgba(255, 255, 255, 0.3) ${window.globalVolume * 100}%)`; }
    });
};

window.createVideoElement = function(video) {
    const div = document.createElement('div'); div.className = "video"; div.dataset.id = video.id; div.dataset.authorUid = video.authorUid;
    const authorData = window.getUserData(video.authorUid, video.authorName, video.authorUsername || video.authorName, video.authorPic, video.authorVerified);
    const verifiedBadge = window.getVerifiedBadge(authorData.verified); const isMe = window.currentUser && video.authorUid === window.currentUser.uid;
    const isFollowing = window.currentUser && window.currentUser.following && window.currentUser.following.includes(video.authorUid);
    const hasSaved = window.currentUser && window.currentUser.savedVideos && window.currentUser.savedVideos.includes(video.id) ? 'saved' : '';
    const hasLiked = video.likedBy && video.likedBy.includes(window.currentUser.uid) ? 'liked' : ''; const realLikes = video.likedBy ? video.likedBy.length : 0;
    const commentCount = video.comments ? video.comments.length : 0; const giftCount = video.gifts || 0;
    const plusButton = (!isMe) ? `<i class="fas fa-circle-plus follow-btn" data-target="${video.authorUid}" onclick="window.toggleFollow('${video.authorUid}', this, event)" style="${isFollowing ? 'display: none;' : ''}"></i>` : '';
    let tier3Badge = authorData.philPlusUntil > Date.now() && authorData.philPlusTier === 3 ? ' <i class="fas fa-gem" style="color: #00f2fe; font-size: 12px;" title="Plus+++ Legende"></i>' : "";
    let nameClass = (authorData.philPlusUntil > Date.now() && authorData.philPlusTier >= 1) ? "name-phil-plus" : "";
    const soundDataId = video.soundId || video.id; const soundDataName = video.soundName || `Originalton - ${authorData.displayName}`; const soundDataUrl = video.soundUrl || video.url;
    const soundDisc = `<div class="videoSidebar__button sound-disc-wrap" onclick="window.openSound('${soundDataId}', '${soundDataName.replace(/'/g, "\\'")}', '${authorData.pic}', '${soundDataUrl}')" style="margin-top:15px;"><img src="${authorData.pic}" class="sound-disc"><div class="sound-wave"></div><div class="sound-wave"></div></div>`;

    let mediaHTML = '';
    if (video.mediaType === 'images' && video.urls) {
        mediaHTML = `<div class="carousel-container" data-vid="${video.id}">${video.urls.map(u => `<div class="carousel-item"><img src="${u}"></div>`).join('')}</div><div class="carousel-dots">${video.urls.map((_, i) => `<div class="dot ${i===0?'active':''}"></div>`).join('')}</div><div class="carousel-arrow left" onclick="window.scrollCarousel('${video.id}', -1, event)"><i class="fas fa-chevron-left"></i></div><div class="carousel-arrow right" onclick="window.scrollCarousel('${video.id}', 1, event)"><i class="fas fa-chevron-right"></i></div>`;
    } else {
        mediaHTML = `<video class="video__player" data-vid="${video.id}" data-original-src="${video.url}" preload="metadata" loop playsinline src="${video.url}"></video><div class="play-indicator"><i class="fas fa-play"></i></div><div class="player-progress-bar"><div class="player-progress-filled"></div></div><div class="fast-forward-overlay">2x ▶▶</div><div class="seek-ripple left"><div class="seek-arrows"><i class="fas fa-caret-left"></i><i class="fas fa-caret-left"></i><i class="fas fa-caret-left"></i></div><div class="seek-text">5s</div></div><div class="seek-ripple right"><div class="seek-arrows"><i class="fas fa-caret-right"></i><i class="fas fa-caret-right"></i><i class="fas fa-caret-right"></i></div><div class="seek-text">5s</div></div>`;
    }

    let rawPreview = (video.description || "").substring(0, 50); let previewHtml = window.formatText(rawPreview); if ((video.description && video.description.length > 50)) previewHtml += '... <strong>mehr anzeigen</strong>';
    const inlineStyle = window.getInlineBorderStyle(authorData.activeBorder, authorData.customBorder); const bClass = window.getBorderClass(authorData.activeBorder);

    let seriesBtnHTML = '';
    if(video.seriesId) { const nextPart = window.allVideosData.find(v => v.seriesId === video.seriesId && v.timestamp > video.timestamp); if(nextPart) { seriesBtnHTML = `<div class="series-btn" onclick="window.jumpToVideo('${nextPart.id}'); window.awardXP(2);"><i class="fas fa-step-forward"></i> Nächster Teil (Serie)</div>`; } }

    div.innerHTML = `<div class="video-inner is-paused"><div class="video-wrapper">${mediaHTML}<div class="mute-container"><div class="mute-btn"><i class="fas fa-volume-up"></i></div><div class="volume-slider-wrapper"><input type="range" class="volume-slider" min="0" max="1" step="0.05" value="1"></div></div><div class="like-animation"><i class="fas fa-heart"></i></div><div class="gift-animation" id="gift-anim-${video.id}"></div></div><div class="video__footer"><h3 class="creator-name" onclick="window.openProfile('${video.authorUid}')"><span class="live-name-${video.authorUid} ${nameClass}">${authorData.displayName}${verifiedBadge}${tier3Badge}</span></h3><p class="live-username-${video.authorUid}" style="color:#aaa; font-size:13px; margin-bottom:5px; cursor:pointer;" onclick="window.openProfile('${video.authorUid}')">@${authorData.username}</p><h4 class="video-title" onclick="window.openVideoDetails('${video.id}')">${video.title || 'Ohne Titel'}</h4><p class="video-desc-preview" onclick="window.openVideoDetails('${video.id}')">${previewHtml}</p><div style="font-size:12px; margin-top:8px; display:flex; align-items:center; gap:5px; pointer-events:auto; cursor:pointer;" onclick="window.openSound('${soundDataId}', '${soundDataName.replace(/'/g, "\\'")}', '${authorData.pic}', '${soundDataUrl}')"><i class="fas fa-music"></i> <marquee scrollamount="3" style="width:120px;">${soundDataName}</marquee></div>${seriesBtnHTML}</div><div class="video__sidebar"><div class="sidebar__profile" onclick="window.openProfile('${video.authorUid}')"><img src="${authorData.pic}" class="live-pic-${video.authorUid} ${bClass}" style="${inlineStyle}" alt="Profil">${plusButton}</div><div class="videoSidebar__button like-btn ${hasLiked}" data-id="${video.id}"><i class="fas fa-heart"></i><p class="like-count">${realLikes}</p></div><div class="videoSidebar__button comment-btn" data-id="${video.id}"><i class="fas fa-comment-dots"></i><p class="comment-count-txt">${commentCount}</p></div><div class="videoSidebar__button gift-btn" data-id="${video.id}"><i class="fas fa-gift"></i><p class="gift-count">${giftCount}</p></div><div class="videoSidebar__button bookmark-btn ${hasSaved}" data-id="${video.id}" onclick="window.toggleSaveVideo('${video.id}', this)"><i class="fas fa-bookmark"></i><p>Speichern</p></div><div class="videoSidebar__button share-btn" data-id="${video.id}"><i class="fas fa-share"></i><p>Teilen</p></div><div class="videoSidebar__button" onclick="window.openMoreOptions('${video.id}')"><i class="fas fa-ellipsis-h" style="font-size:24px;"></i><p>Mehr</p></div>${soundDisc}</div></div>`;

    if (video.soundUrl) {
        const audioEl = new Audio(video.soundUrl); audioEl.loop = true; div.audioEl = audioEl; const v = div.querySelector('.video__player');
        const startSyncPlayback = () => { audioEl.currentTime = (video.soundOffset || 0) + (v ? v.currentTime : 0); audioEl.volume = window.globalVolume * (video.musicVolume !== undefined ? video.musicVolume : 1); audioEl.muted = window.globalMuted; audioEl.play().catch(()=>{}); if(v) { v.volume = window.globalVolume * (video.videoVolume !== undefined ? video.videoVolume : 1); v.muted = window.globalMuted || video.muteOriginal; v.play().catch(()=>{}); } };
        if(v) { v.addEventListener('play', startSyncPlayback); v.addEventListener('pause', () => audioEl.pause()); v.addEventListener('seeking', () => audioEl.currentTime = (video.soundOffset || 0) + v.currentTime); } 
    } else {
        const v = div.querySelector('.video__player'); if(v) { v.addEventListener('play', () => { v.volume = window.globalVolume * (video.videoVolume !== undefined ? video.videoVolume : 1); v.muted = window.globalMuted || (video.muteOriginal ? true : false); }); }
    }
    const vidEl = div.querySelector('.video__player');
    if (vidEl) { vidEl.addEventListener('loadedmetadata', () => { const ratio = vidEl.videoWidth / vidEl.videoHeight; if (ratio > 0.57) { if (window.innerWidth > 768) { const wrapper = div.querySelector('.video-wrapper'); if (wrapper) { let newWidth = Math.min(52, 45 + (ratio * 4)); wrapper.style.minWidth = newWidth + 'vh'; wrapper.style.maxWidth = 'calc(100% - 390px)'; } } else { vidEl.style.objectFit = 'contain'; vidEl.style.transform = 'scale(1.05)'; } } }); }

    window.attachInteractionsToVideo(div); return div;
};

// === VIDEO UPLOAD & EVENTS ===
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('up-file')?.addEventListener('change', function(e) {
        const files = e.target.files; const prevContainer = document.getElementById('upload-media-preview-container'); const vidPrev = document.getElementById('upload-video-preview'); const imgPrev = document.getElementById('upload-image-preview'); const musicSystem = document.getElementById('upload-music-system'); const fileText = document.getElementById('up-file-text');
        if (!files || files.length === 0) return; 
        if(prevContainer) prevContainer.style.display = 'flex'; if(musicSystem) musicSystem.style.display = 'block'; 
        if (fileText) fileText.innerText = files.length === 1 ? files[0].name + " (Klicken zum Ändern)" : files.length + " Dateien ausgewählt";
        const file = files[0]; const fileUrl = URL.createObjectURL(file);
        if (file.type.startsWith('video/')) { if(imgPrev) imgPrev.style.display = 'none'; if(vidPrev) { vidPrev.style.display = 'block'; vidPrev.src = fileUrl; const volSlider = document.getElementById('up-video-vol'); const muteToggle = document.getElementById('up-mute-original-toggle'); vidPrev.volume = volSlider ? parseFloat(volSlider.value) : 1; vidPrev.muted = muteToggle ? muteToggle.checked : false; vidPrev.play().catch(err => { vidPrev.muted = true; vidPrev.play(); }); } } 
        else { if(vidPrev) { vidPrev.style.display = 'none'; vidPrev.pause(); vidPrev.src = ''; } if(imgPrev) { imgPrev.style.display = 'block'; imgPrev.src = fileUrl; } }
    });

    document.getElementById('submit-upload')?.addEventListener('click', async() => {
        const files = document.getElementById('up-file').files; const titleInput = document.getElementById('up-title'); const descInput = document.getElementById('up-desc');
        const titleVal = titleInput ? titleInput.value.trim() : ""; const desc = descInput ? descInput.value.trim() : "";
        if (!files || files.length === 0) return window.showCustomAlert("Fehlende Daten", "Bitte wähle mindestens eine Datei aus.");
        if (!titleVal || !desc) return window.showCustomAlert("Fehlende Daten", "Bitte gib einen Titel UND eine Beschreibung ein.");
        let maxSize = window.checkPhilPlusStatus(1) ? 100 * 1024 * 1024 : 30 * 1024 * 1024; let limitText = window.checkPhilPlusStatus(1) ? "100" : "30";
        for(let i=0; i<files.length; i++) { if(files[i].size > maxSize) return window.showCustomAlert("Zu groß", `Dateien dürfen maximal ${limitText} MB groß sein!`); }
        const btn = document.getElementById('submit-upload'); const overlay = document.getElementById('video-processing-overlay'); btn.disabled = true; if(overlay) overlay.style.display = 'flex';
        const isSeries = document.getElementById('up-series-toggle') ? document.getElementById('up-series-toggle').checked : false; const isMuted = document.getElementById('up-mute-original-toggle')?.checked || false;
        
        try {
            let mediaUrls = []; let isVideo = files[0].type.startsWith('video/');
            for(let i=0; i<files.length; i++) { const url = await window.uploadFileToFirebase(files[i], isVideo ? 'videos' : 'images'); mediaUrls.push(url); }
            let uploadObj = { soundUrl: window.selectedLibrarySound ? window.selectedLibrarySound.url : (isVideo ? mediaUrls[0] : null), soundOffset: window.selectedLibrarySound ? window.selectedLibrarySound.offset : 0, videoVolume: parseFloat(document.getElementById('up-video-vol')?.value || 1), musicVolume: parseFloat(document.getElementById('up-music-vol')?.value || 1), muteOriginal: isMuted, soundId: window.selectedLibrarySound ? window.selectedLibrarySound.id : "original", soundName: window.selectedLibrarySound ? window.selectedLibrarySound.name : `Originalton - ${window.currentUser.displayName}`, authorUid: window.currentUser.uid, authorName: window.currentUser.displayName, authorUsername: window.currentUser.username, authorPic: window.currentUser.photoURL, authorVerified: window.currentUser.verified || false, title: titleVal, description: desc, likedBy: [], gifts: 0, comments: [], views: 0, timestamp: Date.now() };
            if(isSeries) uploadObj.seriesId = "series_" + window.currentUser.uid + "_" + Date.now();
            window.awardXP(20);
            if (isVideo) { await window.fs.addDoc(window.fs.collection(window.db, "videos"), { mediaType: 'video', url: mediaUrls[0], ...uploadObj }); } else { await window.fs.addDoc(window.fs.collection(window.db, "videos"), { mediaType: 'images', urls: mediaUrls, ...uploadObj }); }
            window.showToast("Erfolgreich veröffentlicht! 🎉"); document.getElementById('close-upload').click(); if(titleInput) titleInput.value = ''; if(descInput) descInput.value = ''; if(document.getElementById('up-series-toggle')) document.getElementById('up-series-toggle').checked = false;
        } catch (e) { window.showCustomAlert("Upload Fehler", "Fehler beim Upload."); } finally { btn.disabled = false; if(overlay) overlay.style.display = 'none'; }
    });

    document.getElementById('submit-comment')?.addEventListener('click', async() => {
        const input = document.getElementById('new-comment-input'); const text = input.value.trim();
        if ((!text && !window.currentPendingGifUrl) || !window.currentCommentVideoId || !window.currentUser) return;
        if(window.isSuperComment) { window.currentUser.coins -= 50; await window.fs.updateDoc(window.fs.doc(window.db, "users", window.currentUser.uid), { coins: window.fs.increment(-50) }); document.getElementById('my-coins').innerText = window.currentUser.coins; }
        window.awardXP(5); const commentId = Date.now().toString();
        const comment = { cId: commentId, uid: window.currentUser.uid, name: window.currentUser.displayName, username: window.currentUser.username, pic: window.currentUser.photoURL, verified: window.currentUser.verified || false, text: text, gifUrl: window.currentPendingGifUrl || null, likes: [], replies: [], creatorHeart: false, pinned: false, superComment: window.isSuperComment };
        const videoIndex = window.allVideosData.findIndex(v => v.id === window.currentCommentVideoId);
        window.isSuperComment = false; const superBtn = document.getElementById('btn-super-comment'); if(superBtn) { superBtn.style.transform = 'scale(1)'; superBtn.style.boxShadow = 'none'; }
        if (videoIndex > -1) { if (!window.allVideosData[videoIndex].comments) window.allVideosData[videoIndex].comments = []; window.allVideosData[videoIndex].comments.push(comment); window.renderComments(window.currentCommentVideoId); document.querySelectorAll(`.comment-btn[data-id="${window.currentCommentVideoId}"] .comment-count-txt`).forEach(el => el.innerText = window.allVideosData[videoIndex].comments.length); }
        input.value = ''; window.currentPendingGifUrl = null; document.getElementById('pending-gif-preview').style.display = 'none';
        await window.fs.updateDoc(window.fs.doc(window.db, "videos", window.currentCommentVideoId), { comments: window.fs.arrayUnion(comment) });
        const targetVidData = window.allVideosData.find(vd => vd.id === window.currentCommentVideoId); if (targetVidData) window.addNotification(targetVidData.authorUid, "comment", `hat kommentiert${text ? ': "'+text+'"' : ' mit einem GIF'}`, window.currentCommentVideoId);
    });
});

// === COMMENTS RENDER ===
window.renderComments = function(id) {
    const list = document.getElementById('comment-list'); const video = window.allVideosData.find(v => v.id === id);
    if (video && video.comments && video.comments.length > 0) {
        const isCreator = window.currentUser && window.currentUser.uid === video.authorUid; const authorData = window.getUserData(video.authorUid, video.authorName, video.authorUsername || video.authorName, video.authorPic, video.authorVerified); const creatorPic = authorData.pic || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback';
        let blocked = (window.currentUser && window.currentUser.blockedUsers) ? window.currentUser.blockedUsers : []; let sortedComments = video.comments.filter(c => !blocked.includes(c.uid));
        sortedComments.sort((a, b) => { if(a.pinned && !b.pinned) return -1; if(!a.pinned && b.pinned) return 1; return 0; });
        if(sortedComments.length === 0) { list.innerHTML = '<div class="no-comments">Keine sichtbaren Kommentare.</div>'; return; }
        list.innerHTML = sortedComments.map((c, index) => {
            const cUser = window.getUserData(c.uid, c.name, c.username, c.pic, c.verified); const badge = window.getVerifiedBadge(cUser.verified); const canDelete = window.currentUser && (window.currentUser.uid === c.uid || window.currentUser.email === "schleimyverteilung@gmail.com" || window.currentUser.isAdmin); const commentId = c.cId || index.toString(); const deleteBtn = canDelete ? `<i class="fas fa-trash delete-comment-icon" onclick="window.deleteComment('${id}', '${commentId}')"></i>` : ''; const likeCount = c.likes ? c.likes.length : 0; const hasLiked = c.likes && window.currentUser && c.likes.includes(window.currentUser.uid) ? 'liked-heart' : ''; const timeString = window.timeAgo(c.cId);
            let cClass = ""; if(cUser.philPlusUntil && cUser.philPlusUntil > Date.now() && cUser.philPlusTier >= 1) cClass = "name-phil-plus";
            let cCreatorHeartHtml = ''; if (c.creatorHeart) cCreatorHeartHtml = `<div class="creator-heart-wrap" onclick="window.toggleCreatorHeart('${id}', '${commentId}')" style="cursor:${isCreator?'pointer':'default'};" title="Vom Creator geliket"><div class="creator-heart-img" style="background-image: url('${creatorPic}')"></div><i class="fas fa-heart creator-heart-badge"></i></div>`; else if (isCreator) cCreatorHeartHtml = `<div class="creator-heart-wrap creator-heart-inactive" onclick="window.toggleCreatorHeart('${id}', '${commentId}')" title="Creator Herz geben"><i class="far fa-heart creator-heart-badge-outline"></i></div>`;
            let renderedGif = ''; if(c.gifUrl) renderedGif = `<img src="${c.gifUrl}" class="comment-gif" alt="GIF">`;
            let pinBadgeHtml = c.pinned ? `<div style="font-size:11px; color:#aaa; margin-bottom:5px;"><i class="fas fa-thumbtack" style="color:#ffd700;"></i> Vom Ersteller angeheftet</div>` : '';
            let pinActionHtml = (isCreator && window.checkPhilPlusStatus(3)) ? `<span onclick="window.pinComment('${id}', '${commentId}')"><i class="fas fa-thumbtack"></i> ${c.pinned ? 'Lösen' : 'Anheften'}</span>` : '';
            let translateBtnHtml = window.checkPhilPlusStatus(3) ? `<i class="fas fa-language translate-btn" onclick="window.translateComment(this, '${commentId}')" title="Übersetzen (Plus+++)" style="color:#00f2fe; margin-left:10px; cursor:pointer;"></i>` : '';
            let replyVideoHtml = `<i class="fas fa-video reply-video-btn" onclick="window.startCommentReplyVideo('${id}', '${commentId}')" title="Mit Video antworten"></i>`;
            const superClass = c.superComment ? 'super-comment' : ''; const superBadge = c.superComment ? '<div class="super-comment-badge"><i class="fas fa-star"></i> Super Comment</div>' : '';
            let repliesHtml = '';
            if (c.replies && c.replies.length > 0) {
                let validReplies = c.replies.filter(r => !blocked.includes(r.uid));
                if(validReplies.length > 0) {
                    repliesHtml = `<div class="reply-container">` + validReplies.map(r => {
                        const rUser = window.getUserData(r.uid, r.name, r.username, r.pic, r.verified); const rBadge = window.getVerifiedBadge(rUser.verified); const rCanDelete = window.currentUser && (window.currentUser.uid === r.uid || window.currentUser.email === "schleimyverteilung@gmail.com" || window.currentUser.isAdmin); const rDeleteBtn = rCanDelete ? `<i class="fas fa-trash delete-comment-icon" onclick="window.deleteReply('${id}', '${commentId}', '${r.rId}')"></i>` : ''; const rLikeCount = r.likes ? r.likes.length : 0; const rHasLiked = r.likes && window.currentUser && r.likes.includes(window.currentUser.uid) ? 'liked-heart' : ''; const replyTimeString = window.timeAgo(r.rId);
                        let rClass = ""; if(rUser.philPlusUntil && rUser.philPlusUntil > Date.now() && rUser.philPlusTier >= 1) rClass = "name-phil-plus";
                        let rCreatorHeartHtml = ''; if (r.creatorHeart) rCreatorHeartHtml = `<div class="creator-heart-wrap" onclick="window.toggleCreatorHeart('${id}', '${commentId}', '${r.rId}')" style="cursor:${isCreator?'pointer':'default'};" title="Vom Creator geliket"><div class="creator-heart-img" style="background-image: url('${creatorPic}')"></div><i class="fas fa-heart creator-heart-badge"></i></div>`; else if (isCreator) rCreatorHeartHtml = `<div class="creator-heart-wrap creator-heart-inactive" onclick="window.toggleCreatorHeart('${id}', '${commentId}', '${r.rId}')" title="Creator Herz geben"><i class="far fa-heart creator-heart-badge-outline"></i></div>`;
                        return `<div class="reply-item"><img src="${rUser.pic}" class="live-pic-${r.uid}" alt="User" onclick="window.openProfile('${r.uid}')" style="cursor:pointer;"><div style="flex:1; min-width: 0;"><strong onclick="window.openProfile('${r.uid}')" style="cursor:pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;"><span class="live-name-${r.uid} ${rClass}">${rUser.displayName}${rBadge}</span> <span class="live-username-${r.uid}" style="color:#888; font-weight:normal; font-size:12px;">@${rUser.username}</span> <span class="comment-time">${replyTimeString}</span></strong><p style="word-break: break-word;">${window.formatText(r.text)}</p><div class="comment-actions"><span onclick="window.toggleReplyBox('${commentId}')">Antworten</span><span class="${rHasLiked}" onclick="window.likeReply('${id}', '${commentId}', '${r.rId}')"><i class="fas fa-heart"></i> ${rLikeCount}</span>${rCreatorHeartHtml}</div></div>${rDeleteBtn}</div>`;
                    }).join('') + `</div>`;
                }
            }
            const replyBoxHtml = `<div class="reply-box" id="reply-box-${commentId}" style="display:none;"><input type="text" placeholder="Antworten..." id="reply-input-${commentId}" class="comment-input" style="font-size:16px; padding:8px 15px;"><button onclick="window.submitReply('${id}', '${commentId}')" class="chat-send-btn" style="width:32px; height:32px; font-size:12px; flex-shrink: 0;"><i class="fas fa-paper-plane"></i></button></div>`;
            return `<div class="comment-wrapper">${pinBadgeHtml}<div class="comment ${superClass}" style="display:flex; align-items:flex-start; width:100%; padding: 10px; border-radius: 12px;"><img src="${cUser.pic}" class="live-pic-${c.uid}" alt="User" onclick="window.openProfile('${c.uid}')" style="cursor:pointer;"><div style="flex:1; min-width: 0;">${superBadge}<strong onclick="window.openProfile('${c.uid}')" style="cursor:pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;"><span class="live-name-${c.uid} ${cClass}">${cUser.displayName}${badge}</span> <span class="live-username-${c.uid}" style="color:#888; font-weight:normal; font-size:12px;">@${cUser.username}</span> <span class="comment-time">${timeString}</span></strong><p id="comment-text-${commentId}" style="word-break: break-word;">${window.formatText(c.text)}${translateBtnHtml}</p>${renderedGif}<div class="comment-actions"><span onclick="window.toggleReplyBox('${commentId}')">Antworten</span><span class="${hasLiked}" onclick="window.likeComment('${id}', '${commentId}')"><i class="fas fa-heart"></i> ${likeCount}</span>${cCreatorHeartHtml}${pinActionHtml}${replyVideoHtml}</div></div>${deleteBtn}</div>${repliesHtml}${replyBoxHtml}</div>`;
        }).join('');
    } else { list.innerHTML = '<div class="no-comments">Sei der Erste, der kommentiert!</div>'; }
};

// === INTERSECTION OBSERVER & VIDEO INTERACTIONS ===
const videoObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
        const el = e.target; const vidId = el.dataset.id; const videoPlayer = el.querySelector('.video__player'); const containerInner = el.querySelector('.video-inner');
        if (e.isIntersecting && document.getElementById('view-feed').classList.contains('active')) {
            if(el.classList.contains('dummy-ad-video')) return; 
            if(videoPlayer && !videoPlayer.src) { videoPlayer.src = videoPlayer.dataset.originalSrc; }
            el.dataset.playStartTime = Date.now();
            if (vidId && !viewedVideos.has(vidId)) { viewedVideos.add(vidId); window.awardXP(2); window.fs.updateDoc(window.fs.doc(window.db, "videos", vidId), { views: window.fs.increment(1) }).catch(() => {}); }
            if (videoPlayer) { document.querySelectorAll('.video__player').forEach(otherVid => { if (otherVid !== videoPlayer && !otherVid.paused) { otherVid.pause(); } }); videoPlayer.muted = window.globalMuted; const playPromise = videoPlayer.play(); if (playPromise !== undefined) { playPromise.then(() => { const soundWrap = el.querySelector('.sound-disc-wrap'); if(soundWrap) soundWrap.classList.add('is-playing'); }).catch(error => { videoPlayer.pause(); if(containerInner) containerInner.classList.add('is-paused'); }); } } else if (el.audioEl) { el.audioEl.currentTime = el.audioEl.dataset.offset || 0; el.audioEl.play().catch(err=>{}); const soundWrap = el.querySelector('.sound-disc-wrap'); if(soundWrap) soundWrap.classList.add('is-playing'); }
        } else { 
            if(el.dataset.playStartTime) { let playedTime = Date.now() - Number(el.dataset.playStartTime); if (playedTime > 100 && playedTime < 2500 && vidId) { window.fs.updateDoc(window.fs.doc(window.db, "videos", vidId), { fastSkips: window.fs.increment(1) }).catch(()=>{}); } el.dataset.playStartTime = ""; }
            if (videoPlayer) { videoPlayer.pause(); videoPlayer.removeAttribute('src'); videoPlayer.load(); const soundWrap = el.querySelector('.sound-disc-wrap'); if(soundWrap) soundWrap.classList.remove('is-playing'); } else if (el.audioEl) { el.audioEl.pause(); const soundWrap = el.querySelector('.sound-disc-wrap'); if(soundWrap) soundWrap.classList.remove('is-playing'); }
        }
    });
}, { threshold: 0.6 });

window.attachInteractionsToVideo = function(videoContainerEl) {
    const v = videoContainerEl.querySelector('.video__player'); const c = videoContainerEl.querySelector('.carousel-container'); const container = videoContainerEl.querySelector('.video-inner'); videoObserver.observe(videoContainerEl); 
    const vidId = videoContainerEl.dataset.id; const targetVidData = window.allVideosData.find(vd => vd.id === vidId); 
    let lastTap = 0;
    
    const handleDoubleTap = (e) => { 
        const tapLength = new Date().getTime() - lastTap; 
        if (tapLength < 300 && tapLength > 0) { 
            const rect = v ? v.getBoundingClientRect() : c.getBoundingClientRect(); const x = e.clientX || (e.changedTouches ? e.changedTouches[0].clientX : 0); const y = e.clientY || (e.changedTouches ? e.changedTouches[0].clientY : 0); const relX = x - rect.left;
            if (v && relX > rect.width * 0.7) { v.currentTime = Math.min(v.duration, v.currentTime + 5); const ripple = container.querySelector('.seek-ripple.right'); if(ripple) { ripple.classList.remove('active'); void ripple.offsetWidth; ripple.classList.add('active'); } window.triggerHaptic('light'); } 
            else if (v && relX < rect.width * 0.3) { v.currentTime = Math.max(0, v.currentTime - 5); const ripple = container.querySelector('.seek-ripple.left'); if(ripple) { ripple.classList.remove('active'); void ripple.offsetWidth; ripple.classList.add('active'); } window.triggerHaptic('light'); } 
            else { const likeBtn = container.querySelector('.like-btn'); if (!likeBtn.classList.contains('liked')) { likeBtn.click(); } const anim = container.querySelector('.like-animation'); anim.style.animation = 'none'; setTimeout(() => anim.style.animation = 'doubleTapHeart 0.8s ease-out forwards', 10); window.createParticles(x, y, document.body); }
            e.preventDefault(); lastTap = 0; return true; 
        } 
        lastTap = new Date().getTime(); return false; 
    };

    if (v) {
        v.addEventListener('play', () => { container.classList.remove('is-paused'); const soundWrap = container.querySelector('.sound-disc-wrap'); if(soundWrap) soundWrap.classList.add('is-playing'); }); 
        v.addEventListener('pause', () => { container.classList.add('is-paused'); const soundWrap = container.querySelector('.sound-disc-wrap'); if(soundWrap) soundWrap.classList.remove('is-playing'); });
        v.addEventListener('click', (e) => { if (handleDoubleTap(e)) return; if (v.paused) { document.querySelectorAll('.video__player').forEach(vid => { if (vid !== v && !vid.paused) vid.pause(); }); window.globalMuted = false; v.muted = window.globalMuted; window.updateGlobalVolumeUI(); v.play().catch(err=>{}); } else { v.pause(); } });
        let hasCompleted = false;
        v.addEventListener('timeupdate', () => { 
            const prog = container.querySelector('.player-progress-filled'); if(prog) prog.style.width = (v.currentTime / v.duration * 100) + '%'; 
            if(v.currentTime >= v.duration * 0.9 && !hasCompleted) { hasCompleted = true; if(targetVidData && targetVidData.authorUid) { window.creatorAffinities[targetVidData.authorUid] = (window.creatorAffinities[targetVidData.authorUid] || 0) + 1; } window.fs.updateDoc(window.fs.doc(window.db, "videos", vidId), { completions: window.fs.increment(1) }).catch(()=>{}); }
            if(v.currentTime < v.duration * 0.5 && hasCompleted) { hasCompleted = false; window.fs.updateDoc(window.fs.doc(window.db, "videos", vidId), { rewatches: window.fs.increment(1) }).catch(()=>{}); }
        });
        let holdTimer; const startHold = () => { holdTimer = setTimeout(() => { v.playbackRate = 2.0; const overlay = container.querySelector('.fast-forward-overlay'); if(overlay) overlay.classList.add('active'); window.triggerHaptic('heavy'); }, 500); }; const endHold = () => { clearTimeout(holdTimer); v.playbackRate = 1.0; const overlay = container.querySelector('.fast-forward-overlay'); if(overlay) overlay.classList.remove('active'); };
        v.addEventListener('mousedown', startHold); v.addEventListener('touchstart', startHold); v.addEventListener('mouseup', endHold); v.addEventListener('mouseleave', endHold); v.addEventListener('touchend', endHold);
        const muteContainer = container.querySelector('.mute-container'); const muteBtn = container.querySelector('.mute-btn'); const volumeSlider = container.querySelector('.volume-slider'); window.updateGlobalVolumeUI();
        if (muteBtn) { muteBtn.addEventListener('click', (e) => { e.stopPropagation(); window.globalMuted = !window.globalMuted; if (!window.globalMuted && window.globalVolume == 0) window.globalVolume = 1; window.updateGlobalVolumeUI(); }); }
        if (volumeSlider) { volumeSlider.addEventListener('input', (e) => { e.stopPropagation(); window.globalMuted = false; window.globalVolume = e.target.value; window.updateGlobalVolumeUI(); }); volumeSlider.addEventListener('mousedown', (e) => { e.stopPropagation(); muteContainer.classList.add('active-slider'); }); volumeSlider.addEventListener('touchstart', (e) => { e.stopPropagation(); muteContainer.classList.add('active-slider'); }, { passive: false }); }
    } else if (c) { container.classList.remove('is-paused'); c.addEventListener('click', (e) => handleDoubleTap(e)); c.addEventListener('scroll', () => { const idx = Math.round(c.scrollLeft / c.clientWidth); const dots = videoContainerEl.querySelectorAll('.dot'); dots.forEach((d, i) => { if (i === idx) d.active = true; else d.classList.remove('active'); }); }); }

    let touchStartX = 0; container.addEventListener('touchstart', e => touchStartX = e.changedTouches[0].screenX, {passive: true});
    container.addEventListener('touchend', e => { if (touchStartX - e.changedTouches[0].screenX > 100) { const viewProfile = document.getElementById('view-profile'); viewProfile.classList.add('profile-slide-in'); window.openProfile(videoContainerEl.dataset.authorUid); setTimeout(() => viewProfile.classList.add('active-slide'), 10); } }, {passive: true});
    document.addEventListener('mouseup', () => document.querySelectorAll('.mute-container').forEach(mc => mc.classList.remove('active-slider'))); document.addEventListener('touchend', () => document.querySelectorAll('.mute-container').forEach(mc => mc.classList.remove('active-slider')));
    const mc = container.querySelector('.mute-container'); if (mc) mc.addEventListener('click', (e) => e.stopPropagation());
    
    container.querySelector('.like-btn')?.addEventListener('click', async(e) => { 
        window.triggerHaptic('heavy'); const btn = e.currentTarget; const id = btn.dataset.id; const isLiked = btn.classList.contains('liked'); 
        document.querySelectorAll(`.like-btn[data-id="${id}"]`).forEach(el => { const countEl = el.querySelector('.like-count'); let currentLikes = Number(countEl.innerText) || 0; if (isLiked) { el.classList.remove('liked'); countEl.innerText = Math.max(0, currentLikes - 1); } else { el.classList.add('liked'); countEl.innerText = currentLikes + 1; } }); 
        if (isLiked) { await window.fs.updateDoc(window.fs.doc(window.db, "videos", id), { likedBy: window.fs.arrayRemove(window.currentUser.uid) }); } else { 
            const rect = btn.getBoundingClientRect(); window.createParticles(rect.left + rect.width/2, rect.top + rect.height/2, document.body);
            btn.classList.add('micro-pop'); setTimeout(()=>btn.classList.remove('micro-pop'),300); window.awardXP(1); 
            if(targetVidData && targetVidData.description) { let tags = targetVidData.description.toLowerCase().match(/#\w+/g) || []; tags.forEach(tag => { window.sessionInterests[tag] = (window.sessionInterests[tag] || 0) + 1; }); }
            await window.fs.updateDoc(window.fs.doc(window.db, "videos", id), { likedBy: window.fs.arrayUnion(window.currentUser.uid) }); if (targetVidData) window.addNotification(targetVidData.authorUid, "like", "hat dein Post geliket.", id); 
        } 
    });
    container.querySelector('.comment-btn')?.addEventListener('click', (e) => { window.currentCommentVideoId = e.currentTarget.dataset.id; window.renderComments(window.currentCommentVideoId); document.getElementById('comment-modal').classList.add('show'); });
    container.querySelector('.gift-btn')?.addEventListener('click', (e) => { window.openGiftModal(e.currentTarget.dataset.id); });
    container.querySelector('.share-btn')?.addEventListener('click', async(e) => { const vidId = e.currentTarget.dataset.id; const shareUrl = `${window.location.origin}${window.location.pathname}?video=${vidId}`; if (navigator.share) { try { await navigator.share({ title: 'Phil Shorts', text: 'Schau dir dieses an!', url: shareUrl }); } catch (err) {} } else { navigator.clipboard.writeText(shareUrl); window.showToast("Link kopiert!"); } });
};

// ... Hilfsfunktionen für Videos (Formatierung, Embeds) wie in der Original-Datei
window.processEmbeds = async function() { const placeholders = document.querySelectorAll('.embed-placeholder[data-url]'); for (const el of placeholders) { const url = el.getAttribute('data-url'); el.removeAttribute('data-url'); if (window.linkPreviewCache[url]) { if (window.linkPreviewCache[url] instanceof Promise) { window.linkPreviewCache[url].then(data => { if (data) window.renderDiscordEmbed(data, el); }); } else { window.renderDiscordEmbed(window.linkPreviewCache[url], el); } continue; } window.linkPreviewCache[url] = window.fetchPreviewData(url).then(data => { window.linkPreviewCache[url] = data; if (data) window.renderDiscordEmbed(data, el); return data; }); } };
window.fetchPreviewData = async function(url) { try { const response = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`); const json = await response.json(); if (json.status === 'success' && json.data) { const d = json.data; return { siteName: d.publisher || new URL(url).hostname.replace('www.', ''), title: d.title || "", desc: d.description || "", image: d.image ? d.image.url : (d.logo ? d.logo.url : ""), url: url }; } return null; } catch(e) { return null; } };
window.renderDiscordEmbed = function(data, el) { if (!el || !document.body.contains(el)) return; const chatBox = el.closest('.chat-container'); const isNearBottom = chatBox ? (chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 100) : false; let html = `<div class="discord-embed">`; if (data.siteName) html += `<div class="discord-embed-site">${data.siteName}</div>`; if (data.title) html += `<a href="${data.url}" target="_blank" class="discord-embed-title">${data.title}</a>`; if (data.desc) html += `<div class="discord-embed-desc">${data.desc.length > 150 ? data.desc.substring(0, 150) + '...' : data.desc}</div>`; if (data.image) html += `<img src="${data.image}" class="discord-embed-img" onerror="this.style.display='none'">`; html += `</div>`; el.outerHTML = html; if (chatBox && isNearBottom) { setTimeout(() => chatBox.scrollTop = chatBox.scrollHeight, 100); } };
window.formatDMText = function(text) { if (!text) return ""; let safeText = window.escapeHTML(text); const urlRegex = /(https?:\/\/[^\s]+)/g; safeText = safeText.replace(urlRegex, function(url) { if (url.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i)) { return `<div class="link-embed"><a href="${url}" target="_blank" class="link-embed-title">${url}</a><img src="${url}" class="link-embed-img"></div>`; } else { return `<a href="${url}" target="_blank" class="dm-link">${url}</a><div class="embed-placeholder" data-url="${url}"></div>`; } }); return safeText; };
window.formatText = function(text) { if (!text) return ""; let safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); safeText = safeText.replace(/#([a-zA-Z0-9_äöüÄÖÜß]+)/g, '<span class="hashtag" onclick="window.openHashtag(\'$1\', event)">#$1</span>'); safeText = safeText.replace(/@([a-zA-Z0-9_]+)/g, '<span class="mention" onclick="window.openProfileByUsername(\'$1\', event)">@$1</span>'); return safeText; };
window.escapeHTML = function(str) { if (!str) return ''; return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]) ).replace(/✅|✔️|☑️/g, ''); };