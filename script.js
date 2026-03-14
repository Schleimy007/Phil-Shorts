import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, updateDoc, increment, addDoc, arrayUnion, arrayRemove, deleteDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// !!! DEINE FIREBASE KEYS !!!
const firebaseConfig = {
    apiKey: "AIzaSyAF-QW_MtVBkImqh1gXwhKrc2pLLCAe3Ek",
    authDomain: "phil-shorts.firebaseapp.com",
    projectId: "phil-shorts",
    storageBucket: "phil-shorts.firebasestorage.app",
    messagingSenderId: "785802511451",
    appId: "1:785802511451:web:c7aabd40a4a8ea89616b7e",
    measurementId: "G-ZCTKSM7EGJ"
};

const CLOUDINARY_NAME = "dyzhyd2x8";
const UPLOAD_PRESET = "phil_upload";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let allVideosData = [];
let currentUser = JSON.parse(localStorage.getItem('phil_session'));
let currentFeedMode = 'foryou';
let isInitialLoad = true;

// --- HELPER ---
window.switchView = function(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + viewId).classList.add('active');

    document.querySelectorAll('.nav__item').forEach(n => n.classList.remove('active'));
    if (viewId === 'feed') document.querySelectorAll('.nav__item')[0].classList.add('active');
    if (viewId === 'search') document.querySelectorAll('.nav__item')[1].classList.add('active');
    if (viewId === 'chat') document.querySelectorAll('.nav__item')[3].classList.add('active');
    if (viewId === 'profile' && currentUser && document.getElementById('profile-name').innerText.includes(currentUser.displayName)) {
        document.querySelectorAll('.nav__item')[4].classList.add('active');
    }

    if (viewId !== 'feed') document.querySelectorAll('.video__player').forEach(v => v.pause());
};

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function showCustomAlert(title, message) {
    document.getElementById('alert-title').innerText = title;
    document.getElementById('alert-message').innerText = message;
    document.getElementById('custom-alert-modal').classList.add('show');
}
document.getElementById('close-alert-btn').addEventListener('click', () => {
    document.getElementById('custom-alert-modal').classList.remove('show');
});


// --- AUTHENTIFIZIERUNG & LIVE USER DATEN ---
function parseJwt(token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

let userUnsubscribe = null;

function initLiveUser() {
    if (!currentUser) return;
    if (userUnsubscribe) userUnsubscribe();

    userUnsubscribe = onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
            currentUser = {...currentUser, ...docSnap.data() };
            if (currentUser.coins === undefined) currentUser.coins = 1000;
            if (!currentUser.followers) currentUser.followers = [];
            localStorage.setItem('phil_session', JSON.stringify(currentUser));

            const coinEl = document.getElementById('my-coins');
            if (coinEl) coinEl.innerText = currentUser.coins;

            const viewsEl = document.getElementById('my-views');
            if (viewsEl) viewsEl.innerText = currentUser.profileViews || 0;

            const actionBtn = document.getElementById('profile-action-btn');
            if (actionBtn && actionBtn.dataset.uid === currentUser.uid) {
                document.getElementById('stat-followers').innerText = currentUser.followers.length;
                document.getElementById('stat-following').innerText = currentUser.following.length;
            }
        }
    });
}

window.addEventListener('googleLoginSuccess', async(event) => {
    try {
        const response = event.detail;
        const data = parseJwt(response.credential);
        const uid = data.sub;
        const name = data.name.replace(/\s+/g, '').toLowerCase();
        const pic = data.picture;
        const email = data.email;

        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            await setDoc(userRef, {
                uid: uid,
                displayName: name,
                email: email,
                photoURL: pic,
                bio: "Neu in der Community! 👋",
                following: [],
                followers: [],
                verified: false,
                coins: 1000,
                profileViews: 0
            });
            currentUser = { uid, displayName: name, email, photoURL: pic, bio: "Neu in der Community! 👋", following: [], followers: [], verified: false, coins: 1000, profileViews: 0 };
        } else {
            currentUser = userSnap.data();
            if (currentUser.coins === undefined) await updateDoc(userRef, { coins: 1000, profileViews: 0, followers: [] });
        }

        localStorage.setItem('phil_session', JSON.stringify(currentUser));
        document.getElementById('login-screen').classList.remove('show');
        initLiveDatabase();
        initLiveUser();
        initLiveChat();
    } catch (error) {
        showCustomAlert("Login Fehler", "Datenbank-Fehler beim Login.");
    }
});

window.onload = async function() {
    if (!currentUser) {
        document.getElementById('login-screen').classList.add('show');
    } else {
        initLiveDatabase();
        initLiveUser();
        initLiveChat();
    }
};

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('phil_session');
    window.location.reload();
});


// --- DIE MAGISCHE LIVE DATENBANK FÜR VIDEOS ---
function initLiveDatabase() {
    document.getElementById('video-container').innerHTML = '<div class="loading-screen"><i class="fas fa-spinner fa-spin"></i><p>Lade Algorithmus...</p></div>';

    onSnapshot(collection(db, "videos"), (snapshot) => {
        allVideosData = [];
        snapshot.forEach(doc => allVideosData.push({ id: doc.id, ...doc.data() }));
        allVideosData.reverse();

        if (isInitialLoad) {
            renderFeed();
            isInitialLoad = false;
        } else {
            snapshot.docChanges().forEach((change) => {
                const vData = { id: change.doc.id, ...change.doc.data() };

                if (change.type === "added") {
                    if (!document.querySelector(`.video[data-id="${vData.id}"]`)) {
                        const newVidEl = createVideoElement(vData);
                        if (currentFeedMode === 'foryou' || (currentFeedMode === 'following' && currentUser.following.includes(vData.authorUid))) {
                            const container = document.getElementById('video-container');
                            container.insertBefore(newVidEl, container.firstChild);
                            const emptyState = container.querySelector('.empty-state');
                            if (emptyState) emptyState.remove();
                        }
                    }
                }
                if (change.type === "modified") {
                    const likeEl = document.querySelector(`.like-btn[data-id="${vData.id}"] .like-count`);
                    if (likeEl) likeEl.innerText = vData.likedBy ? vData.likedBy.length : 0;

                    const likeBtn = document.querySelector(`.like-btn[data-id="${vData.id}"]`);
                    if (likeBtn && currentUser) {
                        if (vData.likedBy && vData.likedBy.includes(currentUser.uid)) likeBtn.classList.add('liked');
                        else likeBtn.classList.remove('liked');
                    }

                    const commentEl = document.querySelector(`.comment-btn[data-id="${vData.id}"] p`);
                    if (commentEl) commentEl.innerText = vData.comments ? vData.comments.length : 0;

                    const giftEl = document.querySelector(`.gift-btn[data-id="${vData.id}"] .gift-count`);
                    if (giftEl) giftEl.innerText = vData.gifts || 0;

                    if (window.currentCommentVideoId === vData.id && document.getElementById('comment-modal').classList.contains('show')) {
                        renderComments(vData.id);
                    }
                }
                if (change.type === "removed") {
                    const vidEl = document.querySelector(`.video[data-id="${vData.id}"]`);
                    if (vidEl) vidEl.remove();
                }
            });
        }
    }, (error) => {
        document.getElementById('video-container').innerHTML = '<div class="empty-state"><h3>Netzwerkfehler</h3></div>';
    });
}

// Erstellt ein einzelnes Video Element (für Render und Live-Updates)
function createVideoElement(video) {
    const div = document.createElement('div');
    div.className = "video";
    div.dataset.id = video.id;

    const commentCount = video.comments ? video.comments.length : 0;
    const isFollowing = currentUser && currentUser.following && currentUser.following.includes(video.authorUid) || video.authorUid === currentUser.uid;
    const plusButton = isFollowing ? '' : `<i class="fas fa-circle-plus follow-btn" onclick="toggleFollow('${video.authorUid}', this, event)"></i>`;
    const verifiedBadge = video.authorVerified ? '<i class="fas fa-check-circle verified-badge"></i>' : '';

    const hasLiked = video.likedBy && video.likedBy.includes(currentUser.uid) ? 'liked' : '';
    const realLikes = video.likedBy ? video.likedBy.length : 0;

    const canDeleteVideo = currentUser && (video.authorUid === currentUser.uid || currentUser.email === "schleimyverteilung@gmail.com");
    const deleteVideoBtn = canDeleteVideo ? `<div class="videoSidebar__button" onclick="deleteVideo('${video.id}')" style="margin-top:15px;"><i class="fas fa-trash" style="color: #ff4444; font-size:24px;"></i></div>` : '';

    div.innerHTML = `
        <div class="video-inner">
            <video class="video__player" loop playsinline src="${video.url}"></video>
            <div class="play-indicator"><i class="fas fa-play"></i></div>
            
            <div class="mute-container">
                <div class="mute-btn"><i class="fas fa-volume-up"></i></div>
                <div class="volume-slider-wrapper">
                    <input type="range" class="volume-slider" min="0" max="1" step="0.05" value="1">
                </div>
            </div>

            <div class="like-animation"><i class="fas fa-heart"></i></div>
            <div class="gift-animation"><i class="fas fa-coins"></i></div>
            <div class="player-progress-bar"><div class="player-progress-filled"></div></div>
            
            <div class="video__footer">
                <h3 class="creator-name" onclick="openProfile('${video.authorUid}')">@${video.authorName}${verifiedBadge}</h3>
                <p>${video.description}</p>
            </div>
            
            <div class="video__sidebar">
                <div class="sidebar__profile" onclick="openProfile('${video.authorUid}')">
                    <img src="${video.authorPic}" alt="Profil">
                    ${plusButton}
                </div>
                <div class="videoSidebar__button like-btn ${hasLiked}" data-id="${video.id}">
                    <i class="fas fa-heart"></i>
                    <p class="like-count">${realLikes}</p>
                </div>
                <div class="videoSidebar__button comment-btn" data-id="${video.id}">
                    <i class="fas fa-comment-dots"></i>
                    <p>${commentCount}</p>
                </div>
                <div class="videoSidebar__button gift-btn" data-id="${video.id}">
                    <i class="fas fa-gift" style="color: #ffd700;"></i>
                    <p class="gift-count">${video.gifts || 0}</p>
                </div>
                <div class="videoSidebar__button share-btn" data-url="${video.url}">
                    <i class="fas fa-share"></i>
                    <p>Teilen</p>
                </div>
                ${deleteVideoBtn}
            </div>
        </div>`;

    attachInteractionsToVideo(div);
    return div;
}

function renderFeed() {
    const container = document.getElementById('video-container');
    container.innerHTML = '';
    let displayVideos = allVideosData;

    if (currentFeedMode === 'following') {
        const myFollowing = currentUser ? (currentUser.following || []) : [];
        displayVideos = allVideosData.filter(v => myFollowing.includes(v.authorUid));
        if (displayVideos.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-user-plus"></i><h3>Folge Creatorn</h3></div>`;
            return;
        }
    } else {
        if (displayVideos.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-video-slash"></i><h3>Feed ist leer</h3></div>`;
            return;
        }
    }

    displayVideos.forEach(video => {
        container.appendChild(createVideoElement(video));
    });
}

document.getElementById('tab-foryou').addEventListener('click', function() {
    document.getElementById('tab-following').classList.remove('active');
    this.classList.add('active');
    currentFeedMode = 'foryou';
    renderFeed();
});

document.getElementById('tab-following').addEventListener('click', function() {
    document.getElementById('tab-foryou').classList.remove('active');
    this.classList.add('active');
    currentFeedMode = 'following';
    renderFeed();
});

// --- INTERAKTIONEN & PC STEUERUNG (TIKTOK RHYTHMUS) ---

window.addEventListener('keydown', (e) => {
    if (document.getElementById('view-feed').classList.contains('active')) {
        const container = document.getElementById('video-container');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            container.scrollBy({ top: container.clientHeight, behavior: 'smooth' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            container.scrollBy({ top: -container.clientHeight, behavior: 'smooth' });
        }
    }
});

const videoContainer = document.getElementById('video-container');
let scrollTimeout = null;

videoContainer.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

    e.preventDefault();

    if (scrollTimeout) return;

    if (e.deltaY > 0) {
        videoContainer.scrollBy({ top: videoContainer.clientHeight, behavior: 'smooth' });
    } else if (e.deltaY < 0) {
        videoContainer.scrollBy({ top: -videoContainer.clientHeight, behavior: 'smooth' });
    }

    scrollTimeout = setTimeout(() => {
        scrollTimeout = null;
    }, 600);
}, { passive: false });

const videoObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
        if (e.isIntersecting && document.getElementById('view-feed').classList.contains('active')) {
            e.target.play().catch(() => {});
        } else {
            e.target.pause();
            e.target.currentTime = 0;
        }
    });
}, { threshold: 0.6 });

function attachInteractionsToVideo(videoContainerEl) {
    const v = videoContainerEl.querySelector('.video__player');
    const container = videoContainerEl.querySelector('.video-inner');
    let lastTap = 0;

    videoObserver.observe(v);

    v.addEventListener('click', (e) => {
        const tapLength = new Date().getTime() - lastTap;
        if (tapLength < 300 && tapLength > 0) {
            const likeBtn = container.querySelector('.like-btn');
            if (!likeBtn.classList.contains('liked')) { likeBtn.click(); }
            const anim = container.querySelector('.like-animation');
            anim.style.animation = 'none';
            setTimeout(() => anim.style.animation = 'doubleTapHeart 0.8s ease-out forwards', 10);
            e.preventDefault();
        } else {
            if (v.paused) {
                v.play();
                container.classList.remove('is-paused');
            } else {
                v.pause();
                container.classList.add('is-paused');
            }
        }
        lastTap = new Date().getTime();
    });

    // Volume & Mute Logik
    const muteContainer = container.querySelector('.mute-container');
    const muteBtn = container.querySelector('.mute-btn');
    const volumeSlider = container.querySelector('.volume-slider');

    function updateVolumeIcon(vol) {
        if (vol == 0) {
            muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
            v.muted = true;
        } else if (vol < 0.5) {
            muteBtn.innerHTML = '<i class="fas fa-volume-down"></i>';
        } else {
            muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        }
    }

    muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        v.muted = !v.muted;
        if (v.muted) {
            volumeSlider.value = 0;
            muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        } else {
            v.volume = v.volume || 1;
            if (v.volume === 0) v.volume = 1;
            volumeSlider.value = v.volume;
            updateVolumeIcon(v.volume);
        }
    });

    volumeSlider.addEventListener('input', (e) => {
        e.stopPropagation();
        v.muted = false;
        v.volume = e.target.value;
        updateVolumeIcon(v.volume);
    });

    // Verhindert, dass das Video pausiert, wenn man den Slider anklickt
    muteContainer.addEventListener('click', (e) => e.stopPropagation());
    volumeSlider.addEventListener('mousedown', (e) => e.stopPropagation());

    v.addEventListener('timeupdate', () => { container.querySelector('.player-progress-filled').style.width = (v.currentTime / v.duration * 100) + '%'; });

    container.querySelector('.like-btn').addEventListener('click', async(e) => {
        const btn = e.currentTarget;
        const id = btn.dataset.id;
        const isLiked = btn.classList.contains('liked');
        if (isLiked) {
            await updateDoc(doc(db, "videos", id), { likedBy: arrayRemove(currentUser.uid) });
        } else {
            await updateDoc(doc(db, "videos", id), { likedBy: arrayUnion(currentUser.uid) });
        }
    });

    container.querySelector('.gift-btn').addEventListener('click', async(e) => {
        if (currentUser.coins < 10) return showCustomAlert("Zu wenig Coins", "Du hast nicht genug Coins zum Spenden.");
        const id = e.currentTarget.dataset.id;

        const anim = container.querySelector('.gift-animation');
        anim.style.animation = 'none';
        setTimeout(() => anim.style.animation = 'flyUpCoin 1s ease-out forwards', 10);

        currentUser.coins -= 10;
        await updateDoc(doc(db, "users", currentUser.uid), { coins: increment(-10) });
        await updateDoc(doc(db, "videos", id), { gifts: increment(10) });
        showToast("10 Coins gespendet! 🪙");
    });

    container.querySelector('.comment-btn').addEventListener('click', (e) => {
        window.currentCommentVideoId = e.currentTarget.dataset.id;
        renderComments(window.currentCommentVideoId);
        document.getElementById('comment-modal').classList.add('show');
    });

    container.querySelector('.share-btn').addEventListener('click', async(e) => {
        const url = e.currentTarget.dataset.url;
        if (navigator.share) { try { await navigator.share({ title: 'Phil Video', url: url }); } catch (err) {} } else {
            navigator.clipboard.writeText(url);
            showToast("Kopiert!");
        }
    });
}

window.deleteVideo = async function(videoId) {
    if (confirm("Möchtest du dieses Video wirklich endgültig löschen?")) {
        try {
            await deleteDoc(doc(db, "videos", videoId));
            showToast("Video erfolgreich gelöscht! 🗑️");
            if (document.getElementById('view-profile').classList.contains('active')) {
                openProfile(document.getElementById('profile-action-btn').dataset.uid);
            }
        } catch (e) { showCustomAlert("Fehler", "Video konnte nicht gelöscht werden."); }
    }
};

window.deleteComment = async function(videoId, commentIndex) {
    if (confirm("Möchtest du diesen Kommentar löschen?")) {
        try {
            const videoRef = doc(db, "videos", videoId);
            const snap = await getDoc(videoRef);
            if (snap.exists()) {
                const videoData = snap.data();
                videoData.comments.splice(commentIndex, 1);
                await updateDoc(videoRef, { comments: videoData.comments });
                showToast("Kommentar gelöscht!");
            }
        } catch (e) { showCustomAlert("Fehler", "Kommentar konnte nicht gelöscht werden."); }
    }
};

window.toggleFollow = async function(targetUid, element, event) {
    if (event) event.stopPropagation();
    const userRef = doc(db, "users", currentUser.uid);
    const targetRef = doc(db, "users", targetUid);

    if (!currentUser.following.includes(targetUid)) {
        showToast("Gefolgt!");
        if (element) element.style.display = 'none';
        await updateDoc(userRef, { following: arrayUnion(targetUid) });
        await updateDoc(targetRef, { followers: arrayUnion(currentUser.uid) });
    } else {
        showToast("Entfolgt.");
        await updateDoc(userRef, { following: arrayRemove(targetUid) });
        await updateDoc(targetRef, { followers: arrayRemove(currentUser.uid) });
    }
};

window.openProfile = async function(targetUid) {
    switchView('profile');
    document.getElementById('profile-grid').innerHTML = '<div class="loading-screen"><i class="fas fa-circle-notch fa-spin"></i></div>';

    try {
        const userSnap = await getDoc(doc(db, "users", targetUid));
        const targetUser = userSnap.data();
        const userVideos = allVideosData.filter(v => v.authorUid === targetUid);

        let totalLikes = 0;
        let totalGifts = 0;
        userVideos.forEach(v => {
            totalLikes += (v.likedBy ? v.likedBy.length : 0);
            totalGifts += (v.gifts || 0);
        });

        let level = 1;
        if (totalLikes > 10 || totalGifts > 50) level = 2;
        if (totalLikes > 50 || totalGifts > 200) level = 3;
        if (totalLikes > 500) level = "Pro";
        document.getElementById('profile-level').innerText = `Level ${level} Creator 🌟`;

        const verifiedBadge = targetUser.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : '';
        const realFollowersCount = targetUser.followers ? targetUser.followers.length : 0;

        document.getElementById('profile-title').innerHTML = '@' + targetUser.displayName;
        document.getElementById('profile-name').innerHTML = targetUser.displayName + verifiedBadge;
        document.getElementById('profile-bio').innerText = targetUser.bio || "Keine Bio vorhanden.";
        document.getElementById('profile-pic').src = targetUser.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback';
        document.getElementById('stat-likes').innerText = totalLikes;
        document.getElementById('stat-followers').innerText = realFollowersCount;
        document.getElementById('stat-following').innerText = targetUser.following ? targetUser.following.length : 0;

        const actionBtn = document.getElementById('profile-action-btn');
        actionBtn.dataset.uid = targetUid;
        const settingsIcon = document.getElementById('open-settings');
        const adminDashboardBtn = document.getElementById('open-admin-dashboard');
        const privateStats = document.getElementById('private-stats');
        const adminControls = document.getElementById('admin-controls');
        adminControls.innerHTML = '';

        if (currentUser && currentUser.email === "schleimyverteilung@gmail.com" && targetUid !== currentUser.uid) {
            const isVerif = targetUser.verified || false;
            adminControls.innerHTML = `<button onclick="toggleVerify('${targetUid}', ${isVerif})" class="profile-action-btn" style="background: transparent; color: #00f2fe; border: 1px solid #00f2fe; margin-top: 15px; width: 100%;">👑 Admin: ${isVerif ? 'Blauen Haken entfernen' : 'Blauen Haken geben'}</button>`;
        }

        if (targetUid === currentUser.uid) {
            actionBtn.innerText = "Profil bearbeiten";
            actionBtn.classList.add('edit-btn');
            actionBtn.onclick = () => {
                document.getElementById('edit-name-input').value = currentUser.displayName;
                document.getElementById('edit-pic-input').value = currentUser.photoURL;
                document.getElementById('edit-bio-input').value = currentUser.bio;
                document.getElementById('settings-modal').classList.add('show');
            };
            settingsIcon.style.display = 'block';
            adminDashboardBtn.style.display = currentUser.email === "schleimyverteilung@gmail.com" ? 'block' : 'none';
            privateStats.style.display = 'block';
            document.getElementById('my-coins').innerText = currentUser.coins || 0;
            document.getElementById('my-views').innerText = currentUser.profileViews || 0;

        } else {
            adminDashboardBtn.style.display = 'none';
            await updateDoc(doc(db, "users", targetUid), { profileViews: increment(1) });
            privateStats.style.display = 'none';
            if (currentUser.following && currentUser.following.includes(targetUid)) {
                actionBtn.innerText = "Entfolgen";
                actionBtn.classList.add('edit-btn');
            } else {
                actionBtn.innerText = "Folgen";
                actionBtn.classList.remove('edit-btn');
            }
            actionBtn.onclick = () => toggleFollow(targetUid);
            settingsIcon.style.display = 'none';
        }

        const grid = document.getElementById('profile-grid');
        grid.innerHTML = '';
        if (userVideos.length === 0) { grid.innerHTML = `<div style="grid-column: span 3; text-align: center; margin-top: 50px; color: #555;">Noch keine Videos</div>`; } else { userVideos.forEach(v => { grid.innerHTML += `<div class="grid-item" onclick="switchView('feed')"><video src="${v.url}#t=0.5" muted playsinline></video><div class="grid-views"><i class="fas fa-play"></i> ${v.likedBy ? v.likedBy.length : 0}</div></div>`; }); }
    } catch (e) { showCustomAlert("Fehler", "Profil konnte nicht geladen werden."); }
};

window.toggleVerify = async function(targetUid, currentStatus) {
    try {
        await updateDoc(doc(db, "users", targetUid), { verified: !currentStatus });
        showToast(!currentStatus ? "Blauer Haken vergeben! 🔵" : "Blauer Haken entfernt.");
        openProfile(targetUid);
    } catch (e) { showCustomAlert("Fehler", "Fehler! Bist du wirklich Admin?"); }
};

document.getElementById('nav-profile').addEventListener('click', () => { if (currentUser) openProfile(currentUser.uid); });

document.getElementById('save-settings-btn').addEventListener('click', async() => {
    const newName = document.getElementById('edit-name-input').value.trim();
    const newBio = document.getElementById('edit-bio-input').value.trim();
    const newPic = document.getElementById('edit-pic-input').value.trim() || currentUser.photoURL;

    if (newName.length < 3) return showCustomAlert("Hinweis", "Dein Name muss mindestens 3 Zeichen lang sein.");

    const btn = document.getElementById('save-settings-btn');
    btn.innerText = "Speichere...";
    btn.disabled = true;

    try {
        await updateDoc(doc(db, "users", currentUser.uid), { displayName: newName, bio: newBio, photoURL: newPic });

        const q = query(collection(db, "videos"));
        const snapshot = await getDocs(q);
        snapshot.forEach(async(vDoc) => {
            if (vDoc.data().authorUid === currentUser.uid) { await updateDoc(doc(db, "videos", vDoc.id), { authorName: newName, authorPic: newPic }); }
        });

        document.getElementById('profile-name').innerHTML = newName + (currentUser.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : '');
        document.getElementById('profile-title').innerText = '@' + newName;
        document.getElementById('profile-bio').innerText = newBio;
        document.getElementById('profile-pic').src = newPic;
        showToast("Profil erfolgreich aktualisiert!");
        document.getElementById('settings-modal').classList.remove('show');
    } catch (e) { showCustomAlert("Fehler", "Fehler beim Speichern der Profildaten."); } finally {
        btn.innerText = "Profil Speichern";
        btn.disabled = false;
    }
});

document.getElementById('open-admin-dashboard').addEventListener('click', () => {
    switchView('admin');
    loadAdminDashboard();
});

window.loadAdminDashboard = async function() {
    if (currentUser.email !== "schleimyverteilung@gmail.com") return;

    const userList = document.getElementById('admin-user-list');
    userList.innerHTML = '<div class="loading-screen"><i class="fas fa-spinner fa-spin"></i></div>';

    try {
        const usersSnap = await getDocs(collection(db, "users"));
        document.getElementById('admin-total-users').innerText = usersSnap.size;
        document.getElementById('admin-total-videos').innerText = allVideosData.length;

        userList.innerHTML = '';
        usersSnap.forEach(docSnap => {
            const u = docSnap.data();
            const isVerif = u.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : '';
            userList.innerHTML += `
                <div class="admin-user-card">
                    <div class="admin-user-header" onclick="openProfile('${u.uid}')" style="cursor:pointer;">
                        <img src="${u.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback'}">
                        <div>
                            <strong>@${u.displayName} ${isVerif}</strong>
                            <div style="font-size:11px; color:#888;">${u.email} | Coins: ${u.coins || 0}</div>
                        </div>
                    </div>
                    <div class="admin-actions">
                        <button class="admin-btn btn-blue" onclick="toggleVerifyAdmin('${u.uid}', ${u.verified || false})">${u.verified ? 'Haken entfernen' : 'Haken geben'}</button>
                        <button class="admin-btn btn-gold" onclick="giveCoins('${u.uid}')">+1000 Coins</button>
                    </div>
                </div>
            `;
        });
    } catch (e) {}
}

window.toggleVerifyAdmin = async function(targetUid, currentStatus) {
    try {
        await updateDoc(doc(db, "users", targetUid), { verified: !currentStatus });
        showToast(!currentStatus ? "Blauer Haken vergeben!" : "Blauer Haken entfernt.");
        loadAdminDashboard();
    } catch (e) { showCustomAlert("Fehler", "Berechtigung verweigert."); }
};

window.giveCoins = async function(targetUid) {
    try {
        await updateDoc(doc(db, "users", targetUid), { coins: increment(1000) });
        showToast("1000 Coins gutgeschrieben! 💰");
        loadAdminDashboard();
    } catch (e) {}
};

function initLiveChat() {
    const chatBox = document.getElementById('chat-box');
    onSnapshot(query(collection(db, "global_chat"), orderBy("timestamp", "asc")), (snapshot) => {
        chatBox.innerHTML = '';
        if (snapshot.empty) { chatBox.innerHTML = '<div class="empty-state" style="height: 100%;"><p>Sag Hallo!</p></div>'; return; }
        snapshot.forEach((doc) => {
            const msg = doc.data();
            const isMe = msg.userUid === currentUser.uid ? 'me' : '';
            const badge = msg.userVerified ? '<i class="fas fa-check-circle verified-badge"></i>' : '';
            chatBox.innerHTML += `<div class="chat-msg ${isMe}"><img src="${msg.userPic}" class="chat-avatar" onclick="openProfile('${msg.userUid}')"><div><span class="chat-username">@${msg.userName}${badge}</span><div class="chat-bubble">${msg.text}</div></div></div>`;
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}
document.getElementById('send-chat-btn').addEventListener('click', async() => {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !currentUser) return;
    input.value = '';
    await addDoc(collection(db, "global_chat"), { userUid: currentUser.uid, userName: currentUser.displayName, userPic: currentUser.photoURL, userVerified: currentUser.verified || false, text: text, timestamp: Date.now() });
});
document.getElementById('chat-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('send-chat-btn').click(); });

document.getElementById('search-input').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const resultsGrid = document.getElementById('search-results');
    const trendingSection = document.getElementById('trending-tags');
    if (query.length < 2) {
        resultsGrid.style.display = 'none';
        trendingSection.style.display = 'block';
        return;
    }
    trendingSection.style.display = 'none';
    resultsGrid.style.display = 'grid';
    const results = allVideosData.filter(v => (v.authorName || "").toLowerCase().includes(query) || (v.description || "").toLowerCase().includes(query));
    resultsGrid.innerHTML = results.length === 0 ? '<div style="grid-column: span 3; text-align: center; margin-top: 50px; color: #555;">Nichts gefunden 😔</div>' : results.map(v => `<div class="grid-item" onclick="switchView('feed')"><video src="${v.url}#t=0.5" muted playsinline></video><div class="grid-views">@${v.authorName}</div></div>`).join('');
});

function renderComments(id) {
    const list = document.getElementById('comment-list');
    const video = allVideosData.find(v => v.id === id);
    if (video && video.comments && video.comments.length > 0) {
        list.innerHTML = video.comments.map((c, index) => {
            const badge = c.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : '';
            const canDelete = currentUser && (currentUser.uid === c.uid || currentUser.email === "schleimyverteilung@gmail.com");
            const deleteBtn = canDelete ? `<i class="fas fa-trash delete-comment-icon" onclick="deleteComment('${id}', ${index})"></i>` : '';

            return `<div class="comment" style="display:flex; align-items:flex-start; width:100%;"><img src="${c.pic}" alt="User"><div style="flex:1;"><strong>@${c.name}${badge}</strong><p>${c.text}</p></div>${deleteBtn}</div>`;
        }).join('');
    } else {
        list.innerHTML = '<div class="no-comments">Sei der Erste, der kommentiert!</div>';
    }
}
document.getElementById('submit-comment').addEventListener('click', async() => {
    const input = document.getElementById('new-comment-input');
    if (!input.value.trim() || !window.currentCommentVideoId || !currentUser) return;
    const comment = { uid: currentUser.uid, name: currentUser.displayName, pic: currentUser.photoURL, verified: currentUser.verified || false, text: input.value.trim() };
    await updateDoc(doc(db, "videos", window.currentCommentVideoId), { comments: arrayUnion(comment) });
    input.value = '';
});

document.getElementById('up-file').addEventListener('change', function() {
    document.querySelector('.file-upload-design p').innerText = this.files[0] ? this.files[0].name : "Video auswählen";
    document.querySelector('.file-upload-design i').className = "fas fa-check-circle";
    document.querySelector('.file-upload-design i').style.color = "#ff0050";
});
document.getElementById('submit-upload').addEventListener('click', async() => {
    const file = document.getElementById('up-file').files[0];
    const desc = document.getElementById('up-desc').value.trim();
    if (!file || !desc) return showCustomAlert("Fehlende Daten", "Bitte wähle ein Video aus und schreibe eine Beschreibung.");
    if (file.size > 20 * 1024 * 1024) return showCustomAlert("Video zu groß", "Maximal 20 MB!");

    const btn = document.getElementById('submit-upload');
    const status = document.getElementById('upload-status');
    btn.disabled = true;
    status.innerText = "Wird verarbeitet... Bitte warten!";
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);

    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_NAME}/video/upload`, { method: 'POST', body: formData });
        const data = await res.json();
        if (!data.secure_url) throw new Error("Upload fehlgeschlagen.");
        await addDoc(collection(db, "videos"), { url: data.secure_url, authorUid: currentUser.uid, authorName: currentUser.displayName, authorPic: currentUser.photoURL, authorVerified: currentUser.verified || false, description: desc, likedBy: [], gifts: 0, comments: [] });
        showToast("Video veröffentlicht! 🎉");
        document.getElementById('upload-modal').classList.remove('show');
        document.getElementById('up-file').value = '';
        document.getElementById('up-desc').value = '';
        document.querySelector('.file-upload-design p').innerText = "Video auswählen";
        document.querySelector('.file-upload-design i').className = "fas fa-cloud-upload-alt";
        document.querySelector('.file-upload-design i').style.color = "#aaa";
    } catch (e) { showCustomAlert("Upload Fehler", "Fehler! Cloudinary Name korrekt?"); } finally {
        btn.disabled = false;
        status.innerText = "";
    }
});

document.getElementById('open-upload').addEventListener('click', () => document.getElementById('upload-modal').classList.add('show'));
document.getElementById('close-upload').addEventListener('click', () => document.getElementById('upload-modal').classList.remove('show'));
document.getElementById('close-comments').addEventListener('click', () => document.getElementById('comment-modal').classList.remove('show'));
document.getElementById('close-settings').addEventListener('click', () => document.getElementById('settings-modal').classList.remove('show'));

function initResponsiveLayout() {
    const appContainer = document.querySelector('.app');
    const originalNav = appContainer.querySelector('.app__bottom-nav');

    let currentMode = '';
    let pcSidebar = null;

    function createPCContainers() {
        if (!pcSidebar) {
            pcSidebar = document.createElement('div');
            pcSidebar.id = 'pc-nav-sidebar';
            pcSidebar.innerHTML = `
                <div class="logo-area">
                    <div class="logo-pulse"><i class="fas fa-play"></i></div>
                    Phil Shorts
                </div>
                `;
            appContainer.prepend(pcSidebar);
        }
    }

    function restructureVideoForPC(videoEl) {
        let infoPanel = videoEl.querySelector('#pc-info-panel-container');
        if (!infoPanel) {
            infoPanel = document.createElement('div');
            infoPanel.id = 'pc-info-panel-container';
            videoEl.appendChild(infoPanel);

            const videoFooter = videoEl.querySelector('.video__footer');
            const videoSidebar = videoEl.querySelector('.video__sidebar');

            if (videoFooter) infoPanel.appendChild(videoFooter);
            if (videoSidebar) infoPanel.appendChild(videoSidebar);
        }
    }

    function rollBackVideoForHandy(videoEl) {
        const infoPanel = videoEl.querySelector('#pc-info-panel-container');
        if (infoPanel) {
            const videoFooter = infoPanel.querySelector('.video__footer');
            const videoSidebar = infoPanel.querySelector('.video__sidebar');

            if (videoFooter) videoEl.appendChild(videoFooter);
            if (videoSidebar) videoEl.appendChild(videoSidebar);

            infoPanel.remove();
        }
    }

    function checkResponsiveMode() {
        const isPC = window.innerWidth > 768;

        if (isPC && currentMode !== 'pc') {
            currentMode = 'pc';
            createPCContainers();

            if (originalNav) pcSidebar.appendChild(originalNav);

            document.querySelectorAll('.app__videos .video').forEach(restructureVideoForPC);
        } else if (!isPC && currentMode !== 'handy') {
            currentMode = 'handy';

            if (originalNav) appContainer.appendChild(originalNav);

            if (pcSidebar) {
                pcSidebar.remove();
                pcSidebar = null;
            }

            document.querySelectorAll('.app__videos .video').forEach(rollBackVideoForHandy);
        }
    }

    checkResponsiveMode();
    window.addEventListener('resize', checkResponsiveMode);

    if (isPCLayoutActive()) {
        const videoObserver = new MutationObserver(function(mutations) {
            if (currentMode === 'pc') {
                mutations.forEach(function(mutation) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.classList && node.classList.contains('video')) {
                            restructureVideoForPC(node);
                        }
                    });
                });
            }
        });

        const videoContainer = document.getElementById('video-container');
        if (videoContainer) {
            videoObserver.observe(videoContainer, { childList: true });
        }
    }

    function isPCLayoutActive() {
        return window.innerWidth > 768;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initResponsiveLayout);
} else {
    initResponsiveLayout();
}