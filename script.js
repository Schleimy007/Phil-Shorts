import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, updateDoc, increment, addDoc, arrayUnion, arrayRemove, deleteDoc, onSnapshot, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const GIPHY_API_KEY = "Vj2uCqfOmAT1sXEKQgQvneGy60VIxgCk";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let allVideosData = [];
let allKnownUsers = [];
let currentUser = JSON.parse(localStorage.getItem('phil_session'));
if (currentUser) currentUser.verified = false;

let notifSettings = JSON.parse(localStorage.getItem('phil_notif_settings')) || { master: false, comments: true, likes: true, dms: true, follows: true };

window.sendDesktopNotification = function(title, body, type) {
    if (!("Notification" in window) || !notifSettings.master || Notification.permission !== "granted") return;
    if (type === 'comment' && !notifSettings.comments) return;
    if ((type === 'like' || type === 'gift') && !notifSettings.likes) return;
    if (type === 'message' && !notifSettings.dms) return;
    if (type === 'follow' && !notifSettings.follows) return;
    try {
        const notif = new Notification(title, { body: body });
        notif.onclick = function() {
            window.focus();
            this.close();
        };
    } catch (e) { console.error(e); }
};

function updateNotifUI() {
    const masterToggle = document.getElementById('notif-master');
    const subSettings = document.getElementById('notif-sub-settings');
    if (!masterToggle) return;
    masterToggle.checked = notifSettings.master;
    document.getElementById('notif-comments').checked = notifSettings.comments;
    document.getElementById('notif-likes').checked = notifSettings.likes;
    document.getElementById('notif-dms').checked = notifSettings.dms;
    document.getElementById('notif-follows').checked = notifSettings.follows;
    if (notifSettings.master) {
        subSettings.style.opacity = '1';
        subSettings.style.pointerEvents = 'auto';
    } else {
        subSettings.style.opacity = '0.5';
        subSettings.style.pointerEvents = 'none';
    }
}

document.getElementById('notif-master').addEventListener('change', async(e) => {
    if (e.target.checked) {
        if (!("Notification" in window)) {
            showCustomAlert("Nicht unterstützt", "Browser unterstützt keine Desktop-Benachrichtigungen.");
            e.target.checked = false;
            return;
        }
        if (Notification.permission === "denied") {
            showCustomAlert("Blockiert!", "Du hast Benachrichtigungen blockiert.");
            e.target.checked = false;
            notifSettings.master = false;
            updateNotifUI();
            return;
        }
        if (Notification.permission !== "granted") {
            const perm = await Notification.requestPermission();
            if (perm !== "granted") {
                e.target.checked = false;
                notifSettings.master = false;
                updateNotifUI();
                return;
            }
        }
    }
    notifSettings.master = e.target.checked;
    localStorage.setItem('phil_notif_settings', JSON.stringify(notifSettings));
    updateNotifUI();
});

['comments', 'likes', 'dms', 'follows'].forEach(id => {
    document.getElementById(`notif-${id}`).addEventListener('change', (e) => {
        notifSettings[id] = e.target.checked;
        localStorage.setItem('phil_notif_settings', JSON.stringify(notifSettings));
    });
});

let currentFeedMode = 'foryou';
let isInitialLoad = true;
let sortedFeed = [];
const viewedVideos = new Set();
window.globalVolume = 1;
window.globalMuted = false;

window.switchView = function(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + viewId).classList.add('active');
    document.querySelectorAll('.nav__item').forEach(n => n.classList.remove('active'));
    if (viewId === 'feed') document.querySelectorAll('.nav__item')[0].classList.add('active');
    if (viewId === 'search') document.querySelectorAll('.nav__item')[1].classList.add('active');
    if (viewId === 'inbox' || viewId === 'dm' || viewId === 'ticket') document.querySelectorAll('.nav__item')[3].classList.add('active');
    if (viewId === 'profile' && currentUser && document.getElementById('profile-name').innerText.includes(currentUser.displayName)) document.querySelectorAll('.nav__item')[4].classList.add('active');
    if (viewId !== 'feed') document.querySelectorAll('.video__player').forEach(v => {
        v.pause();
        v.currentTime = 0;
    });
};

window.jumpToVideo = function(videoId) {
    switchView('feed');
    setTimeout(() => {
        const targetVid = document.querySelector(`.video[data-id="${videoId}"]`);
        if (targetVid) {
            targetVid.scrollIntoView({ behavior: 'smooth', block: 'center' });
            document.querySelectorAll('.video__player').forEach(v => {
                v.pause();
                v.currentTime = 0;
            });
            const player = targetVid.querySelector('.video__player');
            if (player) {
                player.muted = window.globalMuted;
                player.play().catch(() => {});
            }
        }
    }, 250);
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
document.getElementById('close-alert-btn').addEventListener('click', () => { document.getElementById('custom-alert-modal').classList.remove('show'); });

function parseJwt(token) { var base64Url = token.split('.')[1]; var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/'); var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join('')); return JSON.parse(jsonPayload); }

function getUserData(uid, fallbackName, fallbackUsername, fallbackPic, fallbackVerified) { const user = allKnownUsers.find(u => u.uid === uid); return { displayName: user ? user.displayName : fallbackName, username: user && user.username ? user.username : (user ? user.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() : (fallbackUsername || fallbackName)), pic: user ? user.photoURL : fallbackPic, verified: user ? (user.verified === true) : fallbackVerified, philPlusUntil: user ? user.philPlusUntil : 0 }; }

function getVerifiedBadge(isVerif) { return isVerif ? '<i class="fas fa-check-circle verified-badge"></i>' : ''; }

function timeAgo(timestamp) { const now = Date.now(); const diff = now - Number(timestamp); const minutes = Math.floor(diff / 60000); const hours = Math.floor(minutes / 60); const days = Math.floor(hours / 24); if (minutes < 1) return 'gerade eben'; if (minutes < 60) return `vor ${minutes} Min.`; if (hours < 24) return `vor ${hours} Std.`; if (days < 7) return `vor ${days} T.`; return new Date(Number(timestamp)).toLocaleDateString('de-DE'); }

window.formatText = function(text) {
    if (!text) return "";
    let safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    safeText = safeText.replace(/#([a-zA-Z0-9_äöüÄÖÜß]+)/g, '<span class="hashtag" onclick="openHashtag(\'$1\', event)">#$1</span>');
    safeText = safeText.replace(/@([a-zA-Z0-9_]+)/g, '<span class="mention" onclick="openProfileByUsername(\'$1\', event)">@$1</span>');
    return safeText;
};

window.openProfileByUsername = function(username, event) {
    if (event) event.stopPropagation();
    const user = allKnownUsers.find(u => (u.username || "").toLowerCase() === username.toLowerCase());
    if (user) openProfile(user.uid);
    else showToast("Nutzer @" + username + " nicht gefunden!");
};
window.openHashtag = function(tag, event) {
    if (event) event.stopPropagation();
    switchView('hashtag');
    document.getElementById('hashtag-title').innerText = '#' + tag;
    const grid = document.getElementById('hashtag-grid');
    grid.innerHTML = '';
    const matchedVideos = allVideosData.filter(v => (v.description || "").toLowerCase().includes('#' + tag.toLowerCase()));
    if (matchedVideos.length === 0) { grid.innerHTML = '<div style="grid-column: span 3; text-align: center; margin-top: 50px; color: #555;">Keine Videos gefunden</div>'; return; }
    matchedVideos.forEach(v => {
        const previewSrc = v.mediaType === 'images' && v.urls ? v.urls[0] : `${v.url}#t=0.5`;
        const mediaTag = v.mediaType === 'images' ? `<img src="${previewSrc}" style="width:100%; height:100%; object-fit:cover;">` : `<video src="${previewSrc}" muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>`;
        const icon = v.mediaType === 'images' ? 'fa-images' : 'fa-play';
        grid.innerHTML += `<div class="grid-item" onclick="jumpToVideo('${v.id}')">${mediaTag}<div class="grid-views"><i class="fas ${icon}"></i> ${v.likedBy ? v.likedBy.length : 0}</div></div>`;
    });
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
        if (match) {
            activeMentionInput = e.target;
            mentionStartIndex = cursorPos - match[0].length;
            showMentionSuggestions(e.target, match[1].toLowerCase());
        } else hideMentionSuggestions();
    }
});

window.showMentionSuggestions = function(inputEl, query) {
    const matchedUsers = allKnownUsers.filter(u => (u.username || "").toLowerCase().startsWith(query) || (u.displayName || "").toLowerCase().startsWith(query)).slice(0, 5);
    const box = document.getElementById('mention-suggestions');
    if (!box) return;
    if (matchedUsers.length === 0) { box.style.display = 'none'; return; }
    box.innerHTML = matchedUsers.map(u => `<div class="mention-item" onclick="selectMention('${u.username}')"><img src="${u.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback'}"><span>${u.username}</span></div>`).join('');
    const rect = inputEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    box.style.left = rect.left + 'px';
    if (spaceBelow > 200) {
        box.style.top = (rect.bottom + 5) + 'px';
        box.style.bottom = 'auto';
    } else {
        box.style.top = 'auto';
        box.style.bottom = (window.innerHeight - rect.top + 5) + 'px';
    }
    box.style.display = 'block';
};
window.selectMention = function(username) {
    if (!activeMentionInput) return;
    const val = activeMentionInput.value;
    activeMentionInput.value = val.substring(0, mentionStartIndex) + '@' + username + ' ' + val.substring(activeMentionInput.selectionStart);
    hideMentionSuggestions();
    activeMentionInput.focus();
};
window.hideMentionSuggestions = function() {
    const box = document.getElementById('mention-suggestions');
    if (box) box.style.display = 'none';
    activeMentionInput = null;
};
document.addEventListener('click', (e) => { if (!e.target.closest('#mention-suggestions') && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') hideMentionSuggestions(); });

let userUnsubscribe = null;

function checkPhilPlusStatus() { if (!currentUser) return false; return currentUser.philPlusUntil && currentUser.philPlusUntil > Date.now(); }

function applyAppTheme(themeName) { if (!themeName || themeName === 'default') { document.body.className = ''; } else { document.body.className = `theme-${themeName}`; } }

function initLiveUser() {
    if (!currentUser) return;
    if (userUnsubscribe) userUnsubscribe();
    userUnsubscribe = onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.banned) {
                localStorage.removeItem('phil_session');
                alert("Dein Account wurde gesperrt.");
                window.location.reload();
                return;
            }
            currentUser = {...currentUser, ...data };
            if (currentUser.coins === undefined) currentUser.coins = 1000;
            if (!currentUser.followers) currentUser.followers = [];
            if (!currentUser.following) currentUser.following = [];
            if (!currentUser.username) currentUser.username = currentUser.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
            if (!currentUser.decorations) currentUser.decorations = [];
            if (!currentUser.appTheme) currentUser.appTheme = 'default';
            localStorage.setItem('phil_session', JSON.stringify(currentUser));

            if (checkPhilPlusStatus()) {
                applyAppTheme(currentUser.appTheme);
                document.getElementById('app-theme-select').value = currentUser.appTheme;
            } else { applyAppTheme('default'); }

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
                updateProfileBorder(currentUser.activeBorder, 'profile-pic');
                if (checkPhilPlusStatus()) { document.getElementById('phil-plus-badge-container').style.display = 'block'; } else { document.getElementById('phil-plus-badge-container').style.display = 'none'; }
            }
        }
    });
}

function updateProfileBorder(borderName, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.className = 'profile-image';
    if (borderName) el.classList.add(`border-${borderName}`);
}

function initSearchUsers() {
    onSnapshot(collection(db, "users"), (snapshot) => {
        allKnownUsers = [];
        snapshot.forEach(doc => allKnownUsers.push(doc.data()));
        allKnownUsers.forEach(u => {
            const isVerif = u.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : '';
            const cleanUsername = u.username || u.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
            let nameClass = "";
            if (u.philPlusUntil && u.philPlusUntil > Date.now()) nameClass = "name-phil-plus";
            document.querySelectorAll(`.live-name-${u.uid}`).forEach(el => {
                el.innerHTML = u.displayName + isVerif;
                if (nameClass) el.classList.add(nameClass);
                else el.classList.remove("name-phil-plus");
            });
            document.querySelectorAll(`.live-username-${u.uid}`).forEach(el => el.innerText = '@' + cleanUsername);
            document.querySelectorAll(`.live-pic-${u.uid}`).forEach(el => {
                el.src = u.photoURL;
                if (u.activeBorder) {
                    el.style.border = "none";
                    el.className = el.className.replace(/border-[^\s]+/g, '');
                    el.classList.add(`border-${u.activeBorder}`);
                }
            });
        });
    });
}

window.addEventListener('googleLoginSuccess', async(event) => {
    try {
        const data = parseJwt(event.detail.credential);
        const uid = data.sub;
        const rawDisplayName = data.name;
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
            while (!nameSnap.empty) {
                finalUser = baseUser + Math.floor(1000 + Math.random() * 9000);
                nameQuery = query(collection(db, "users"), where("username", "==", finalUser));
                nameSnap = await getDocs(nameQuery);
            }
            const newUser = { uid: uid, displayName: rawDisplayName, username: finalUser, email: email, photoURL: pic, bio: "Neu in der Community! 👋", following: [], followers: [], verified: false, coins: 1000, profileViews: 0, isAdmin: false, banned: false, decorations: [], activeBorder: "", stories: [], appTheme: 'default' };
            await setDoc(userRef, newUser);
            currentUser = newUser;
        } else {
            currentUser = userSnap.data();
            if (currentUser.banned) {
                showCustomAlert("Gesperrt", "Account gesperrt.");
                localStorage.removeItem('phil_session');
                currentUser = null;
                document.getElementById('login-screen').classList.add('show');
                return;
            }
            if (!currentUser.following) currentUser.following = [];
            if (!currentUser.decorations) currentUser.decorations = [];
            if (!currentUser.username) currentUser.username = currentUser.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
            if (currentUser.coins === undefined) await updateDoc(userRef, { coins: 1000, profileViews: 0, followers: [] });
        }
        localStorage.setItem('phil_session', JSON.stringify(currentUser));
        document.getElementById('login-screen').classList.remove('show');
        initLiveDatabase();
        initLiveUser();
        initInbox();
        initInboxChats();
        initSearchUsers();
    } catch (error) { showCustomAlert("Login Fehler", "Datenbank-Fehler beim Login."); }
});

window.onload = async function() {
    if (!currentUser) { document.getElementById('login-screen').classList.add('show'); } else {
        document.getElementById('login-screen').classList.remove('show');
        if (!currentUser.username) currentUser.username = currentUser.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        initLiveDatabase();
        initLiveUser();
        initInbox();
        initInboxChats();
        initSearchUsers();
    }
    document.getElementById('app-theme-select').addEventListener('change', (e) => {
        if (e.target.value !== 'default' && !checkPhilPlusStatus()) {
            showCustomAlert("Premium Feature", "App Themes erfordern Phil Shorts+!");
            e.target.value = 'default';
            return;
        }
        applyAppTheme(e.target.value);
        if (currentUser) { updateDoc(doc(db, "users", currentUser.uid), { appTheme: e.target.value }); }
    });
};

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('phil_session');
    window.location.reload();
});

async function addNotification(targetUid, type, text, videoId = null) {
    if (!currentUser || targetUid === currentUser.uid) return;
    await addDoc(collection(db, "users", targetUid, "notifications"), { fromUid: currentUser.uid, fromName: currentUser.displayName, fromUsername: currentUser.username, fromPic: currentUser.photoURL, type: type, text: text, videoId: videoId, timestamp: Date.now() });
}

function applyAlgorithm(videos, mode) {
    if (mode === 'following') { let followedVids = videos.filter(v => currentUser && currentUser.following && currentUser.following.includes(v.authorUid)); return followedVids.sort(() => Math.random() - 0.5); } else {
        let scoredVids = videos.map(v => {
            let likes = v.likedBy ? v.likedBy.length : 0;
            let comments = v.comments ? v.comments.length : 0;
            let gifts = v.gifts || 0;
            let engagementScore = (likes * 5) + (comments * 10) + (gifts * 20);
            let baseViralPower = Math.log(engagementScore + 1) * 30;
            let authorData = allKnownUsers.find(u => u.uid === v.authorUid);
            if (authorData && authorData.philPlusUntil && authorData.philPlusUntil > Date.now()) baseViralPower += 50;
            let affinityScore = 0;
            if (currentUser) { if (currentUser.following && currentUser.following.includes(v.authorUid)) affinityScore += 30; if (v.likedBy && v.likedBy.includes(currentUser.uid)) affinityScore -= 40; if (v.authorUid === currentUser.uid) affinityScore -= 100; }
            return {...v, algoScore: baseViralPower + affinityScore + (Math.random() * 120) };
        });
        return scoredVids.sort((a, b) => b.algoScore - a.algoScore);
    }
}

function initLiveDatabase() {
    document.getElementById('video-container').innerHTML = '<div class="loading-screen"><i class="fas fa-spinner fa-spin"></i><p>Lade Algorithmus...</p></div>';
    onSnapshot(collection(db, "videos"), (snapshot) => {
        allVideosData = [];
        snapshot.forEach(doc => allVideosData.push({ id: doc.id, ...doc.data() }));
        allVideosData.reverse();
        if (isInitialLoad) {
            renderFeed(true);
            isInitialLoad = false;
            const urlParams = new URLSearchParams(window.location.search);
            const sharedVideoId = urlParams.get('video');
            if (sharedVideoId) {
                window.history.replaceState({}, document.title, window.location.pathname);
                setTimeout(() => jumpToVideo(sharedVideoId), 800);
            }
        } else {
            snapshot.docChanges().forEach((change) => {
                const vData = { id: change.doc.id, ...change.doc.data() };
                if (change.type === "added") {
                    if (!document.querySelector(`.video[data-id="${vData.id}"]`)) {
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
                }
                if (change.type === "modified") {
                    document.querySelectorAll(`.like-btn[data-id="${vData.id}"] .like-count`).forEach(el => el.innerText = vData.likedBy ? vData.likedBy.length : 0);
                    document.querySelectorAll(`.like-btn[data-id="${vData.id}"]`).forEach(btn => {
                        if (currentUser && vData.likedBy && vData.likedBy.includes(currentUser.uid)) btn.classList.add('liked');
                        else btn.classList.remove('liked');
                    });
                    document.querySelectorAll(`.comment-btn[data-id="${vData.id}"] .comment-count-txt`).forEach(el => el.innerText = vData.comments ? vData.comments.length : 0);
                    document.querySelectorAll(`.gift-btn[data-id="${vData.id}"] .gift-count`).forEach(el => el.innerText = vData.gifts || 0);
                    document.querySelectorAll(`.video[data-id="${vData.id}"] .video__footer .video-desc-preview`).forEach(el => {
                        let rawPreview = (vData.description || "").substring(0, 50);
                        let previewHtml = formatText(rawPreview);
                        if (vData.description && vData.description.length > 50) previewHtml += '... <strong>mehr anzeigen</strong>';
                        el.innerHTML = previewHtml;
                    });
                    document.querySelectorAll(`.video[data-id="${vData.id}"] .video__footer .video-title`).forEach(el => el.innerText = vData.title || 'Ohne Titel');
                    if (window.currentCommentVideoId === vData.id && document.getElementById('comment-modal').classList.contains('show')) renderComments(vData.id);
                    if (document.getElementById('video-details-modal').classList.contains('show') && document.getElementById('detail-title').innerText === (vData.title || 'Ohne Titel')) {
                        document.getElementById('detail-likes').innerHTML = `<i class="fas fa-heart" style="color: #ff0050;"></i> ${vData.likedBy ? vData.likedBy.length : 0}`;
                        document.getElementById('detail-views').innerHTML = `<i class="fas fa-play" style="color: #00f2fe;"></i> ${vData.views || 0}`;
                    }
                }
                if (change.type === "removed") { const vidEl = document.querySelector(`.video[data-id="${vData.id}"]`); if (vidEl) vidEl.remove(); }
            });
            if (document.getElementById('view-profile').classList.contains('active')) { const currentProfileUid = document.getElementById('profile-action-btn').dataset.uid; if (currentProfileUid) window.renderProfileGrid(currentProfileUid); }
        }
    }, (error) => { document.getElementById('video-container').innerHTML = '<div class="empty-state"><h3>Netzwerkfehler</h3></div>'; });
}

function renderFeed(reset = false) {
    const container = document.getElementById('video-container');
    if (reset) {
        container.innerHTML = '';
        sortedFeed = applyAlgorithm(allVideosData, currentFeedMode);
        if (sortedFeed.length === 0) {
            const emptyTxt = currentFeedMode === 'following' ? 'Folge Creatorn' : 'Feed ist leer';
            const emptyIco = currentFeedMode === 'following' ? 'fa-user-plus' : 'fa-video-slash';
            container.innerHTML = `<div class="empty-state"><i class="fas ${emptyIco}"></i><h3>${emptyTxt}</h3></div>`;
            return;
        }
        sortedFeed.forEach(video => container.appendChild(createVideoElement(video)));
        appendLoader(container, true);
    }
}

function appendLoader(container, isEnd) {
    const loader = document.createElement('div');
    loader.className = 'feed-end-loader';
    if (isEnd) {
        loader.innerHTML = '<i class="fas fa-check-circle"></i><span>Du bist auf dem neueste Stand</span>';
        loader.classList.add('no-more');
    } else { loader.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Prüfe Algorithmus...</span>'; }
    container.appendChild(loader);
}

window.updateGlobalVolumeUI = function() {
    document.querySelectorAll('.video-inner').forEach(container => {
        const v = container.querySelector('.video__player');
        const muteBtn = container.querySelector('.mute-btn');
        const volumeSlider = container.querySelector('.volume-slider');
        if (!v || !muteBtn || !volumeSlider) return;
        v.volume = window.globalVolume;
        v.muted = window.globalMuted;
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
window.scrollCarousel = function(vidId, dir, event) {
    if (event) event.stopPropagation();
    const container = document.querySelector(`.carousel-container[data-vid="${vidId}"]`);
    if (container) {
        const scrollAmount = container.clientWidth;
        container.scrollBy({ left: dir * scrollAmount, behavior: 'smooth' });
    }
};

function createVideoElement(video) {
    const div = document.createElement('div');
    div.className = "video";
    div.dataset.id = video.id;
    const commentCount = video.comments ? video.comments.length : 0;
    const isMe = currentUser && video.authorUid === currentUser.uid;
    const isFollowing = currentUser && currentUser.following && currentUser.following.includes(video.authorUid);
    const plusButton = (!isMe) ? `<i class="fas fa-circle-plus follow-btn" data-target="${video.authorUid}" onclick="toggleFollow('${video.authorUid}', this, event)" style="${isFollowing ? 'display: none;' : ''}"></i>` : '';
    const authorData = getUserData(video.authorUid, video.authorName, video.authorUsername || video.authorName, video.authorPic, video.authorVerified);
    const verifiedBadge = getVerifiedBadge(authorData.verified);
    let nameClass = authorData.philPlusUntil > Date.now() ? "name-phil-plus" : "";
    const hasLiked = video.likedBy && video.likedBy.includes(currentUser.uid) ? 'liked' : '';
    const realLikes = video.likedBy ? video.likedBy.length : 0;
    const canDeleteVideo = currentUser && (video.authorUid === currentUser.uid || currentUser.email === "schleimyverteilung@gmail.com" || currentUser.isAdmin);
    const deleteVideoBtn = canDeleteVideo ? `<div class="videoSidebar__button" onclick="deleteVideo('${video.id}')" style="margin-top:15px;"><i class="fas fa-trash" style="color: #ff4444; font-size:24px;"></i></div>` : '';
    const editVideoBtn = isMe ? `<div class="videoSidebar__button" onclick="openEditVideo('${video.id}')" style="margin-top:15px;"><i class="fas fa-pen" style="font-size:24px;"></i></div>` : '';

    const mutedAttr = window.globalMuted ? 'muted' : '';
    let mediaHTML = '';
    let muteUIHtml = '';
    if (video.mediaType === 'images' && video.urls && video.urls.length > 0) {
        let arrowsHTML = '';
        if (video.urls.length > 1) { arrowsHTML = `<div class="carousel-arrow left" onclick="window.scrollCarousel('${video.id}', -1, event)"><i class="fas fa-chevron-left"></i></div><div class="carousel-arrow right" onclick="window.scrollCarousel('${video.id}', 1, event)"><i class="fas fa-chevron-right"></i></div>`; }
        mediaHTML = `<div class="carousel-container" data-vid="${video.id}">${video.urls.map(u => `<div class="carousel-item"><img src="${u}"></div>`).join('')}</div>${arrowsHTML}<div class="carousel-dots">${video.urls.map((_, i) => `<div class="dot ${i===0 ? 'active' : ''}"></div>`).join('')}</div>`; muteUIHtml = `<div class="mute-container" style="display:none;"></div>`;
    } else {
        mediaHTML = `<video class="video__player" data-vid="${video.id}" preload="auto" loop playsinline ${mutedAttr} src="${video.url}"></video><div class="play-indicator"><i class="fas fa-play"></i></div><div class="player-progress-bar"><div class="player-progress-filled"></div></div>`;
        muteUIHtml = `<div class="mute-container"><div class="mute-btn"><i class="fas fa-volume-up"></i></div><div class="volume-slider-wrapper"><input type="range" class="volume-slider" min="0" max="1" step="0.05" value="1"></div></div>`;
    }
    let rawPreview = (video.description || "").substring(0, 50); let previewHtml = formatText(rawPreview); if ((video.description && video.description.length > 50)) previewHtml += '... <strong>mehr anzeigen</strong>';

    div.innerHTML = `<div class="video-inner is-paused"><div class="video-wrapper">${mediaHTML}${muteUIHtml}<div class="like-animation"><i class="fas fa-heart"></i></div><div class="gift-animation" id="gift-anim-${video.id}"></div></div><div class="video__footer"><h3 class="creator-name" onclick="openProfile('${video.authorUid}')"><span class="live-name-${video.authorUid} ${nameClass}">${authorData.displayName}${verifiedBadge}</span></h3><p class="live-username-${video.authorUid}" style="color:#aaa; font-size:13px; margin-bottom:5px; cursor:pointer;" onclick="openProfile('${video.authorUid}')">@${authorData.username}</p><h4 class="video-title" onclick="openVideoDetails('${video.id}')">${video.title || 'Ohne Titel'}</h4><p class="video-desc-preview" onclick="openVideoDetails('${video.id}')">${previewHtml}</p></div><div class="video__sidebar"><div class="sidebar__profile" onclick="openProfile('${video.authorUid}')"><img src="${authorData.pic}" class="live-pic-${video.authorUid}" alt="Profil">${plusButton}</div><div class="videoSidebar__button like-btn ${hasLiked}" data-id="${video.id}"><i class="fas fa-heart"></i><p class="like-count">${realLikes}</p></div><div class="videoSidebar__button comment-btn" data-id="${video.id}"><i class="fas fa-comment-dots"></i><p class="comment-count-txt">${commentCount}</p></div><div class="videoSidebar__button gift-btn" data-id="${video.id}"><i class="fas fa-gift" style="color: #ffd700;"></i><p class="gift-count">${video.gifts || 0}</p></div><div class="videoSidebar__button share-btn" data-id="${video.id}"><i class="fas fa-share"></i><p>Teilen</p></div>${editVideoBtn}${deleteVideoBtn}</div></div>`;
    attachInteractionsToVideo(div); return div;
}

window.openVideoDetails = function(id) {
    const video = allVideosData.find(v => v.id === id); if (!video) return;
    document.getElementById('detail-title').innerText = video.title || 'Ohne Titel'; document.getElementById('detail-likes').innerHTML = `<i class="fas fa-heart" style="color: #ff0050;"></i> ${video.likedBy ? video.likedBy.length : 0}`; document.getElementById('detail-views').innerHTML = `<i class="fas fa-play" style="color: #00f2fe;"></i> ${video.views || 0}`; document.getElementById('detail-date').innerHTML = `<i class="fas fa-calendar" style="color: #ffd700;"></i> ${video.timestamp ? timeAgo(video.timestamp) : 'Unbekannt'}`; document.getElementById('detail-desc').innerHTML = formatText(video.description || ''); document.getElementById('video-details-modal').classList.add('show');
}
document.getElementById('close-details').addEventListener('click', () => { document.getElementById('video-details-modal').classList.remove('show'); });

window.openEditVideo = function(videoId) { const video = allVideosData.find(v => v.id === videoId); if (video) { window.currentEditVideoId = videoId; document.getElementById('edit-video-title').value = video.title || ""; document.getElementById('edit-video-desc').value = video.description || ""; document.getElementById('edit-video-modal').classList.add('show'); } };
document.getElementById('save-video-edit-btn').addEventListener('click', async() => { const newTitle = document.getElementById('edit-video-title').value.trim(); const newDesc = document.getElementById('edit-video-desc').value.trim(); if (!window.currentEditVideoId || (!newDesc && !newTitle)) return; try { document.getElementById('edit-video-modal').classList.remove('show'); showToast("Video aktualisiert!"); await updateDoc(doc(db, "videos", window.currentEditVideoId), { title: newTitle, description: newDesc }); } catch (e) { showCustomAlert("Fehler", "Konnte nicht gespeichert werden."); } });
document.getElementById('close-edit-video').addEventListener('click', () => { document.getElementById('edit-video-modal').classList.remove('show'); });

document.getElementById('tab-foryou').addEventListener('click', function() { document.getElementById('tab-following').classList.remove('active'); this.classList.add('active'); currentFeedMode = 'foryou'; renderFeed(true); });
document.getElementById('tab-following').addEventListener('click', function() { document.getElementById('tab-foryou').classList.remove('active'); this.classList.add('active'); currentFeedMode = 'following'; renderFeed(true); });

const videoContainer = document.getElementById('video-container');
videoContainer.addEventListener('scroll', () => { if (videoContainer.scrollTop + videoContainer.clientHeight >= videoContainer.scrollHeight - 20) { setTimeout(() => { const vids = document.querySelectorAll('.video'); if (vids.length) vids[vids.length - 1].scrollIntoView({ behavior: 'smooth' }); }, 800); } });
window.addEventListener('keydown', (e) => { if (document.getElementById('view-feed').classList.contains('active')) { if (e.key === 'ArrowDown') { e.preventDefault(); videoContainer.scrollBy({ top: videoContainer.clientHeight, behavior: 'smooth' }); } else if (e.key === 'ArrowUp') { e.preventDefault(); videoContainer.scrollBy({ top: -videoContainer.clientHeight, behavior: 'smooth' }); } } });

let scrollTimeout = null;
videoContainer.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; e.preventDefault(); if (scrollTimeout) return;
    if (e.deltaY > 0) { const vids = document.querySelectorAll('.video'); if (vids.length === 0) return; const lastVid = vids[vids.length - 1]; const rect = lastVid.getBoundingClientRect(); const containerRect = videoContainer.getBoundingClientRect(); if (rect.top <= containerRect.top + 10 && rect.bottom >= containerRect.bottom - 10) { videoContainer.scrollBy({ top: videoContainer.clientHeight * 0.15, behavior: 'smooth' }); setTimeout(() => { lastVid.scrollIntoView({ behavior: 'smooth' }); }, 800); } else { videoContainer.scrollBy({ top: videoContainer.clientHeight, behavior: 'smooth' }); } } else if (e.deltaY < 0) { videoContainer.scrollBy({ top: -videoContainer.clientHeight, behavior: 'smooth' }); }
    scrollTimeout = setTimeout(() => { scrollTimeout = null; }, 600);
}, { passive: false });

const videoObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
        const el = e.target; const vidId = el.dataset.id;
        if (e.isIntersecting && document.getElementById('view-feed').classList.contains('active')) {
            if (vidId && !viewedVideos.has(vidId)) { viewedVideos.add(vidId); updateDoc(doc(db, "videos", vidId), { views: increment(1) }).catch(() => {}); }
            const videoPlayer = el.querySelector('.video__player');
            if (videoPlayer) { document.querySelectorAll('.video__player').forEach(otherVid => { if (otherVid !== videoPlayer && !otherVid.paused) { otherVid.pause(); otherVid.currentTime = 0; } }); videoPlayer.muted = window.globalMuted; const playPromise = videoPlayer.play(); if (playPromise !== undefined) { playPromise.catch(error => { videoPlayer.pause(); const container = videoPlayer.closest('.video-inner'); if(container) container.classList.add('is-paused'); }); } }
        } else { const videoPlayer = el.querySelector('.video__player'); if (videoPlayer) { videoPlayer.pause(); videoPlayer.currentTime = 0; } }
    });
}, { threshold: 0.4 });

const allGifts = [ { id: 'g1', name: 'Rose', emoji: '🌹', price: 1 }, { id: 'g2', name: 'Kaffee', emoji: '☕', price: 1 }, { id: 'g3', name: 'Herz', emoji: '❤️', price: 5 }, { id: 'g4', name: 'GG', emoji: '🎮', price: 5 }, { id: 'g5', name: 'Mini 3663', emoji: '🧊', price: 10 }, { id: 'g6', name: 'Flamme', emoji: '🔥', price: 10 }, { id: 'g7', name: 'Applaus', emoji: '👏', price: 15 }, { id: 'g8', name: 'Brille', emoji: '🕶️', price: 20 }, { id: 'g9', name: 'Party', emoji: '🎉', price: 20 }, { id: 'g10', name: 'Flex', emoji: '💪', price: 50 }, { id: 'g11', name: '3663 Schild', emoji: '🛡️', price: 50 }, { id: 'g12', name: 'Diamant', emoji: '💎', price: 100 }, { id: 'g13', name: '3663 Krone', emoji: '👑', price: 100 }, { id: 'g14', name: 'Rakete', emoji: '🚀', price: 200 }, { id: 'g15', name: '3663 Kette', emoji: '⛓️', price: 250 }, { id: 'g16', name: 'Löwe', emoji: '🦁', price: 500 }, { id: 'g17', name: '3663 Auto', emoji: '🏎️', price: 500 }, { id: 'g18', name: 'Universum', emoji: '🌌', price: 1000 }, { id: 'g19', name: '3663 Villa', emoji: '🏰', price: 1000 }, { id: 'g20', name: '3663 Legende', emoji: '🦅', price: 5000 } ];

window.openGiftModal = function(videoId) {
    if (!currentUser) { showCustomAlert("Fehler", "Bitte logge dich ein."); return; } window.currentGiftVideoId = videoId; document.getElementById('gift-modal-coins').innerText = currentUser.coins || 0;
    const grid = document.getElementById('gift-grid'); grid.innerHTML = allGifts.map(g => `<div class="gift-card" onclick="sendSpecificGift('${g.id}', ${g.price}, '${g.emoji}', '${g.name}')"><span class="gift-emoji">${g.emoji}</span><span class="gift-name">${g.name}</span><span class="gift-price"><i class="fas fa-coins"></i> ${g.price}</span></div>`).join('');
    document.getElementById('gift-modal').classList.add('show');
};
document.getElementById('close-gift-modal').addEventListener('click', () => { document.getElementById('gift-modal').classList.remove('show'); });

window.sendSpecificGift = async function(giftId, price, emoji, name) {
    if (!currentUser || !window.currentGiftVideoId) return; if (currentUser.coins < price) return showCustomAlert("Zu wenig Coins", "Du hast nicht genug Coins für dieses Geschenk.");
    const targetVidData = allVideosData.find(vd => vd.id === window.currentGiftVideoId); if (!targetVidData || !targetVidData.authorUid) return showToast("Fehler beim Spenden!");
    document.getElementById('gift-modal').classList.remove('show'); currentUser.coins -= price; const myCoinsEl = document.getElementById('my-coins'); if (myCoinsEl) myCoinsEl.innerText = currentUser.coins;
    document.querySelectorAll(`.gift-btn[data-id="${window.currentGiftVideoId}"] .gift-count`).forEach(el => { let currentGifts = Number(el.innerText) || 0; el.innerText = currentGifts + price; });
    const anim = document.getElementById(`gift-anim-${window.currentGiftVideoId}`); if(anim) { anim.innerHTML = `${emoji}<span class="gift-animation-name">${name}</span>`; anim.style.animation = 'none'; void anim.offsetWidth; anim.style.animation = 'flyUpGift 2s ease-out forwards'; }
    showToast(`${name} gesendet! 🎁`);
    try { await updateDoc(doc(db, "users", currentUser.uid), { coins: increment(-price) }); await updateDoc(doc(db, "videos", window.currentGiftVideoId), { gifts: increment(price) }); await updateDoc(doc(db, "users", targetVidData.authorUid), { coins: increment(price) }); addNotification(targetVidData.authorUid, "gift", `hat dir ein ${name} ${emoji} gesendet!`, window.currentGiftVideoId); } catch (err) { console.error(err); showCustomAlert("Netzwerkfehler", "Geschenk konnte im Hintergrund nicht verarbeitet werden."); }
};

function attachInteractionsToVideo(videoContainerEl) {
    const v = videoContainerEl.querySelector('.video__player'); const c = videoContainerEl.querySelector('.carousel-container'); const container = videoContainerEl.querySelector('.video-inner'); videoObserver.observe(videoContainerEl); 
    let lastTap = 0;
    const handleDoubleTap = (e) => { const tapLength = new Date().getTime() - lastTap; if (tapLength < 300 && tapLength > 0) { const likeBtn = container.querySelector('.like-btn'); if (!likeBtn.classList.contains('liked')) { likeBtn.click(); } const anim = container.querySelector('.like-animation'); anim.style.animation = 'none'; setTimeout(() => anim.style.animation = 'doubleTapHeart 0.8s ease-out forwards', 10); e.preventDefault(); lastTap = 0; return true; } lastTap = new Date().getTime(); return false; };
    if (v) {
        v.addEventListener('play', () => container.classList.remove('is-paused')); v.addEventListener('pause', () => container.classList.add('is-paused'));
        v.addEventListener('click', (e) => { if (handleDoubleTap(e)) return; if (v.paused) { document.querySelectorAll('.video__player').forEach(vid => { if (vid !== v && !vid.paused) vid.pause(); }); window.globalMuted = false; v.muted = window.globalMuted; window.updateGlobalVolumeUI(); v.play().catch(err => console.log("Play error:", err)); } else { v.pause(); } });
        v.addEventListener('timeupdate', () => { const prog = container.querySelector('.player-progress-filled'); if(prog) prog.style.width = (v.currentTime / v.duration * 100) + '%'; });
        const muteContainer = container.querySelector('.mute-container'); const muteBtn = container.querySelector('.mute-btn'); const volumeSlider = container.querySelector('.volume-slider'); window.updateGlobalVolumeUI();
        if (muteBtn) { muteBtn.addEventListener('click', (e) => { e.stopPropagation(); window.globalMuted = !window.globalMuted; if (!window.globalMuted && window.globalVolume == 0) window.globalVolume = 1; window.updateGlobalVolumeUI(); }); }
        if (volumeSlider) { volumeSlider.addEventListener('input', (e) => { e.stopPropagation(); window.globalMuted = false; window.globalVolume = e.target.value; window.updateGlobalVolumeUI(); }); volumeSlider.addEventListener('mousedown', (e) => { e.stopPropagation(); muteContainer.classList.add('active-slider'); }); volumeSlider.addEventListener('touchstart', (e) => { e.stopPropagation(); muteContainer.classList.add('active-slider'); }, { passive: false }); }
    } else if (c) {
        container.classList.remove('is-paused'); c.addEventListener('click', (e) => handleDoubleTap(e));
        c.addEventListener('scroll', () => { const idx = Math.round(c.scrollLeft / c.clientWidth); const dots = videoContainerEl.querySelectorAll('.dot'); dots.forEach((d, i) => { if (i === idx) d.classList.add('active'); else d.classList.remove('active'); }); });
    }
    document.addEventListener('mouseup', () => document.querySelectorAll('.mute-container').forEach(mc => mc.classList.remove('active-slider'))); document.addEventListener('touchend', () => document.querySelectorAll('.mute-container').forEach(mc => mc.classList.remove('active-slider')));
    const mc = container.querySelector('.mute-container'); if (mc) mc.addEventListener('click', (e) => e.stopPropagation());
    container.querySelector('.like-btn').addEventListener('click', async(e) => { const btn = e.currentTarget; const id = btn.dataset.id; const isLiked = btn.classList.contains('liked'); const targetVidData = allVideosData.find(vd => vd.id === id); document.querySelectorAll(`.like-btn[data-id="${id}"]`).forEach(el => { const countEl = el.querySelector('.like-count'); let currentLikes = Number(countEl.innerText) || 0; if (isLiked) { el.classList.remove('liked'); countEl.innerText = Math.max(0, currentLikes - 1); } else { el.classList.add('liked'); countEl.innerText = currentLikes + 1; } }); if (isLiked) await updateDoc(doc(db, "videos", id), { likedBy: arrayRemove(currentUser.uid) }); else { await updateDoc(doc(db, "videos", id), { likedBy: arrayUnion(currentUser.uid) }); if (targetVidData) addNotification(targetVidData.authorUid, "like", "hat dein Post geliket.", id); } });
    container.querySelector('.gift-btn').addEventListener('click', (e) => { const id = e.currentTarget.dataset.id; openGiftModal(id); });
    container.querySelector('.comment-btn').addEventListener('click', (e) => { window.currentCommentVideoId = e.currentTarget.dataset.id; renderComments(window.currentCommentVideoId); document.getElementById('comment-modal').classList.add('show'); });
    container.querySelector('.share-btn').addEventListener('click', async(e) => { const vidId = e.currentTarget.dataset.id; const shareUrl = `${window.location.origin}${window.location.pathname}?video=${vidId}`; if (navigator.share) { try { await navigator.share({ title: 'Phil Shorts', text: 'Schau dir dieses an!', url: shareUrl }); } catch (err) {} } else { navigator.clipboard.writeText(shareUrl); showToast("Link kopiert!"); } });
}

window.deleteVideo = async function(videoId) { if (confirm("Möchtest du diesen Post wirklich endgültig löschen?")) { try { await deleteDoc(doc(db, "videos", videoId)); showToast("Post erfolgreich gelöscht! 🗑️"); if (document.getElementById('view-profile').classList.contains('active')) openProfile(document.getElementById('profile-action-btn').dataset.uid); } catch (e) { showCustomAlert("Fehler", "Konnte nicht gelöscht werden."); } } };

window.toggleCreatorHeart = async function(videoId, cId, rId = null) {
    if (!currentUser) return; const videoIndex = allVideosData.findIndex(v => v.id === videoId); if (videoIndex === -1) return; const video = allVideosData[videoIndex]; if (currentUser.uid !== video.authorUid) return;
    let comments = video.comments || []; const cIndex = comments.findIndex(c => c.cId === cId || c.cId === cId.toString()); if (cIndex === -1) return;
    if (rId) { if (comments[cIndex].replies) { const rIndex = comments[cIndex].replies.findIndex(r => r.rId === rId); if (rIndex > -1) { const currentState = comments[cIndex].replies[rIndex].creatorHeart || false; comments[cIndex].replies[rIndex].creatorHeart = !currentState; renderComments(videoId); await updateDoc(doc(db, "videos", videoId), { comments: comments }); if (!currentState && comments[cIndex].replies[rIndex].uid !== currentUser.uid) addNotification(comments[cIndex].replies[rIndex].uid, "like", "hat deiner Antwort ein Creator-Herz gegeben! ❤️", videoId); } } } 
    else { const currentState = comments[cIndex].creatorHeart || false; comments[cIndex].creatorHeart = !currentState; renderComments(videoId); await updateDoc(doc(db, "videos", videoId), { comments: comments }); if (!currentState && comments[cIndex].uid !== currentUser.uid) addNotification(comments[cIndex].uid, "like", "hat deinem Kommentar ein Creator-Herz gegeben! ❤️", videoId); }
};

window.toggleReplyBox = function(cId) { const box = document.getElementById(`reply-box-${cId}`); if (box) box.style.display = box.style.display === 'none' ? 'flex' : 'none'; };

window.submitReply = async function(videoId, cId) {
    if (!currentUser) return; const input = document.getElementById(`reply-input-${cId}`); const text = input.value.trim(); if (!text) return;
    const replyId = Date.now().toString(); const reply = { rId: replyId, uid: currentUser.uid, name: currentUser.displayName, username: currentUser.username, pic: currentUser.photoURL, verified: currentUser.verified || false, text: text, likes: [] };
    const videoIndex = allVideosData.findIndex(v => v.id === videoId); if (videoIndex > -1) { const comments = allVideosData[videoIndex].comments || []; const cIndex = comments.findIndex((c, idx) => c.cId === cId || idx.toString() === cId); if (cIndex > -1) { if (!comments[cIndex].replies) comments[cIndex].replies = []; comments[cIndex].replies.push(reply); renderComments(videoId); await updateDoc(doc(db, "videos", videoId), { comments: comments }); if (comments[cIndex].uid !== currentUser.uid) addNotification(comments[cIndex].uid, "comment", `hat auf deinen Kommentar geantwortet: "${text}"`, videoId); } }
};

window.likeComment = async function(videoId, cId) { if (!currentUser) return; const videoIndex = allVideosData.findIndex(v => v.id === videoId); if (videoIndex > -1) { const comments = allVideosData[videoIndex].comments || []; const cIndex = comments.findIndex((c, idx) => c.cId === cId || idx.toString() === cId); if (cIndex > -1) { if (!comments[cIndex].likes) comments[cIndex].likes = []; const userIdx = comments[cIndex].likes.indexOf(currentUser.uid); if (userIdx > -1) comments[cIndex].likes.splice(userIdx, 1); else comments[cIndex].likes.push(currentUser.uid); renderComments(videoId); await updateDoc(doc(db, "videos", videoId), { comments: comments }); } } };
window.likeReply = async function(videoId, cId, rId) { if (!currentUser) return; const videoIndex = allVideosData.findIndex(v => v.id === videoId); if (videoIndex > -1) { const comments = allVideosData[videoIndex].comments || []; const cIndex = comments.findIndex((c, idx) => c.cId === cId || idx.toString() === cId); if (cIndex > -1 && comments[cIndex].replies) { const rIndex = comments[cIndex].replies.findIndex(r => r.rId === rId); if (rIndex > -1) { if (!comments[cIndex].replies[rIndex].likes) comments[cIndex].replies[rIndex].likes = []; const userIdx = comments[cIndex].replies[rIndex].likes.indexOf(currentUser.uid); if (userIdx > -1) comments[cIndex].replies[rIndex].likes.splice(userIdx, 1); else comments[cIndex].replies[rIndex].likes.push(currentUser.uid); renderComments(videoId); await updateDoc(doc(db, "videos", videoId), { comments: comments }); } } } };
window.deleteComment = async function(videoId, cId) { if (confirm("Möchtest du diesen Kommentar löschen?")) { try { const videoRef = doc(db, "videos", videoId); const videoIndex = allVideosData.findIndex(v => v.id === videoId); if (videoIndex > -1) { let comments = allVideosData[videoIndex].comments || []; const cIndex = comments.findIndex((c, idx) => c.cId === cId || idx.toString() === cId); if (cIndex > -1) { comments.splice(cIndex, 1); allVideosData[videoIndex].comments = comments; renderComments(videoId); document.querySelectorAll(`.comment-btn[data-id="${videoId}"] .comment-count-txt`).forEach(el => el.innerText = comments.length); await updateDoc(videoRef, { comments: comments }); showToast("Kommentar gelöscht!"); } } } catch (e) { showCustomAlert("Fehler", "Kommentar konnte nicht gelöscht werden."); } } };
window.deleteReply = async function(videoId, cId, rId) { if (confirm("Möchtest du diese Antwort löschen?")) { try { const videoRef = doc(db, "videos", videoId); const videoIndex = allVideosData.findIndex(v => v.id === videoId); if (videoIndex > -1) { let comments = allVideosData[videoIndex].comments || []; const cIndex = comments.findIndex((c, idx) => c.cId === cId || idx.toString() === cId); if (cIndex > -1 && comments[cIndex].replies) { const rIndex = comments[cIndex].replies.findIndex(r => r.rId === rId); if (rIndex > -1) { comments[cIndex].replies.splice(rIndex, 1); renderComments(videoId); await updateDoc(videoRef, { comments: comments }); showToast("Antwort gelöscht!"); } } } } catch (e) {} } };

function renderComments(id) {
    const list = document.getElementById('comment-list'); const video = allVideosData.find(v => v.id === id);
    if (video && video.comments && video.comments.length > 0) {
        const isCreator = currentUser && currentUser.uid === video.authorUid; const authorData = getUserData(video.authorUid, video.authorName, video.authorUsername || video.authorName, video.authorPic, video.authorVerified); const creatorPic = authorData.pic || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback';
        list.innerHTML = video.comments.map((c, index) => {
            const cUser = getUserData(c.uid, c.name, c.username, c.pic, c.verified); const badge = getVerifiedBadge(cUser.verified); const canDelete = currentUser && (currentUser.uid === c.uid || currentUser.email === "schleimyverteilung@gmail.com" || currentUser.isAdmin); const commentId = c.cId || index.toString(); const deleteBtn = canDelete ? `<i class="fas fa-trash delete-comment-icon" onclick="deleteComment('${id}', '${commentId}')"></i>` : ''; const likeCount = c.likes ? c.likes.length : 0; const hasLiked = c.likes && currentUser && c.likes.includes(currentUser.uid) ? 'liked-heart' : ''; const timeString = timeAgo(c.cId);
            let cClass = ""; if(cUser.philPlusUntil && cUser.philPlusUntil > Date.now()) cClass = "name-phil-plus";
            let cCreatorHeartHtml = ''; if (c.creatorHeart) cCreatorHeartHtml = `<div class="creator-heart-wrap" onclick="toggleCreatorHeart('${id}', '${commentId}')" style="cursor:${isCreator?'pointer':'default'};" title="Vom Creator geliket"><div class="creator-heart-img" style="background-image: url('${creatorPic}')"></div><i class="fas fa-heart creator-heart-badge"></i></div>`; else if (isCreator) cCreatorHeartHtml = `<div class="creator-heart-wrap creator-heart-inactive" onclick="toggleCreatorHeart('${id}', '${commentId}')" title="Creator Herz geben"><i class="far fa-heart creator-heart-badge-outline"></i></div>`;
            let renderedGif = ''; if(c.gifUrl) renderedGif = `<img src="${c.gifUrl}" class="comment-gif" alt="GIF">`;
            let repliesHtml = '';
            if (c.replies && c.replies.length > 0) {
                repliesHtml = `<div class="reply-container">` + c.replies.map(r => {
                    const rUser = getUserData(r.uid, r.name, r.username, r.pic, r.verified); const rBadge = getVerifiedBadge(rUser.verified); const rCanDelete = currentUser && (currentUser.uid === r.uid || currentUser.email === "schleimyverteilung@gmail.com" || currentUser.isAdmin); const rDeleteBtn = rCanDelete ? `<i class="fas fa-trash delete-comment-icon" onclick="deleteReply('${id}', '${commentId}', '${r.rId}')"></i>` : ''; const rLikeCount = r.likes ? r.likes.length : 0; const rHasLiked = r.likes && currentUser && r.likes.includes(currentUser.uid) ? 'liked-heart' : ''; const replyTimeString = timeAgo(r.rId);
                    let rClass = ""; if(rUser.philPlusUntil && rUser.philPlusUntil > Date.now()) rClass = "name-phil-plus";
                    let rCreatorHeartHtml = ''; if (r.creatorHeart) rCreatorHeartHtml = `<div class="creator-heart-wrap" onclick="toggleCreatorHeart('${id}', '${commentId}', '${r.rId}')" style="cursor:${isCreator?'pointer':'default'};" title="Vom Creator geliket"><div class="creator-heart-img" style="background-image: url('${creatorPic}')"></div><i class="fas fa-heart creator-heart-badge"></i></div>`; else if (isCreator) rCreatorHeartHtml = `<div class="creator-heart-wrap creator-heart-inactive" onclick="toggleCreatorHeart('${id}', '${commentId}', '${r.rId}')" title="Creator Herz geben"><i class="far fa-heart creator-heart-badge-outline"></i></div>`;
                    return `<div class="reply-item"><img src="${rUser.pic}" class="live-pic-${r.uid}" alt="User" onclick="openProfile('${r.uid}')" style="cursor:pointer;"><div style="flex:1; min-width: 0;"><strong onclick="openProfile('${r.uid}')" style="cursor:pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;"><span class="live-name-${r.uid} ${rClass}">${rUser.displayName}${rBadge}</span> <span class="live-username-${r.uid}" style="color:#888; font-weight:normal; font-size:12px;">@${rUser.username}</span> <span class="comment-time">${replyTimeString}</span></strong><p style="word-break: break-word;">${formatText(r.text)}</p><div class="comment-actions"><span onclick="toggleReplyBox('${commentId}')">Antworten</span><span class="${rHasLiked}" onclick="likeReply('${id}', '${commentId}', '${r.rId}')"><i class="fas fa-heart"></i> ${rLikeCount}</span>${rCreatorHeartHtml}</div></div>${rDeleteBtn}</div>`;
                }).join('') + `</div>`;
            }
            const replyBoxHtml = `<div class="reply-box" id="reply-box-${commentId}" style="display:none;"><input type="text" placeholder="Antworten..." id="reply-input-${commentId}" class="comment-input" style="font-size:16px; padding:8px 15px;"><button onclick="submitReply('${id}', '${commentId}')" class="chat-send-btn" style="width:32px; height:32px; font-size:12px; flex-shrink: 0;"><i class="fas fa-paper-plane"></i></button></div>`;
            return `<div class="comment-wrapper"><div class="comment" style="display:flex; align-items:flex-start; width:100%;"><img src="${cUser.pic}" class="live-pic-${c.uid}" alt="User" onclick="openProfile('${c.uid}')" style="cursor:pointer;"><div style="flex:1; min-width: 0;"><strong onclick="openProfile('${c.uid}')" style="cursor:pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;"><span class="live-name-${c.uid} ${cClass}">${cUser.displayName}${badge}</span> <span class="live-username-${c.uid}" style="color:#888; font-weight:normal; font-size:12px;">@${cUser.username}</span> <span class="comment-time">${timeString}</span></strong><p style="word-break: break-word;">${formatText(c.text)}</p>${renderedGif}<div class="comment-actions"><span onclick="toggleReplyBox('${commentId}')">Antworten</span><span class="${hasLiked}" onclick="likeComment('${id}', '${commentId}')"><i class="fas fa-heart"></i> ${likeCount}</span>${cCreatorHeartHtml}</div></div>${deleteBtn}</div>${repliesHtml}${replyBoxHtml}</div>`;
        }).join('');
    } else { list.innerHTML = '<div class="no-comments">Sei der Erste, der kommentiert!</div>'; }
}

// --- GIPHY API LOGIK ---
let currentPendingGifUrl = null;
document.getElementById('btn-gif-comment').addEventListener('click', () => { if(!checkPhilPlusStatus()) return showCustomAlert("Phil Shorts+", "GIFs in Kommentaren sind exklusiv für Phil Shorts+ Mitglieder!"); document.getElementById('giphy-modal').classList.add('show'); fetchGiphyTrending(); });
document.getElementById('close-giphy-modal').addEventListener('click', () => { document.getElementById('giphy-modal').classList.remove('show'); });
document.getElementById('remove-pending-gif').addEventListener('click', () => { currentPendingGifUrl = null; document.getElementById('pending-gif-preview').style.display = 'none'; });

async function fetchGiphyTrending() {
    const resultsDiv = document.getElementById('giphy-results'); resultsDiv.innerHTML = '<div style="grid-column: span 2; text-align: center;"><i class="fas fa-spinner fa-spin"></i></div>';
    try { const response = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=g`); const json = await response.json(); renderGiphyResults(json.data); } catch(e) { resultsDiv.innerHTML = '<div style="grid-column: span 2; text-align: center; color: #888;">Fehler beim Laden von Giphy.</div>'; }
}

document.getElementById('giphy-search-input').addEventListener('input', async (e) => {
    const q = e.target.value.trim(); if(q.length < 2) return fetchGiphyTrending();
    try { const response = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=20&rating=g`); const json = await response.json(); renderGiphyResults(json.data); } catch(e) {}
});

function renderGiphyResults(gifs) {
    const resultsDiv = document.getElementById('giphy-results'); resultsDiv.innerHTML = '';
    if(!gifs || gifs.length === 0) { resultsDiv.innerHTML = '<div style="grid-column: span 2; text-align: center; color: #888;">Keine GIFs gefunden.</div>'; return; }
    gifs.forEach(gif => { const url = gif.images.fixed_height.url; resultsDiv.innerHTML += `<div class="gif-item" onclick="selectGifForComment('${url}')"><img src="${url}" alt="GIF"></div>`; });
}

window.selectGifForComment = function(url) { currentPendingGifUrl = url; document.getElementById('pending-gif-img').src = url; document.getElementById('pending-gif-preview').style.display = 'block'; document.getElementById('giphy-modal').classList.remove('show'); }

document.getElementById('submit-comment').addEventListener('click', async() => {
    const input = document.getElementById('new-comment-input'); const text = input.value.trim();
    if ((!text && !currentPendingGifUrl) || !window.currentCommentVideoId || !currentUser) return;
    const commentId = Date.now().toString();
    const comment = { cId: commentId, uid: currentUser.uid, name: currentUser.displayName, username: currentUser.username, pic: currentUser.photoURL, verified: currentUser.verified || false, text: text, gifUrl: currentPendingGifUrl || null, likes: [], replies: [], creatorHeart: false };
    const videoIndex = allVideosData.findIndex(v => v.id === window.currentCommentVideoId);
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

let currentProfileUnsubscribe = null; let profileUserStories = [];
window.renderProfileGrid = function(targetUid) {
    const grid = document.getElementById('profile-grid'); const userVideos = allVideosData.filter(v => v.authorUid === targetUid); grid.innerHTML = '';
    if (userVideos.length === 0) { grid.innerHTML = `<div style="grid-column: span 3; text-align: center; margin-top: 50px; color: #555;">Noch keine Videos</div>`; } 
    else { userVideos.forEach(v => { const previewSrc = v.mediaType === 'images' && v.urls ? v.urls[0] : `${v.url}#t=0.5`; const mediaTag = v.mediaType === 'images' ? `<img src="${previewSrc}" style="width:100%; height:100%; object-fit:cover;">` : `<video src="${previewSrc}" muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>`; const icon = v.mediaType === 'images' ? 'fa-images' : 'fa-play'; grid.innerHTML += `<div class="grid-item" onclick="jumpToVideo('${v.id}')">${mediaTag}<div class="grid-views"><i class="fas ${icon}"></i> ${v.likedBy ? v.likedBy.length : 0}</div></div>`; }); }
}

window.openProfile = async function(targetUid) {
    switchView('profile'); document.getElementById('profile-grid').innerHTML = '<div class="loading-screen"><i class="fas fa-circle-notch fa-spin"></i></div>';
    if (currentProfileUnsubscribe) currentProfileUnsubscribe();
    currentProfileUnsubscribe = onSnapshot(doc(db, "users", targetUid), (docSnap) => {
        if (!docSnap.exists()) return; const targetUser = docSnap.data();
        let totalLikes = 0; let totalGifts = 0; const userVideos = allVideosData.filter(v => v.authorUid === targetUid); userVideos.forEach(v => { totalLikes += (v.likedBy ? v.likedBy.length : 0); totalGifts += (v.gifts || 0); });
        let level = 1; if (totalLikes > 10 || totalGifts > 50) level = 2; if (totalLikes > 50 || totalGifts > 200) level = 3; if (totalLikes > 500) level = "Pro"; document.getElementById('profile-level').innerText = `Level ${level} Creator 🌟`;
        const verifiedBadge = targetUser.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : ''; const realFollowersCount = targetUser.followers ? targetUser.followers.length : 0; const cleanUsername = targetUser.username || targetUser.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        let nameClass = ""; if(targetUser.philPlusUntil && targetUser.philPlusUntil > Date.now()) { nameClass = "name-phil-plus"; document.getElementById('phil-plus-badge-container').style.display = 'block'; } else { document.getElementById('phil-plus-badge-container').style.display = 'none'; }
        document.getElementById('profile-title').innerHTML = '@' + cleanUsername; document.getElementById('profile-name').innerHTML = `<span class="${nameClass}">${targetUser.displayName}</span>${verifiedBadge}`; document.getElementById('profile-username').innerText = '@' + cleanUsername; document.getElementById('profile-bio').innerHTML = formatText(targetUser.bio || "Keine Bio vorhanden."); document.getElementById('profile-pic').src = targetUser.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback'; document.getElementById('stat-likes').innerText = totalLikes; document.getElementById('stat-followers').innerText = realFollowersCount; document.getElementById('stat-following').innerText = targetUser.following ? targetUser.following.length : 0;
        updateProfileBorder(targetUser.activeBorder, 'profile-pic');
        const actionBtn = document.getElementById('profile-action-btn'); const msgBtn = document.getElementById('profile-message-btn'); const shopBtn = document.getElementById('profile-shop-btn'); actionBtn.dataset.uid = targetUid; const settingsIcon = document.getElementById('open-settings'); const adminDashboardBtn = document.getElementById('open-admin-dashboard'); const privateStats = document.getElementById('private-stats'); const adminControls = document.getElementById('admin-controls'); adminControls.innerHTML = '';
        if (currentUser && (currentUser.email === "schleimyverteilung@gmail.com" || currentUser.isAdmin) && targetUid !== currentUser.uid) { const isVerif = targetUser.verified || false; adminControls.innerHTML = `<button onclick="toggleVerify('${targetUid}', ${isVerif})" class="profile-action-btn" style="background: transparent; color: #00f2fe; border: 1px solid #00f2fe; margin-top: 15px; width: 100%;">👑 Admin: ${isVerif ? 'Blauen Haken entfernen' : 'Blauen Haken geben'}</button>`; }
        if (currentUser && targetUid === currentUser.uid) { msgBtn.style.display = 'none'; shopBtn.style.display = 'block'; actionBtn.innerText = "Profil bearbeiten"; actionBtn.classList.add('edit-btn'); actionBtn.onclick = () => { document.getElementById('edit-displayname-input').value = currentUser.displayName; document.getElementById('edit-username-input').value = currentUser.username || cleanUsername; document.getElementById('edit-pic-input').value = currentUser.photoURL; document.getElementById('edit-bio-input').value = currentUser.bio; document.getElementById('settings-modal').classList.add('show'); }; settingsIcon.style.display = 'block'; settingsIcon.onclick = () => { updateNotifUI(); document.getElementById('app-settings-modal').classList.add('show'); }; adminDashboardBtn.style.display = (currentUser.email === "schleimyverteilung@gmail.com" || currentUser.isAdmin) ? 'block' : 'none'; privateStats.style.display = 'block'; document.getElementById('my-coins').innerText = targetUser.coins || 0; document.getElementById('my-views').innerText = targetUser.profileViews || 0; } 
        else { adminDashboardBtn.style.display = 'none'; privateStats.style.display = 'none'; shopBtn.style.display = 'none'; if (currentUser) { msgBtn.style.display = 'block'; msgBtn.onclick = () => { window.openDM(targetUid, cleanUsername, targetUser.photoURL); }; } if (currentUser && currentUser.following && currentUser.following.includes(targetUid)) { actionBtn.innerText = "Entfolgen"; actionBtn.classList.add('edit-btn'); } else { actionBtn.innerText = "Folgen"; actionBtn.classList.remove('edit-btn'); } actionBtn.onclick = () => toggleFollow(targetUid); settingsIcon.style.display = 'none'; }
        let storyDuration = 86400000; if (targetUser.philPlusUntil && targetUser.philPlusUntil > Date.now()) { storyDuration = 172800000; } profileUserStories = (targetUser.stories || []).filter(s => (Date.now() - s.timestamp) < storyDuration); const picContainer = document.getElementById('profile-pic-container'); const storyBadge = document.getElementById('story-badge');
        if(profileUserStories.length > 0) { picContainer.classList.add('story-ring'); storyBadge.style.display = 'none'; } else { picContainer.classList.remove('story-ring'); if(currentUser && targetUid === currentUser.uid) storyBadge.style.display = 'flex'; else storyBadge.style.display = 'none'; }
        window.renderProfileGrid(targetUid);
    });
    if (currentUser && targetUid !== currentUser.uid) { updateDoc(doc(db, "users", targetUid), { profileViews: increment(1) }).catch(e => {}); }
};

const shopItems = [ { id: 'b1', name: 'Ohne', type: 'border', cost: 0, cssClass: 'none' }, { id: 'b2', name: 'Neon', type: 'border', cost: 500, cssClass: 'neon' }, { id: 'b3', name: 'Gold', type: 'border', cost: 1000, cssClass: 'gold' }, { id: 'b4', name: '3663 Pro', type: 'border', cost: 2500, cssClass: '3663' }, { id: 'b5', name: 'Diamant', type: 'border', cost: 5000, cssClass: 'diamond' }, { id: 'b6', name: 'RGB Chroma (Plus)', type: 'border', cost: 0, cssClass: 'chroma', requiresPlus: true } ];
document.getElementById('profile-shop-btn').addEventListener('click', () => { if(!currentUser) return; document.getElementById('shop-modal-coins').innerText = currentUser.coins; renderShopBorders(); document.getElementById('shop-modal').classList.add('show'); });
document.querySelectorAll('.shop-tab').forEach(tab => { tab.addEventListener('click', (e) => { document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active')); e.target.classList.add('active'); document.querySelectorAll('.shop-content-section').forEach(s => s.style.display = 'none'); document.getElementById(e.target.dataset.tab).style.display = 'block'; }); });
document.getElementById('close-shop-modal').addEventListener('click', () => document.getElementById('shop-modal').classList.remove('show'));

function renderShopBorders() {
    const grid = document.getElementById('shop-borders-grid');
    grid.innerHTML = shopItems.filter(i => i.type === 'border').map(item => {
        const hasPlus = checkPhilPlusStatus(); const isOwned = currentUser.decorations && currentUser.decorations.includes(item.id) || item.cost === 0; const isEquipped = currentUser.activeBorder === item.cssClass;
        let btnHtml = ''; if(item.requiresPlus && !hasPlus) { btnHtml = `<button class="profile-action-btn edit-btn" style="width:100%; font-size:12px; min-height:30px;">Phil Shorts+ benötigt</button>`; } else if(isEquipped) { btnHtml = `<button class="profile-action-btn edit-btn" style="width:100%; font-size:12px; min-height:30px;">Ausgerüstet</button>`; } else if(isOwned) { btnHtml = `<button class="profile-action-btn" onclick="equipDecoration('${item.id}', '${item.cssClass}')" style="width:100%; font-size:12px; min-height:30px; background:#00f2fe; color:black;">Ausrüsten</button>`; } else { btnHtml = `<button class="profile-action-btn" onclick="buyDecoration('${item.id}', ${item.cost})" style="width:100%; font-size:12px; min-height:30px;"><i class="fas fa-coins"></i> ${item.cost}</button>`; }
        return `<div class="shop-item-card"><div class="shop-item-preview border-${item.cssClass}"></div><strong style="font-size: 14px; display:block; margin-bottom:10px;">${item.name}</strong>${btnHtml}</div>`;
    }).join('');
}

window.buyDecoration = async function(id, cost) { if(!currentUser) return; if(currentUser.coins < cost) return showCustomAlert("Zu wenig Coins", "Du hast nicht genug Coins dafür!"); try { currentUser.coins -= cost; if(!currentUser.decorations) currentUser.decorations = []; currentUser.decorations.push(id); await updateDoc(doc(db, "users", currentUser.uid), { coins: increment(-cost), decorations: arrayUnion(id) }); document.getElementById('shop-modal-coins').innerText = currentUser.coins; document.getElementById('my-coins').innerText = currentUser.coins; renderShopBorders(); showToast("Erfolgreich gekauft!"); } catch(e) { showCustomAlert("Fehler", "Kauf fehlgeschlagen."); } }
window.equipDecoration = async function(id, cssClass) { if(!currentUser) return; try { let finalClass = cssClass === 'none' ? "" : cssClass; currentUser.activeBorder = finalClass; await updateDoc(doc(db, "users", currentUser.uid), { activeBorder: finalClass }); renderShopBorders(); showToast("Ausgerüstet!"); } catch(e) {} }

window.buyPhilPlus = async function(days, cost) { 
    if(!currentUser) return; 
    // SCHUTZ: Wenn der Nutzer Phil Shorts+ bereits hat, wird der Kauf gestoppt und eine Warnung gezeigt.
    if(checkPhilPlusStatus()) return showCustomAlert("Bereits aktiv", "Du besitzt bereits Phil Shorts+! Ein erneuter Kauf ist aktuell nicht nötig.");

    if(currentUser.coins < cost) return showCustomAlert("Zu wenig Coins", "Du hast nicht genug Coins für Phil Shorts+."); 
    if(confirm(`Möchtest du Phil Shorts+ für ${days} Tage kaufen? Kosten: ${cost} Coins.`)) { 
        try { 
            currentUser.coins -= cost; 
            let currentUntil = currentUser.philPlusUntil && currentUser.philPlusUntil > Date.now() ? currentUser.philPlusUntil : Date.now(); 
            let newUntil = currentUntil + (days * 86400000); 
            currentUser.philPlusUntil = newUntil; 
            await updateDoc(doc(db, "users", currentUser.uid), { coins: increment(-cost), philPlusUntil: newUntil }); 
            document.getElementById('shop-modal-coins').innerText = currentUser.coins; 
            document.getElementById('my-coins').innerText = currentUser.coins; 
            showToast(`Phil Shorts+ aktiviert! 🎉`); 
            document.getElementById('shop-modal').classList.remove('show'); 
            initLiveUser(); 
        } catch(e) { showCustomAlert("Fehler", "Kauf fehlgeschlagen."); } 
    } 
}

window.openStoryUpload = function() { if(!currentUser) return; document.getElementById('shop-modal').classList.remove('show'); document.getElementById('story-upload-modal').classList.add('show'); }
document.getElementById('close-story-upload').addEventListener('click', () => document.getElementById('story-upload-modal').classList.remove('show'));
document.getElementById('up-story-file').addEventListener('change', function(e) { const file = e.target.files[0]; if(file) { document.querySelector('#up-story-btn p').innerText = file.name; document.querySelector('#up-story-btn i').style.color = "#00f2fe"; const url = URL.createObjectURL(file); document.getElementById('story-preview-img').src = url; document.getElementById('story-preview-img').style.display = 'block'; } });
document.getElementById('submit-story-upload').addEventListener('click', async() => { const file = document.getElementById('up-story-file').files[0]; if(!file) return showCustomAlert("Fehler", "Bitte wähle ein Bild aus."); if(!currentUser) return; if(currentUser.coins < 1000) return showCustomAlert("Zu wenig Coins", "Eine Story kostet 1000 Coins."); const btn = document.getElementById('submit-story-upload'); const status = document.getElementById('story-upload-status'); btn.disabled = true; status.innerText = "Lade hoch... Bitte warten!"; try { const formData = new FormData(); formData.append('file', file); formData.append('upload_preset', UPLOAD_PRESET); const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_NAME}/image/upload`, { method: 'POST', body: formData }); const data = await res.json(); if (!data.secure_url) throw new Error("Upload fehlgeschlagen."); const storyObj = { id: Date.now().toString(), url: data.secure_url, timestamp: Date.now() }; currentUser.coins -= 1000; await updateDoc(doc(db, "users", currentUser.uid), { coins: increment(-1000), stories: arrayUnion(storyObj) }); document.getElementById('my-coins').innerText = currentUser.coins; showToast("Story gepostet! 📸"); document.getElementById('story-upload-modal').classList.remove('show'); document.getElementById('up-story-file').value = ''; document.getElementById('story-preview-img').style.display = 'none'; document.querySelector('#up-story-btn p').innerText = "Bild für Story auswählen"; document.querySelector('#up-story-btn i').style.color = "#aaa"; } catch(e) { showCustomAlert("Upload Fehler", "Story konnte nicht hochgeladen werden."); } finally { btn.disabled = false; status.innerText = ""; } });

let storyViewerTimer = null;
window.currentStoryIndex = 0;

window.viewUserStory = function(index = 0) {
    if(profileUserStories.length === 0) { 
        if(currentUser && document.getElementById('profile-action-btn').dataset.uid === currentUser.uid) { openStoryUpload(); } 
        return; 
    }
    
    // Falls außerhalb der Grenzen -> Schließen oder Start begrenzen
    if(index >= profileUserStories.length) { closeStoryViewer(); return; }
    if(index < 0) index = 0;
    
    window.currentStoryIndex = index;
    const story = profileUserStories[index]; 
    const uid = document.getElementById('profile-action-btn').dataset.uid; 
    const authorData = getUserData(uid, "User", "user", "", false);
    
    document.getElementById('sv-pic').src = authorData.pic || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback'; 
    document.getElementById('sv-name').innerText = authorData.displayName; 
    document.getElementById('sv-time').innerText = timeAgo(story.timestamp); 
    document.getElementById('sv-counter').innerText = `${index + 1}/${profileUserStories.length}`;
    document.getElementById('sv-img').src = story.url; 
    document.getElementById('story-viewer').classList.add('show');
    
    // Mehrere Fortschrittsbalken rendern
    const container = document.getElementById('sv-progress-container');
    container.innerHTML = '';
    for(let i=0; i < profileUserStories.length; i++){
        let width = (i < index) ? '100%' : '0%';
        container.innerHTML += `<div style="flex:1; height:100%; background:rgba(255,255,255,0.3); border-radius:2px; overflow:hidden;"><div id="sv-prog-${i}" style="height:100%; width:${width}; background:white; transition:${i === index ? 'width 5s linear' : 'none'};"></div></div>`;
    }

    setTimeout(() => {
        const currentProg = document.getElementById(`sv-prog-${index}`);
        if(currentProg) currentProg.style.width = '100%';
    }, 50);

    clearTimeout(storyViewerTimer);
    storyViewerTimer = setTimeout(() => { nextStory(); }, 5000);
}

window.nextStory = function() {
    viewUserStory(window.currentStoryIndex + 1);
}
window.prevStory = function() {
    viewUserStory(window.currentStoryIndex - 1);
}

window.closeStoryViewer = function() { clearTimeout(storyViewerTimer); document.getElementById('story-viewer').classList.remove('show'); }

window.sendSupport = async function() { const msg = document.getElementById('support-msg').value.trim(); if(!msg || !currentUser) return; const ticketRef = await addDoc(collection(db, "reports"), { uid: currentUser.uid, name: currentUser.displayName, hasPlus: checkPhilPlusStatus(), status: 'open', timestamp: Date.now() }); await addDoc(collection(db, `reports/${ticketRef.id}/messages`), { senderUid: currentUser.uid, text: msg, timestamp: Date.now() }); showToast("Support-Ticket erstellt!"); document.getElementById('support-msg').value = ''; document.getElementById('app-settings-modal').classList.remove('show'); switchView('inbox'); document.getElementById('tab-support').click(); }
window.toggleVerify = async function(targetUid, currentStatus) { try { await updateDoc(doc(db, "users", targetUid), { verified: !currentStatus }); showToast(!currentStatus ? "Blauer Haken vergeben! 🔵" : "Blauer Haken entfernt."); } catch (e) { showCustomAlert("Fehler", "Fehler! Bist du wirklich Admin?"); } };

document.getElementById('save-settings-btn').addEventListener('click', async() => {
    const newDisplayName = document.getElementById('edit-displayname-input').value.trim(); const newUsernameRaw = document.getElementById('edit-username-input').value.trim(); const newUsername = newUsernameRaw.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase(); const newBio = document.getElementById('edit-bio-input').value.trim(); const newPic = document.getElementById('edit-pic-input').value.trim() || currentUser.photoURL;
    if (newUsername.length < 3) return showCustomAlert("Hinweis", "Dein Benutzername muss mindestens 3 Zeichen lang sein."); if (newDisplayName.length < 2) return showCustomAlert("Hinweis", "Dein Anzeigename ist zu kurz.");
    const btn = document.getElementById('save-settings-btn'); btn.innerText = "Prüfe Namen..."; btn.disabled = true;
    try {
        const nameQuery = query(collection(db, "users"), where("username", "==", newUsername)); const nameSnap = await getDocs(nameQuery); let nameTaken = false; nameSnap.forEach(d => { if (d.id !== currentUser.uid) nameTaken = true; });
        if (nameTaken) { btn.innerText = "Profil Speichern"; btn.disabled = false; return showCustomAlert("Name vergeben", "Dieser @Benutzername existiert bereits!"); }
        btn.innerText = "Speichere..."; await updateDoc(doc(db, "users", currentUser.uid), { displayName: newDisplayName, username: newUsername, bio: newBio, photoURL: newPic });
        const q = query(collection(db, "videos")); const snapshot = await getDocs(q);
        snapshot.forEach(async(vDoc) => {
            let vData = vDoc.data(); let updates = {}; let changed = false;
            if (vData.authorUid === currentUser.uid) { updates.authorName = newDisplayName; updates.authorUsername = newUsername; updates.authorPic = newPic; changed = true; }
            if (vData.comments && vData.comments.length > 0) {
                let commentsChanged = false; let newComments = vData.comments.map(c => { if (c.uid === currentUser.uid) { c.name = newDisplayName; c.username = newUsername; c.pic = newPic; commentsChanged = true; } if (c.replies) { c.replies = c.replies.map(r => { if (r.uid === currentUser.uid) { r.name = newDisplayName; r.username = newUsername; r.pic = newPic; commentsChanged = true; } return r; }); } return c; });
                if (commentsChanged) { updates.comments = newComments; changed = true; }
            }
            if (changed) await updateDoc(doc(db, "videos", vDoc.id), updates);
        });
        showToast("Profil erfolgreich aktualisiert!"); document.getElementById('settings-modal').classList.remove('show');
    } catch (e) { showCustomAlert("Fehler", "Fehler beim Speichern."); } finally { btn.innerText = "Profil Speichern"; btn.disabled = false; }
});

document.getElementById('nav-profile').addEventListener('click', () => { if (currentUser) openProfile(currentUser.uid); });
document.getElementById('open-admin-dashboard').addEventListener('click', () => { switchView('admin'); loadAdminDashboard(); });

window.loadAdminDashboard = async function() {
    if (!currentUser || (currentUser.email !== "schleimyverteilung@gmail.com" && !currentUser.isAdmin)) return;
    const userList = document.getElementById('admin-user-list'); userList.innerHTML = '<div class="loading-screen"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const usersSnap = await getDocs(collection(db, "users")); document.getElementById('admin-total-users').innerText = usersSnap.size; document.getElementById('admin-total-videos').innerText = allVideosData.length; userList.innerHTML = '';
        usersSnap.forEach(docSnap => {
            const u = docSnap.data(); const isVerif = u.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : ''; const isAdminBadge = u.isAdmin ? '<i class="fas fa-shield-alt" style="color:#ffd700; margin-left:5px;" title="Admin"></i>' : ''; const isBannedBadge = u.banned ? '<span style="color:#ff4444; font-size:10px; margin-left:5px; font-weight:bold;">[GEBANNT]</span>' : ''; let actionsHtml = '';
            if (u.email !== "schleimyverteilung@gmail.com") { actionsHtml = `<div class="admin-actions"><button class="admin-btn btn-blue" onclick="toggleVerifyAdmin('${u.uid}', ${u.verified || false})">${u.verified ? 'Haken entfernen' : 'Haken geben'}</button><button class="admin-btn btn-gold" onclick="giveCoins('${u.uid}')">+1000 Coins</button></div><div class="admin-actions" style="margin-top: 8px;"><button class="admin-btn ${u.isAdmin ? 'btn-red' : 'btn-green'}" onclick="toggleAdminRole('${u.uid}', ${u.isAdmin || false})">${u.isAdmin ? 'Admin entfernen' : 'Admin machen'}</button><button class="admin-btn ${u.banned ? 'btn-green' : 'btn-red'}" onclick="toggleBanStatus('${u.uid}', ${u.banned || false})">${u.banned ? 'Entbannen' : 'Bannen'}</button></div>`; }
            userList.innerHTML += `<div class="admin-user-card ${u.banned ? 'banned-card' : ''}"><div class="admin-user-header" onclick="openProfile('${u.uid}')" style="cursor:pointer;"><img src="${u.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback'}"><div style="flex:1; min-width:0;"><strong style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">@${u.displayName} ${isVerif}${isAdminBadge}${isBannedBadge}</strong><div style="font-size:11px; color:#888; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.email} | Coins: ${u.coins || 0}</div></div></div>${actionsHtml}</div>`;
        });
    } catch (e) {}
}

window.toggleVerifyAdmin = async function(targetUid, currentStatus) { if (!currentUser || (currentUser.email !== "schleimyverteilung@gmail.com" && !currentUser.isAdmin)) return; try { await updateDoc(doc(db, "users", targetUid), { verified: !currentStatus }); showToast(!currentStatus ? "Blauer Haken vergeben!" : "Blauer Haken entfernt."); loadAdminDashboard(); } catch (e) {} };
window.toggleAdminRole = async function(targetUid, currentStatus) { if (!currentUser || (currentUser.email !== "schleimyverteilung@gmail.com" && !currentUser.isAdmin)) return; try { await updateDoc(doc(db, "users", targetUid), { isAdmin: !currentStatus }); showToast(!currentStatus ? "Nutzer ist nun Admin!" : "Admin-Rechte entfernt."); loadAdminDashboard(); } catch (e) {} };
window.toggleBanStatus = async function(targetUid, currentStatus) { if (!currentUser || (currentUser.email !== "schleimyverteilung@gmail.com" && !currentUser.isAdmin)) return; try { await updateDoc(doc(db, "users", targetUid), { banned: !currentStatus }); showToast(!currentStatus ? "Nutzer gebannt!" : "Nutzer entbannt."); loadAdminDashboard(); } catch (e) {} };
window.giveCoins = async function(targetUid) { try { await updateDoc(doc(db, "users", targetUid), { coins: increment(1000) }); showToast("1000 Coins gutgeschrieben!"); loadAdminDashboard(); } catch (e) {} };

document.getElementById('search-input').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase(); const resultsGrid = document.getElementById('search-results'); const trendingSection = document.getElementById('trending-tags');
    if (query.length < 2) { resultsGrid.style.display = 'none'; trendingSection.style.display = 'block'; return; } trendingSection.style.display = 'none'; resultsGrid.style.display = 'block';
    const matchedUsers = allKnownUsers.filter(u => (u.displayName || "").toLowerCase().includes(query) || (u.username || "").toLowerCase().includes(query));
    const matchedVideos = allVideosData.filter(v => (v.description || "").toLowerCase().includes(query) || (v.authorName || "").toLowerCase().includes(query) || (v.title || "").toLowerCase().includes(query));
    let html = '';
    if (matchedUsers.length > 0) {
        html += '<h4 style="padding: 10px 15px; color:#888; font-size:14px; text-transform:uppercase;">Benutzer</h4><div style="display:flex; flex-direction:column; gap:15px; padding: 0 15px 20px;">';
        matchedUsers.forEach(u => { const isVerif = u.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : ''; const cleanUsername = u.username || u.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase(); let nameClass = u.philPlusUntil && u.philPlusUntil > Date.now() ? "name-phil-plus" : ""; html += `<div style="display:flex; align-items:center; gap:15px; cursor:pointer;" onclick="openProfile('${u.uid}')"><img src="${u.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback'}" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border: 1px solid #333; flex-shrink:0;"><div style="flex:1; min-width:0;"><strong style="font-size:16px; display:block; margin-bottom:3px; color:white; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><span class="live-name-${u.uid} ${nameClass}">${u.displayName}${isVerif}</span></strong><p class="live-username-${u.uid}" style="font-size:13px; color:#888;">@${cleanUsername}</p></div></div>`; });
        html += '</div>';
    }
    if (matchedVideos.length > 0) {
        html += '<h4 style="padding: 10px 15px; color:#888; font-size:14px; text-transform:uppercase;">Videos</h4><div class="grid-container">';
        html += matchedVideos.map(v => { const authorData = getUserData(v.authorUid, v.authorName, v.authorUsername || v.authorName, v.authorPic, v.authorVerified); const vBadge = getVerifiedBadge(v.authorVerified); const previewSrc = v.mediaType === 'images' && v.urls ? v.urls[0] : `${v.url}#t=0.5`; const mediaTag = v.mediaType === 'images' ? `<img src="${previewSrc}" style="width:100%; height:100%; object-fit:cover;">` : `<video src="${previewSrc}" muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>`; const icon = v.mediaType === 'images' ? 'fa-images' : 'fa-play'; return `<div class="grid-item" onclick="jumpToVideo('${v.id}')">${mediaTag}<div class="grid-views" style="word-break: break-all; font-size: 11px;"><i class="fas ${icon}"></i> ${v.likedBy ? v.likedBy.length : 0} @${authorData.username}${vBadge}</div></div>`; }).join('');
        html += '</div>';
    }
    if (matchedUsers.length === 0 && matchedVideos.length === 0) { html = '<div style="text-align: center; margin-top: 50px; color: #555;">Nichts gefunden 😔</div>'; } resultsGrid.innerHTML = html;
});

document.getElementById('tab-notifications').addEventListener('click', function() { this.classList.add('active'); document.getElementById('tab-messages').classList.remove('active'); document.getElementById('tab-support').classList.remove('active'); document.getElementById('inbox-notifications-box').style.display = 'flex'; document.getElementById('inbox-messages-box').style.display = 'none'; document.getElementById('inbox-support-box').style.display = 'none'; });
document.getElementById('tab-messages').addEventListener('click', function() { this.classList.add('active'); document.getElementById('tab-notifications').classList.remove('active'); document.getElementById('tab-support').classList.remove('active'); document.getElementById('inbox-notifications-box').style.display = 'none'; document.getElementById('inbox-messages-box').style.display = 'flex'; document.getElementById('inbox-support-box').style.display = 'none'; });
document.getElementById('tab-support').addEventListener('click', function() { this.classList.add('active'); document.getElementById('tab-notifications').classList.remove('active'); document.getElementById('tab-messages').classList.remove('active'); document.getElementById('inbox-notifications-box').style.display = 'none'; document.getElementById('inbox-messages-box').style.display = 'none'; document.getElementById('inbox-support-box').style.display = 'flex'; });

let inboxUnsubscribe = null; let isInitialNotifLoad = true;
function initInbox() {
    const inboxBox = document.getElementById('inbox-notifications-box'); if (!currentUser) return; if (inboxUnsubscribe) inboxUnsubscribe(); isInitialNotifLoad = true;
    inboxUnsubscribe = onSnapshot(query(collection(db, "users", currentUser.uid, "notifications"), orderBy("timestamp", "desc")), (snapshot) => {
        if (!isInitialNotifLoad) { snapshot.docChanges().forEach((change) => { if (change.type === "added") { const n = change.doc.data(); const isCurrentlyChatting = document.getElementById('view-dm').classList.contains('active') && window.currentChatPartner && window.currentChatPartner.uid === n.fromUid; if (!isCurrentlyChatting) { const nUser = getUserData(n.fromUid, n.fromName, n.fromUsername, n.fromPic, false); let toastMsg = `🔔 Aktivität von @${nUser.username}`; if (n.type === 'message') toastMsg = `💬 Nachricht von @${nUser.username}`; else if (n.type === 'like') toastMsg = `❤️ @${nUser.username} mag dein Post`; else if (n.type === 'follow') toastMsg = `👤 @${nUser.username} folgt dir`; else if (n.type === 'gift') toastMsg = `🎁 @${nUser.username} hat gespendet!`; else if (n.type === 'comment') toastMsg = `💬 @${nUser.username} hat kommentiert`; showToast(toastMsg); window.sendDesktopNotification("Phil Shorts", toastMsg, n.type); } } }); }
        isInitialNotifLoad = false; inboxBox.innerHTML = '';
        if (snapshot.empty) { inboxBox.innerHTML = '<div class="empty-state" style="height: 100%;"><p>Keine neuen Benachrichtigungen</p></div>'; return; }
        snapshot.forEach((doc) => {
            const n = doc.data(); let icon = 'fa-bell'; let color = '#aaa';
            if (n.type === 'like') { icon = 'fa-heart'; color = '#ff0050'; } if (n.type === 'follow') { icon = 'fa-user-plus'; color = '#00f2fe'; } if (n.type === 'comment') { icon = 'fa-comment-dots'; color = '#fff'; } if (n.type === 'gift') { icon = 'fa-gift'; color = '#ffd700'; } if (n.type === 'message') { icon = 'fa-envelope'; color = '#00f2fe'; }
            const nUser = getUserData(n.fromUid, n.fromName, n.fromUsername, n.fromPic, false); let clickAction = `openProfile('${n.fromUid}')`; if (n.type === 'message') clickAction = `openDM('${n.fromUid}', '${nUser.username.replace(/'/g, "\\'")}', '${nUser.pic}')`; else if (n.videoId) clickAction = `jumpToVideo('${n.videoId}')`; const isVerif = getVerifiedBadge(nUser.verified); let nameClass = nUser.philPlusUntil && nUser.philPlusUntil > Date.now() ? "name-phil-plus" : "";
            inboxBox.innerHTML += `<div class="inbox-msg" onclick="${clickAction}"><img src="${nUser.pic}" class="chat-avatar live-pic-${n.fromUid}" style="flex-shrink:0;"><div style="flex:1; min-width:0;"><span class="chat-username" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><span class="live-name-${n.fromUid} ${nameClass}">${nUser.displayName}${isVerif}</span> <span class="live-username-${n.fromUid}" style="color:#888; font-weight:normal; font-size:12px;">@${nUser.username}</span></span><div class="chat-bubble" style="background: transparent; padding: 0; word-break: break-word;"><i class="fas ${icon}" style="color:${color}; margin-right:5px;"></i> ${formatText(n.text)}</div><div class="chat-time" style="font-size: 11px; color: #666; margin-top: 4px;">${timeAgo(n.timestamp)}</div></div></div>`;
        });
    });
}

let inboxChatsUnsubscribe = null;
function initInboxChats() {
    if (!currentUser) return; const msgBox = document.getElementById('inbox-messages-box'); if (inboxChatsUnsubscribe) inboxChatsUnsubscribe();
    inboxChatsUnsubscribe = onSnapshot(collection(db, "chats"), (snapshot) => {
        let chats = []; snapshot.forEach(doc => { const chat = doc.data(); if (chat.participants && chat.participants.includes(currentUser.uid)) chats.push({ id: doc.id, ...chat }); }); chats.sort((a, b) => b.lastMessageTime - a.lastMessageTime); msgBox.innerHTML = '';
        if (chats.length === 0) { msgBox.innerHTML = '<div class="empty-state" style="height:100%;"><p>Keine Nachrichten vorhanden</p></div>'; return; }
        chats.forEach(chat => {
            const partnerUid = chat.participants.find(uid => uid !== currentUser.uid); const partner = chat.users[partnerUid]; if (!partner) return; const nUser = getUserData(partnerUid, partner.name, partner.name, partner.pic, false); const safeName = nUser.username.replace(/'/g, "\\'"); const isVerif = getVerifiedBadge(nUser.verified); let nameClass = nUser.philPlusUntil && nUser.philPlusUntil > Date.now() ? "name-phil-plus" : "";
            msgBox.innerHTML += `<div class="inbox-msg" onclick="openDM('${partnerUid}', '${safeName}', '${nUser.pic}')"><img src="${nUser.pic}" class="chat-avatar live-pic-${partnerUid}" style="flex-shrink:0;"><div style="flex:1; min-width:0;"><span class="chat-username" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><span class="live-name-${partnerUid} ${nameClass}">${nUser.displayName}${isVerif}</span> <span class="live-username-${partnerUid}" style="color:#888; font-weight:normal; font-size:12px;">@${nUser.username}</span></span><div class="chat-bubble" style="background: transparent; padding: 0; color: #888; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${formatText(chat.lastMessage) || 'Neuer Chat...'}</div><div class="chat-time" style="font-size: 11px; color: #666; margin-top: 4px;">${timeAgo(chat.lastMessageTime)}</div></div></div>`;
        });
    });
}

let supportUnsubscribe = null;
window.initSupportTickets = function() {
    if (!currentUser) return; 
    const supportBox = document.getElementById('inbox-support-box'); 
    const isAdmin = (currentUser.email === "schleimyverteilung@gmail.com" || currentUser.isAdmin);
    
    if (supportUnsubscribe) supportUnsubscribe();
    
    let reportQuery = query(collection(db, "reports"), orderBy("timestamp", "desc"));
    
    supportUnsubscribe = onSnapshot(reportQuery, (snapshot) => {
        supportBox.innerHTML = ''; 
        let foundAny = false;
        
        snapshot.forEach(docSnap => {
            const ticket = docSnap.data(); 
            // JS Filter für normale Nutzer
            if (!isAdmin && ticket.uid !== currentUser.uid) return; 
            
            foundAny = true;
            const ticketId = docSnap.id; 
            const isVip = ticket.hasPlus ? 'vip' : ''; 
            const vipBadge = ticket.hasPlus ? '<span class="phil-plus-badge" style="font-size:9px; margin-left:5px;">PLUS</span>' : ''; 
            const uData = getUserData(ticket.uid, ticket.name, ticket.name, 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback', false);
            const safeName = uData.username.replace(/'/g, "\\'");
            
            // Buttons für Admin in der Ticket-Übersicht
            let adminButtons = '';
            if (isAdmin) {
                if (ticket.status === 'closed') {
                    adminButtons = `<button class="profile-action-btn edit-btn" onclick="deleteTicket(event, '${ticketId}')" style="min-height:26px; font-size:11px; background:transparent; border:1px solid #ff4444; color:#ff4444; padding:0 8px;"><i class="fas fa-trash"></i> Löschen</button>`;
                } else {
                    adminButtons = `<button class="profile-action-btn edit-btn" onclick="resolveTicket(event, '${ticketId}')" style="min-height:26px; font-size:11px; background:transparent; border:1px solid #ffd700; color:#ffd700; padding:0 8px;"><i class="fas fa-lock"></i> Schließen</button>`;
                }
            }

            supportBox.innerHTML += `
            <div class="support-ticket ${isVip}" onclick="openTicketChat('${ticketId}', '${safeName}', '${ticket.uid}')" style="cursor:pointer; display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="color:white; font-size:14px;">@${uData.username} ${vipBadge}</strong>
                    <span style="color:#888; font-size:11px;">${timeAgo(ticket.timestamp)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-size:12px; color:#aaa;"><i class="fas fa-ticket-alt"></i> Status: <span style="color:${ticket.status === 'closed' ? '#ff4444' : '#39ff14'}; font-weight:bold;">${ticket.status === 'closed' ? 'Geschlossen' : 'Offen'}</span></div>
                    ${adminButtons}
                </div>
                <p style="font-size:14px; color:#ddd; background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Klicken um Chat zu öffnen</p>
            </div>`;
        });
        if (!foundAny) { supportBox.innerHTML = '<div class="empty-state" style="height:100%;"><i class="fas fa-check-circle" style="color:#00f2fe; font-size:40px; margin-bottom:10px;"></i><p>Keine Support-Tickets gefunden!</p></div>'; }
    });
}

// Funktionen zum schnellen Schließen / Löschen aus der Übersicht
window.resolveTicket = async function(event, ticketId) {
    event.stopPropagation();
    if(confirm("Ticket als erledigt markieren und schließen?")) {
        try { await updateDoc(doc(db, "reports", ticketId), { status: 'closed' }); showToast("Ticket geschlossen."); } 
        catch(e) { showCustomAlert("Fehler", "Konnte nicht geschlossen werden."); }
    }
};

window.deleteTicket = async function(event, ticketId) {
    event.stopPropagation();
    if(confirm("Ticket endgültig löschen?")) {
        try { await deleteDoc(doc(db, "reports", ticketId)); showToast("Ticket gelöscht."); } 
        catch(e) { showCustomAlert("Fehler", "Konnte nicht gelöscht werden."); }
    }
};

let currentTicketSnapshot = null; let currentTicketMetaSnapshot = null; window.currentActiveTicketId = null;

window.openTicketChat = async function(ticketId, username, ticketOwnerUid) {
    if (!currentUser) return; window.currentActiveTicketId = ticketId; document.getElementById('ticket-title').innerText = "Ticket: @" + username; switchView('ticket');
    const ticketBox = document.getElementById('ticket-box'); ticketBox.innerHTML = '<div class="loading-screen"><i class="fas fa-circle-notch fa-spin"></i></div>';
    const isAdmin = (currentUser.email === "schleimyverteilung@gmail.com" || currentUser.isAdmin);
    
    if (currentTicketSnapshot) currentTicketSnapshot();
    if (currentTicketMetaSnapshot) currentTicketMetaSnapshot();
    
    currentTicketSnapshot = onSnapshot(query(collection(db, `reports/${ticketId}/messages`), orderBy("timestamp", "asc")), (snapshot) => {
        ticketBox.innerHTML = '';
        if (snapshot.empty) { ticketBox.innerHTML = '<div class="empty-state" style="height:100%;"><p>Keine Nachrichten</p></div>'; } 
        else {
            snapshot.forEach(docSnap => {
                const msg = docSnap.data(); 
                const isMe = msg.senderUid === currentUser.uid ? 'me' : ''; 
                
                // Prüfen, ob die Nachricht vom Support-Team stammt
                const isSupportSender = msg.senderUid !== ticketOwnerUid;
                const pic = isSupportSender ? 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin' : (msg.senderUid === currentUser.uid ? currentUser.photoURL : `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.senderUid}`);
                
                let bg = isMe ? '#ff0050' : '#333'; 
                let adminLabel = isSupportSender ? '<div style="font-size:10px; color:#ffd700; margin-bottom:4px;"><i class="fas fa-shield-alt"></i> Support Team</div>' : '';
                
                ticketBox.innerHTML += `<div class="chat-msg ${isMe}"><img src="${pic}" class="chat-avatar" style="flex-shrink:0;"><div style="min-width:0; max-width: 100%;"><div class="chat-bubble" style="background:${bg}; border-color:${bg};">${adminLabel}${formatText(msg.text)}</div><div class="chat-time" style="font-size: 10px; color: #666; margin-top: 4px; text-align: ${isMe ? 'right' : 'left'};">${timeAgo(msg.timestamp)}</div></div></div>`;
            });
        }
        ticketBox.scrollTop = ticketBox.scrollHeight;
    });

    // NEU: Live-Status Listener für das Ticket (Reagiert sofort auf Schließen durch den Admin)
    currentTicketMetaSnapshot = onSnapshot(doc(db, "reports", ticketId), (docSnap) => {
        if(docSnap.exists()) {
            const tData = docSnap.data(); 
            const statEl = document.getElementById('ticket-status');
            if(tData.status === 'closed') { 
                statEl.innerText = "Geschlossen"; 
                statEl.style.background = "#ff4444"; 
                statEl.style.color = "white";
                document.getElementById('ticket-input-area').style.display = 'none'; 
                document.getElementById('admin-close-ticket-btn').style.display = 'none'; 
            } else { 
                statEl.innerText = "Offen"; 
                statEl.style.background = "#39ff14"; 
                statEl.style.color = "black"; 
                document.getElementById('ticket-input-area').style.display = 'flex'; 
                if(isAdmin) document.getElementById('admin-close-ticket-btn').style.display = 'block'; 
                else document.getElementById('admin-close-ticket-btn').style.display = 'none';
            }
        } else {
            // Falls das Ticket gelöscht wurde
            document.getElementById('ticket-status').innerText = "Gelöscht";
            document.getElementById('ticket-status').style.background = "#ff4444";
            document.getElementById('ticket-input-area').style.display = 'none';
            document.getElementById('admin-close-ticket-btn').style.display = 'none'; 
        }
    });
};

document.getElementById('send-ticket-btn').addEventListener('click', async() => { const input = document.getElementById('ticket-input'); const text = input.value.trim(); if (!text || !window.currentActiveTicketId || !currentUser) return; input.value = ''; await addDoc(collection(db, `reports/${window.currentActiveTicketId}/messages`), { senderUid: currentUser.uid, text: text, timestamp: Date.now() }); });
document.getElementById('ticket-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('send-ticket-btn').click(); });

document.getElementById('admin-close-ticket-btn').addEventListener('click', async() => {
    if(!window.currentActiveTicketId) return;
    if(confirm("Support Ticket schließen? (Nutzer kann nicht mehr antworten)")) {
        await updateDoc(doc(db, "reports", window.currentActiveTicketId), { status: 'closed' });
        showToast("Ticket geschlossen.");
    }
});


let currentDMSnapshot = null; window.currentChatId = null; window.currentChatPartner = null;
window.openDM = async function(targetUid, targetName, targetPic) {
    if (!currentUser) return; window.currentChatPartner = { uid: targetUid, name: targetName, pic: targetPic }; const uids = [currentUser.uid, targetUid].sort(); window.currentChatId = `${uids[0]}_${uids[1]}`; const nUser = getUserData(targetUid, targetName, targetName, targetPic, false); const isVerif = getVerifiedBadge(nUser.verified);
    document.getElementById('dm-title').innerHTML = '@' + targetName + ' ' + isVerif; switchView('dm');
    if (currentDMSnapshot) currentDMSnapshot(); const dmBox = document.getElementById('dm-box'); dmBox.innerHTML = '<div class="loading-screen"><i class="fas fa-circle-notch fa-spin"></i></div>';
    const chatRef = doc(db, "chats", window.currentChatId); const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) { await setDoc(chatRef, { participants: [currentUser.uid, targetUid], users: { [currentUser.uid]: { name: currentUser.displayName, pic: currentUser.photoURL }, [targetUid]: { name: targetName, pic: targetPic } }, lastMessage: "", lastMessageTime: Date.now() }); }
    currentDMSnapshot = onSnapshot(query(collection(db, `chats/${window.currentChatId}/messages`), orderBy("timestamp", "asc")), (snapshot) => {
        dmBox.innerHTML = '';
        if (snapshot.empty) { dmBox.innerHTML = '<div class="empty-state" style="height:100%;"><p>Schreib die erste Nachricht!</p></div>'; } 
        else { snapshot.forEach(doc => { const msg = doc.data(); const isMe = msg.senderUid === currentUser.uid ? 'me' : ''; const pic = isMe ? currentUser.photoURL : targetPic; dmBox.innerHTML += `<div class="chat-msg ${isMe}"><img src="${pic}" class="chat-avatar" style="flex-shrink:0;"><div style="min-width:0; max-width: 100%;"><div class="chat-bubble">${formatText(msg.text)}</div><div class="chat-time" style="font-size: 10px; color: #666; margin-top: 4px; text-align: ${isMe ? 'right' : 'left'};">${timeAgo(msg.timestamp)}</div></div></div>`; }); }
        dmBox.scrollTop = dmBox.scrollHeight;
    });
};

document.getElementById('send-dm-btn').addEventListener('click', async() => { const input = document.getElementById('dm-input'); const text = input.value.trim(); if (!text || !window.currentChatId || !currentUser) return; input.value = ''; await addDoc(collection(db, `chats/${window.currentChatId}/messages`), { senderUid: currentUser.uid, text: text, timestamp: Date.now() }); await updateDoc(doc(db, "chats", window.currentChatId), { lastMessage: text, lastMessageTime: Date.now(), users: { [currentUser.uid]: { name: currentUser.displayName, pic: currentUser.photoURL }, [window.currentChatPartner.uid]: { name: window.currentChatPartner.name, pic: window.currentChatPartner.pic } } }); addNotification(window.currentChatPartner.uid, "message", `hat geschrieben: "${text}"`); });
document.getElementById('dm-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('send-dm-btn').click(); });

let editorState = { images: [], edits: [], currentIndex: 0, activeTextId: null }; let activeDragId = null, activeResizeId = null, activeResizePos = null, startX, startY, initialObjX, initialObjY, startSize, startDist = 0; let gridVisible = false;
document.getElementById('btn-toggle-grid').addEventListener('click', (e) => { gridVisible = !gridVisible; document.getElementById('editor-grid').style.display = gridVisible ? 'block' : 'none'; e.target.innerHTML = gridVisible ? '<i class="fas fa-border-all"></i> Raster: An' : '<i class="fas fa-border-all"></i> Raster: Aus'; });

function startDrag(e, id) { if(e.target.tagName.toLowerCase() === 'input' || e.target.classList.contains('resize-handle')) return; e.preventDefault(); e.stopPropagation(); activeDragId = id; selectText(id); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; startX = clientX; startY = clientY; const obj = editorState.edits[editorState.currentIndex].find(t => t.id === id); initialObjX = obj.x; initialObjY = obj.y; }
function startResize(e, id, pos) { e.preventDefault(); e.stopPropagation(); activeResizeId = id; activeResizePos = pos; selectText(id); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; startX = clientX; startY = clientY; const obj = editorState.edits[editorState.currentIndex].find(t => t.id === id); startSize = parseFloat(obj.size); const workspaceRect = document.getElementById('editor-workspace').getBoundingClientRect(); const mouseX = clientX - workspaceRect.left; const mouseY = clientY - workspaceRect.top; startDist = Math.sqrt(Math.pow(mouseX - obj.x, 2) + Math.pow(mouseY - obj.y, 2)); }
function dragMove(e) {
    if (activeDragId) { e.preventDefault(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; const dx = clientX - startX; const dy = clientY - startY; let rawX = initialObjX + dx; let rawY = initialObjY + dy; if (gridVisible) { rawX = Math.round(rawX / 20) * 20; rawY = Math.round(rawY / 20) * 20; } const obj = editorState.edits[editorState.currentIndex].find(t => t.id === activeDragId); if (obj) { obj.x = rawX; obj.y = rawY; const el = document.getElementById('drag-txt-' + obj.id); if(el) { el.style.left = obj.x + 'px'; el.style.top = obj.y + 'px'; } } } 
    else if (activeResizeId) { e.preventDefault(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; const workspaceRect = document.getElementById('editor-workspace').getBoundingClientRect(); const mouseX = clientX - workspaceRect.left; const mouseY = clientY - workspaceRect.top; const obj = editorState.edits[editorState.currentIndex].find(t => t.id === activeResizeId); if (obj) { const currentDist = Math.sqrt(Math.pow(mouseX - obj.x, 2) + Math.pow(mouseY - obj.y, 2)); if (startDist > 0) { let newSize = Math.max(15, startSize * (currentDist / startDist)); obj.size = newSize; const el = document.getElementById('drag-txt-' + obj.id); if(el) el.querySelector('.text-content').style.fontSize = newSize + 'px'; document.getElementById('text-ctrl-size').value = newSize; } } }
}
function endDrag() { activeDragId = null; activeResizeId = null; }
document.addEventListener('mousemove', dragMove); document.addEventListener('touchmove', dragMove, {passive: false}); document.addEventListener('mouseup', endDrag); document.addEventListener('touchend', endDrag);

function renderEditorImage(index) {
    if (editorState.images.length === 0) return; document.getElementById('editor-bg').src = editorState.images[index]; document.getElementById('editor-img-counter').innerText = `${index + 1} / ${editorState.images.length}`; const layer = document.getElementById('editor-layer'); layer.innerHTML = ''; editorState.activeTextId = null; document.getElementById('text-controls').style.display = 'none'; editorState.edits[index].forEach(obj => createDOMTextElement(obj));
}

function createDOMTextElement(obj) {
    const layer = document.getElementById('editor-layer'); const wrapper = document.createElement('div'); wrapper.id = 'drag-txt-' + obj.id; wrapper.className = 'draggable-text'; wrapper.style.left = obj.x + 'px'; wrapper.style.top = obj.y + 'px'; wrapper.style.transform = `translate(-50%, -50%) rotate(${obj.rotation}deg)`; const textEl = document.createElement('div'); textEl.className = 'text-content'; textEl.innerText = obj.text; textEl.style.fontSize = obj.size + 'px'; textEl.style.color = obj.color; textEl.style.fontFamily = obj.font || 'Arial, sans-serif'; wrapper.appendChild(textEl);
    ['tl', 'tr', 'bl', 'br'].forEach(pos => { const h = document.createElement('div'); h.className = `resize-handle handle-${pos}`; h.addEventListener('mousedown', (e) => startResize(e, obj.id, pos)); h.addEventListener('touchstart', (e) => startResize(e, obj.id, pos), {passive: false}); wrapper.appendChild(h); });
    wrapper.addEventListener('mousedown', (e) => startDrag(e, obj.id)); wrapper.addEventListener('touchstart', (e) => startDrag(e, obj.id), {passive: false}); layer.appendChild(wrapper);
}

function selectText(id) { editorState.activeTextId = id; document.querySelectorAll('.draggable-text').forEach(el => el.classList.remove('active')); const obj = editorState.edits[editorState.currentIndex].find(t => t.id === id); if(!obj) return; document.getElementById('drag-txt-' + id).classList.add('active'); document.getElementById('text-controls').style.display = 'block'; document.getElementById('text-ctrl-input').value = obj.text; document.getElementById('text-ctrl-size').value = obj.size; document.getElementById('text-ctrl-rot').value = obj.rotation; document.getElementById('text-ctrl-font').value = obj.font || 'Arial, sans-serif'; }
document.getElementById('editor-workspace').addEventListener('click', (e) => { if (!e.target.closest('.draggable-text')) { editorState.activeTextId = null; document.querySelectorAll('.draggable-text').forEach(el => el.classList.remove('active')); document.getElementById('text-controls').style.display = 'none'; } });

document.getElementById('text-ctrl-input').addEventListener('input', (e) => { if(!editorState.activeTextId) return; const obj = editorState.edits[editorState.currentIndex].find(t => t.id === editorState.activeTextId); obj.text = e.target.value; document.getElementById('drag-txt-' + obj.id).querySelector('.text-content').innerText = obj.text; });
document.getElementById('text-ctrl-size').addEventListener('input', (e) => { if(!editorState.activeTextId) return; const obj = editorState.edits[editorState.currentIndex].find(t => t.id === editorState.activeTextId); obj.size = e.target.value; document.getElementById('drag-txt-' + obj.id).querySelector('.text-content').style.fontSize = obj.size + 'px'; });
document.getElementById('text-ctrl-rot').addEventListener('input', (e) => { if(!editorState.activeTextId) return; const obj = editorState.edits[editorState.currentIndex].find(t => t.id === editorState.activeTextId); obj.rotation = e.target.value; document.getElementById('drag-txt-' + obj.id).style.transform = `translate(-50%, -50%) rotate(${obj.rotation}deg)`; });
document.getElementById('text-ctrl-font').addEventListener('change', (e) => { if(!editorState.activeTextId) return; const obj = editorState.edits[editorState.currentIndex].find(t => t.id === editorState.activeTextId); obj.font = e.target.value; document.getElementById('drag-txt-' + obj.id).querySelector('.text-content').style.fontFamily = obj.font; });
document.querySelectorAll('.color-dot').forEach(dot => { dot.addEventListener('click', (e) => { if(!editorState.activeTextId) return; const color = e.target.dataset.color; const obj = editorState.edits[editorState.currentIndex].find(t => t.id === editorState.activeTextId); obj.color = color; document.getElementById('drag-txt-' + obj.id).querySelector('.text-content').style.color = color; }); });
document.getElementById('btn-delete-text').addEventListener('click', () => { if(!editorState.activeTextId) return; editorState.edits[editorState.currentIndex] = editorState.edits[editorState.currentIndex].filter(t => t.id !== editorState.activeTextId); document.getElementById('drag-txt-' + editorState.activeTextId).remove(); editorState.activeTextId = null; document.getElementById('text-controls').style.display = 'none'; });
document.getElementById('btn-add-text').addEventListener('click', () => { const workspace = document.getElementById('editor-workspace'); const newObj = { id: Date.now(), text: "Neuer Text", x: workspace.clientWidth / 2, y: workspace.clientHeight / 2, size: 24, rotation: 0, color: '#ffffff', font: 'Arial, sans-serif' }; editorState.edits[editorState.currentIndex].push(newObj); createDOMTextElement(newObj); selectText(newObj.id); });
document.getElementById('btn-prev-img').addEventListener('click', () => { if (editorState.currentIndex > 0) { editorState.currentIndex--; renderEditorImage(editorState.currentIndex); } });
document.getElementById('btn-next-img').addEventListener('click', () => { if (editorState.currentIndex < editorState.images.length - 1) { editorState.currentIndex++; renderEditorImage(editorState.currentIndex); } });

document.getElementById('up-file').addEventListener('change', async function(e) {
    const files = e.target.files; const txt = document.querySelector('#up-file-btn p'); const icon = document.querySelector('#up-file-btn i'); const trimmerUi = document.getElementById('trimmer-ui'); const advancedEditorUi = document.getElementById('image-advanced-editor'); const trimPreview = document.getElementById('trim-preview'); const trimStart = document.getElementById('trim-start'); const trimEnd = document.getElementById('trim-end');
    if (!files || files.length === 0) { txt.innerText = "Video oder Bilder auswählen"; icon.className = "fas fa-cloud-upload-alt"; icon.style.color = "#aaa"; trimmerUi.style.display = 'none'; advancedEditorUi.style.display = 'none'; return; }
    const isVideo = files[0].type.startsWith('video/');
    if (isVideo) {
        txt.innerText = files[0].name; icon.className = "fas fa-video"; icon.style.color = "#00f2fe"; trimmerUi.style.display = 'block'; advancedEditorUi.style.display = 'none';
        const url = URL.createObjectURL(files[0]); trimPreview.src = url; trimPreview.onloadedmetadata = () => { const dur = trimPreview.duration; trimStart.max = dur; trimEnd.max = dur; trimEnd.value = dur; document.getElementById('val-end').innerText = dur.toFixed(1); };
    } else {
        txt.innerText = `${files.length} Bild(er) ausgewählt`; icon.className = "fas fa-images"; icon.style.color = "#ffd700"; trimmerUi.style.display = 'none'; advancedEditorUi.style.display = 'block';
        editorState.images = []; editorState.edits = []; editorState.currentIndex = 0;
        for(let i = 0; i < files.length; i++) {
            if(files[i].size > 15 * 1024 * 1024) continue;
            const reader = new FileReader(); await new Promise(resolve => { reader.onload = (event) => { editorState.images.push(event.target.result); editorState.edits.push([]); resolve(); }; reader.readAsDataURL(files[i]); });
        }
        if (editorState.images.length === 0) { showCustomAlert("Fehler", "Bilder konnten nicht geladen werden."); txt.innerText = "Video oder Bilder auswählen"; icon.className = "fas fa-cloud-upload-alt"; icon.style.color = "#aaa"; return; }
        renderEditorImage(0);
    }
});

document.getElementById('trim-start').addEventListener('input', (e) => { const val = parseFloat(e.target.value); const endVal = parseFloat(document.getElementById('trim-end').value); if (val >= endVal) e.target.value = endVal - 0.1; document.getElementById('val-start').innerText = parseFloat(e.target.value).toFixed(1); document.getElementById('trim-preview').currentTime = parseFloat(e.target.value); });
document.getElementById('trim-end').addEventListener('input', (e) => { const val = parseFloat(e.target.value); const startVal = parseFloat(document.getElementById('trim-start').value); if (val <= startVal) e.target.value = startVal + 0.1; document.getElementById('val-end').innerText = parseFloat(e.target.value).toFixed(1); document.getElementById('trim-preview').currentTime = parseFloat(e.target.value); });

async function renderAndUploadImages() {
    let uploadedUrls = []; const ws = document.getElementById('editor-workspace'); const Cw = ws.clientWidth; const Ch = ws.clientHeight;
    for (let i = 0; i < editorState.images.length; i++) {
        const img = new Image(); await new Promise(res => { img.onload = res; img.src = editorState.images[i]; });
        const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); const Nw = img.naturalWidth; const Nh = img.naturalHeight; canvas.width = Nw; canvas.height = Nh; ctx.drawImage(img, 0, 0, Nw, Nh);
        const scale = Math.min(Cw / Nw, Ch / Nh); const Dw = Nw * scale; const Dh = Nh * scale; const Ox = (Cw - Dw) / 2; const Oy = (Ch - Dh) / 2;
        editorState.edits[i].forEach(obj => {
            let nativeX = (obj.x - Ox) / scale; let nativeY = (obj.y - Oy) / scale; let nativeSize = obj.size / scale;
            ctx.save(); ctx.translate(nativeX, nativeY); ctx.rotate((obj.rotation * Math.PI) / 180); ctx.font = `bold ${nativeSize}px ${obj.font || 'Arial, sans-serif'}`; ctx.fillStyle = obj.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = nativeSize * 0.1; ctx.strokeText(obj.text, 0, 0); ctx.fillText(obj.text, 0, 0); ctx.restore();
        });
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const formData = new FormData(); formData.append('file', dataUrl); formData.append('upload_preset', UPLOAD_PRESET);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_NAME}/image/upload`, { method: 'POST', body: formData }); const data = await res.json();
        uploadedUrls.push(data.secure_url.replace('/upload/', `/upload/q_auto,f_auto/`));
    }
    return uploadedUrls;
}

document.getElementById('submit-upload').addEventListener('click', async() => {
    const files = document.getElementById('up-file').files; const titleVal = document.getElementById('up-title').value.trim(); const desc = document.getElementById('up-desc').value.trim();
    if (!files || files.length === 0 || (!desc && !titleVal)) return showCustomAlert("Fehlende Daten", "Bitte wähle Dateien aus und schreibe einen Titel oder eine Beschreibung.");
    let isVideo = files[0].type.startsWith('video/'); let maxSize = checkPhilPlusStatus() ? 100 * 1024 * 1024 : 30 * 1024 * 1024; let limitText = checkPhilPlusStatus() ? "100" : "30";
    if (isVideo && files[0].size > maxSize) return showCustomAlert("Zu groß", `Videos dürfen maximal ${limitText} MB groß sein!`);
    const btn = document.getElementById('submit-upload'); const status = document.getElementById('upload-status'); btn.disabled = true; status.innerText = "Wird gerendert und verarbeitet... Bitte warten!";
    
    try {
        if (isVideo) {
            const formData = new FormData(); formData.append('file', files[0]); formData.append('upload_preset', UPLOAD_PRESET);
            const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_NAME}/video/upload`, { method: 'POST', body: formData }); const data = await res.json();
            if (!data.secure_url) throw new Error("Upload fehlgeschlagen.");
            const tStart = parseFloat(document.getElementById('trim-start').value); const tEnd = parseFloat(document.getElementById('trim-end').value); const dur = document.getElementById('trim-start').max;
            let transform = 'q_auto,f_auto,vc_auto'; if (tStart > 0 || tEnd < dur) transform += `,so_${tStart},eo_${tEnd}`;
            const finalUrl = data.secure_url.replace('/upload/', `/upload/${transform}/`);
            await addDoc(collection(db, "videos"), { mediaType: 'video', url: finalUrl, authorUid: currentUser.uid, authorName: currentUser.displayName, authorUsername: currentUser.username, authorPic: currentUser.photoURL, authorVerified: currentUser.verified || false, title: titleVal, description: desc, likedBy: [], gifts: 0, comments: [], views: 0, timestamp: Date.now() });
        } else {
            const uploadedUrls = await renderAndUploadImages(); if(uploadedUrls.length === 0) throw new Error("Keine Bilder hochgeladen.");
            await addDoc(collection(db, "videos"), { mediaType: 'images', urls: uploadedUrls, authorUid: currentUser.uid, authorName: currentUser.displayName, authorUsername: currentUser.username, authorPic: currentUser.photoURL, authorVerified: currentUser.verified || false, title: titleVal, description: desc, likedBy: [], gifts: 0, comments: [], views: 0, timestamp: Date.now() });
        }
        showToast("Erfolgreich veröffentlicht! 🎉"); document.getElementById('upload-modal').classList.remove('show');
        document.getElementById('up-file').value = ''; document.getElementById('up-title').value = ''; document.getElementById('up-desc').value = ''; document.querySelector('#up-file-btn p').innerText = "Video oder Bilder auswählen"; document.querySelector('#up-file-btn i').className = "fas fa-cloud-upload-alt"; document.querySelector('#up-file-btn i').style.color = "#aaa"; document.getElementById('trimmer-ui').style.display = 'none'; document.getElementById('image-advanced-editor').style.display = 'none'; editorState.images = [];
    } catch (e) { showCustomAlert("Upload Fehler", "Fehler! Evtl. falsches Format."); } finally { btn.disabled = false; status.innerText = ""; }
});

document.getElementById('open-upload').addEventListener('click', () => document.getElementById('upload-modal').classList.add('show'));
document.getElementById('close-upload').addEventListener('click', () => document.getElementById('upload-modal').classList.remove('show'));
document.getElementById('close-comments').addEventListener('click', () => document.getElementById('comment-modal').classList.remove('show'));
document.getElementById('close-settings').addEventListener('click', () => document.getElementById('settings-modal').classList.remove('show'));
document.getElementById('close-app-settings').addEventListener('click', () => document.getElementById('app-settings-modal').classList.remove('show'));

function initResponsiveLayout() {
    const appContainer = document.querySelector('.app'); const originalNav = appContainer.querySelector('.app__bottom-nav'); let currentMode = ''; let pcSidebar = null;
    function createPCContainers() { if (!pcSidebar) { pcSidebar = document.createElement('div'); pcSidebar.id = 'pc-nav-sidebar'; pcSidebar.innerHTML = `<div class="logo-area"><div class="logo-pulse"><i class="fas fa-play"></i></div>Phil Shorts</div>`; appContainer.prepend(pcSidebar); } }
    function restructureVideoForPC(videoEl) { const inner = videoEl.querySelector('.video-inner'); if (!inner) return; let infoPanel = inner.querySelector('.pc-info-panel-container'); if (!infoPanel) { infoPanel = document.createElement('div'); infoPanel.className = 'pc-info-panel-container'; inner.appendChild(infoPanel); const videoFooter = inner.querySelector('.video__footer'); const videoSidebar = inner.querySelector('.video__sidebar'); if (videoFooter) infoPanel.appendChild(videoFooter); if (videoSidebar) infoPanel.appendChild(videoSidebar); } }
    function rollBackVideoForHandy(videoEl) { const inner = videoEl.querySelector('.video-inner'); if (!inner) return; const infoPanel = inner.querySelector('.pc-info-panel-container'); if (infoPanel) { const videoFooter = infoPanel.querySelector('.video__footer'); const videoSidebar = infoPanel.querySelector('.video__sidebar'); if (videoFooter) inner.appendChild(videoFooter); if (videoSidebar) inner.appendChild(videoSidebar); infoPanel.remove(); } }
    function checkResponsiveMode() { const isPC = window.innerWidth > 768; if (isPC && currentMode !== 'pc') { currentMode = 'pc'; createPCContainers(); if (originalNav) pcSidebar.appendChild(originalNav); document.querySelectorAll('.app__videos .video').forEach(restructureVideoForPC); } else if (!isPC && currentMode !== 'handy') { currentMode = 'handy'; if (originalNav) appContainer.appendChild(originalNav); if (pcSidebar) { pcSidebar.remove(); pcSidebar = null; } document.querySelectorAll('.app__videos .video').forEach(rollBackVideoForHandy); } }
    checkResponsiveMode(); window.addEventListener('resize', checkResponsiveMode);
    if (window.innerWidth > 768) { const videoObserver2 = new MutationObserver(function(mutations) { if (currentMode === 'pc') mutations.forEach(mutation => mutation.addedNodes.forEach(node => { if (node.classList && node.classList.contains('video')) restructureVideoForPC(node); })); }); const videoContainer = document.getElementById('video-container'); if (videoContainer) videoObserver2.observe(videoContainer, { childList: true }); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initResponsiveLayout); else initResponsiveLayout();