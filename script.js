import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, updateDoc, increment, addDoc, arrayUnion, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// !!! DEIN CLOUDINARY NAME HIER REIN !!!
const CLOUDINARY_NAME = "dyzhyd2x8";
const UPLOAD_PRESET = "phil_upload";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let allVideosData = [];
let currentUser = JSON.parse(localStorage.getItem('phil_session'));
let following = currentUser ? currentUser.following || [] : [];
let currentFeedMode = 'foryou';

// --- HELPER FUNKTIONEN ---
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


// --- GOOGLE IDENTITY SCRIPT VERARBEITUNG ---
function parseJwt(token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

// HIER KOMMT DAS SIGNAL VOM HTML BUTTON AN:
window.addEventListener('googleLoginSuccess', async(event) => {
    try {
        const response = event.detail;
        const data = parseJwt(response.credential);
        const uid = data.sub;
        const name = data.name.replace(/\s+/g, '').toLowerCase();
        const pic = data.picture;
        const email = data.email;

        // Firebase Login Check
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
                verified: false
            });
            currentUser = { uid, displayName: name, email, photoURL: pic, bio: "Neu in der Community! 👋", following: [], verified: false };
        } else {
            currentUser = userSnap.data();
        }

        following = currentUser.following || [];
        localStorage.setItem('phil_session', JSON.stringify(currentUser));

        document.getElementById('login-screen').classList.remove('show');
        loadDatabase();
        initLiveChat();

    } catch (error) {
        document.getElementById('login-text').innerText = "Logge dich mit deinem offiziellen Google Account ein.";
        showCustomAlert("Login Fehlgeschlagen", "Verbindung zur Datenbank fehlgeschlagen. Sind deine Firestore-Sicherheitsregeln noch aktiv?\n\nFehler: " + error.message);
    }
});


// App Start Routine
window.onload = function() {
    if (!currentUser) {
        document.getElementById('login-screen').classList.add('show');
    } else {
        loadDatabase();
        initLiveChat();
    }
};

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('phil_session');
    window.location.reload();
});

window.toggleVerify = async function(targetUid, currentStatus) {
    try {
        await updateDoc(doc(db, "users", targetUid), { verified: !currentStatus });
        showToast(!currentStatus ? "Blauer Haken vergeben! 🔵" : "Blauer Haken entfernt.");
        openProfile(targetUid);
    } catch (e) { showCustomAlert("Fehler", "Fehler! Bist du wirklich Admin?"); }
};


// --- DATENBANK & FEED LADEN ---
async function loadDatabase() {
    document.getElementById('video-container').innerHTML = '<div class="loading-screen"><i class="fas fa-spinner fa-spin"></i><p>Lade Algorithmus...</p></div>';
    try {
        const querySnapshot = await getDocs(collection(db, "videos"));
        allVideosData = [];
        querySnapshot.forEach(doc => allVideosData.push({ id: doc.id, ...doc.data() }));
        allVideosData.reverse();
        renderFeed();
    } catch (e) {
        document.getElementById('video-container').innerHTML = '<div class="empty-state"><h3>Netzwerkfehler</h3></div>';
    }
}

function renderFeed() {
    const container = document.getElementById('video-container');
    container.innerHTML = '';
    let displayVideos = allVideosData;

    if (currentFeedMode === 'following') {
        displayVideos = allVideosData.filter(v => following.includes(v.authorUid));
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
        const commentCount = video.comments ? video.comments.length : 0;
        const isFollowing = following.includes(video.authorUid) || video.authorUid === currentUser.uid;
        const plusButton = isFollowing ? '' : `<i class="fas fa-circle-plus follow-btn" onclick="toggleFollow('${video.authorUid}', this, event)"></i>`;
        const verifiedBadge = video.authorVerified ? '<i class="fas fa-check-circle verified-badge"></i>' : '';

        container.innerHTML += `
            <div class="video" data-id="${video.id}">
                <video class="video__player" loop playsinline src="${video.url}"></video>
                <div class="play-indicator"><i class="fas fa-play"></i></div>
                <div class="mute-btn"><i class="fas fa-volume-up"></i></div>
                <div class="like-animation"><i class="fas fa-heart"></i></div>
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
                    <div class="videoSidebar__button like-btn" data-id="${video.id}">
                        <i class="fas fa-heart"></i>
                        <p class="like-count">${video.likes || 0}</p>
                    </div>
                    <div class="videoSidebar__button comment-btn" data-id="${video.id}">
                        <i class="fas fa-comment-dots"></i>
                        <p>${commentCount}</p>
                    </div>
                    <div class="videoSidebar__button share-btn" data-url="${video.url}">
                        <i class="fas fa-share"></i>
                        <p>Teilen</p>
                    </div>
                </div>
            </div>`;
    });
    attachFeedInteractions();
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

// --- INTERAKTIONEN ---
function attachFeedInteractions() {
    const videos = document.querySelectorAll('.video__player');
    videos.forEach(v => {
        const container = v.closest('.video');
        let lastTap = 0;
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

        const muteBtn = container.querySelector('.mute-btn');
        muteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            v.muted = !v.muted;
            muteBtn.innerHTML = v.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
        });

        v.addEventListener('timeupdate', () => { container.querySelector('.player-progress-filled').style.width = (v.currentTime / v.duration * 100) + '%'; });
    });

    const observer = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting && document.getElementById('view-feed').classList.contains('active')) { e.target.play().catch(() => {}); } else {
                e.target.pause();
                e.target.currentTime = 0;
            }
        });
    }, { threshold: 0.6 });
    videos.forEach(v => observer.observe(v));

    document.querySelectorAll('.like-btn').forEach(btn => {
        btn.addEventListener('click', async() => {
            const id = btn.dataset.id;
            btn.classList.toggle('liked');
            const inc = btn.classList.contains('liked') ? 1 : -1;
            const countEl = btn.querySelector('.like-count');
            countEl.innerText = parseInt(countEl.innerText) + inc;
            allVideosData.find(v => v.id === id).likes += inc;
            await updateDoc(doc(db, "videos", id), { likes: increment(inc) });
        });
    });

    document.querySelectorAll('.comment-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            window.currentCommentVideoId = btn.dataset.id;
            renderComments(window.currentCommentVideoId);
            document.getElementById('comment-modal').classList.add('show');
        });
    });

    document.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', async() => {
            if (navigator.share) { try { await navigator.share({ title: 'Phil Video', text: 'Schau dir das an!', url: btn.dataset.url }); } catch (e) {} } else {
                navigator.clipboard.writeText(btn.dataset.url);
                showToast("Kopiert!");
            }
        });
    });
}

// --- FOLLOW SYSTEM ---
window.toggleFollow = async function(targetUid, element, event) {
    if (event) event.stopPropagation();
    const userRef = doc(db, "users", currentUser.uid);

    if (!following.includes(targetUid)) {
        following.push(targetUid);
        showToast("Gefolgt!");
        if (element) element.style.display = 'none';
        await updateDoc(userRef, { following: following });
        currentUser.following = following;
        localStorage.setItem('phil_session', JSON.stringify(currentUser));

        const btn = document.getElementById('profile-action-btn');
        if (btn && btn.dataset.uid === targetUid) {
            btn.innerText = "Entfolgen";
            btn.classList.add('edit-btn');
        }
    } else {
        following = following.filter(u => u !== targetUid);
        showToast("Entfolgt.");
        await updateDoc(userRef, { following: following });
        currentUser.following = following;
        localStorage.setItem('phil_session', JSON.stringify(currentUser));

        const btn = document.getElementById('profile-action-btn');
        if (btn && btn.dataset.uid === targetUid) {
            btn.innerText = "Folgen";
            btn.classList.remove('edit-btn');
        }
    }
};

// --- ECHTES PROFIL & ADMIN BEREICH ---
window.openProfile = async function(targetUid) {
    switchView('profile');
    document.getElementById('profile-grid').innerHTML = '<div class="loading-screen"><i class="fas fa-circle-notch fa-spin"></i></div>';

    try {
        const userSnap = await getDoc(doc(db, "users", targetUid));
        const targetUser = userSnap.data();
        const userVideos = allVideosData.filter(v => v.authorUid === targetUid);
        const totalLikes = userVideos.reduce((sum, v) => sum + (v.likes || 0), 0);

        const verifiedBadge = targetUser.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : '';

        document.getElementById('profile-title').innerHTML = '@' + targetUser.displayName;
        document.getElementById('profile-name').innerHTML = targetUser.displayName + verifiedBadge;
        document.getElementById('profile-bio').innerText = targetUser.bio || "Keine Bio vorhanden.";
        document.getElementById('profile-pic').src = targetUser.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback';
        document.getElementById('stat-likes').innerText = totalLikes;
        document.getElementById('stat-followers').innerText = targetUid === currentUser.uid ? '0' : Math.floor(Math.random() * 500);
        document.getElementById('stat-following').innerText = targetUser.following ? targetUser.following.length : 0;

        const actionBtn = document.getElementById('profile-action-btn');
        actionBtn.dataset.uid = targetUid;
        const settingsIcon = document.getElementById('open-settings');
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
        } else {
            if (following.includes(targetUid)) {
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
        if (userVideos.length === 0) { grid.innerHTML = `<div style="grid-column: span 3; text-align: center; margin-top: 50px; color: #555;">Noch keine Videos</div>`; } else { userVideos.forEach(v => { grid.innerHTML += `<div class="grid-item" onclick="switchView('feed')"><video src="${v.url}#t=0.5" muted playsinline></video><div class="grid-views"><i class="fas fa-play"></i> ${v.likes || 0}</div></div>`; }); }
    } catch (e) { showCustomAlert("Fehler", "Profil konnte nicht geladen werden."); }
};

document.getElementById('nav-profile').addEventListener('click', () => { if (currentUser) openProfile(currentUser.uid); });

// --- PROFIL SPEICHERN ---
document.getElementById('save-settings-btn').addEventListener('click', async() => {
    const newName = document.getElementById('edit-name-input').value.trim();
    const newBio = document.getElementById('edit-bio-input').value.trim();
    const newPic = document.getElementById('edit-pic-input').value.trim() || currentUser.photoURL;

    if (newName.length < 3) return showCustomAlert("Hinweis", "Dein Name muss mindestens 3 Zeichen lang sein.");

    const btn = document.getElementById('save-settings-btn');
    btn.innerText = "Speichere...";
    btn.disabled = true;

    try {
        await updateDoc(doc(db, "users", currentUser.uid), {
            displayName: newName,
            bio: newBio,
            photoURL: newPic
        });

        currentUser.displayName = newName;
        currentUser.bio = newBio;
        currentUser.photoURL = newPic;
        localStorage.setItem('phil_session', JSON.stringify(currentUser));

        const q = query(collection(db, "videos"));
        const snapshot = await getDocs(q);
        snapshot.forEach(async(vDoc) => {
            if (vDoc.data().authorUid === currentUser.uid) {
                await updateDoc(doc(db, "videos", vDoc.id), {
                    authorName: newName,
                    authorPic: newPic
                });
            }
        });

        document.getElementById('profile-name').innerHTML = newName + (currentUser.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : '');
        document.getElementById('profile-title').innerText = '@' + newName;
        document.getElementById('profile-bio').innerText = newBio;
        document.getElementById('profile-pic').src = newPic;

        showToast("Profil erfolgreich aktualisiert!");
        document.getElementById('settings-modal').classList.remove('show');
        loadDatabase();
    } catch (e) {
        showCustomAlert("Fehler", "Fehler beim Speichern der Profildaten.");
    } finally {
        btn.innerText = "Profil Speichern";
        btn.disabled = false;
    }
});

// --- LIVE CHAT ---
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
    await addDoc(collection(db, "global_chat"), {
        userUid: currentUser.uid,
        userName: currentUser.displayName,
        userPic: currentUser.photoURL,
        userVerified: currentUser.verified || false,
        text: text,
        timestamp: Date.now()
    });
});
document.getElementById('chat-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('send-chat-btn').click(); });

// --- SUCHE ---
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

    const results = allVideosData.filter(v => {
        const author = (v.authorName || "").toLowerCase();
        const desc = (v.description || "").toLowerCase();
        return author.includes(query) || desc.includes(query);
    });

    resultsGrid.innerHTML = results.length === 0 ? '<div style="grid-column: span 3; text-align: center; margin-top: 50px; color: #555;">Nichts gefunden 😔</div>' : results.map(v => `<div class="grid-item" onclick="switchView('feed')"><video src="${v.url}#t=0.5" muted playsinline></video><div class="grid-views">@${v.authorName}</div></div>`).join('');
});

// --- KOMMENTARE ---
function renderComments(id) {
    const list = document.getElementById('comment-list');
    const video = allVideosData.find(v => v.id === id);
    list.innerHTML = video.comments && video.comments.length ? video.comments.map(c => {
        const badge = c.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : '';
        return `<div class="comment"><img src="${c.pic}" alt="User"><div><strong>@${c.name}${badge}</strong><p>${c.text}</p></div></div>`;
    }).join('') : '<div class="no-comments">Sei der Erste, der kommentiert!</div>';
}
document.getElementById('submit-comment').addEventListener('click', async() => {
    const input = document.getElementById('new-comment-input');
    if (!input.value.trim() || !window.currentCommentVideoId || !currentUser) return;
    const comment = { uid: currentUser.uid, name: currentUser.displayName, pic: currentUser.photoURL, verified: currentUser.verified || false, text: input.value.trim() };
    await updateDoc(doc(db, "videos", window.currentCommentVideoId), { comments: arrayUnion(comment) });
    allVideosData.find(v => v.id === window.currentCommentVideoId).comments.push(comment);
    input.value = '';
    renderComments(window.currentCommentVideoId);
    document.querySelector(`.comment-btn[data-id="${window.currentCommentVideoId}"] p`).innerText = allVideosData.find(v => v.id === window.currentCommentVideoId).comments.length;
});

// --- UPLOAD ---
document.getElementById('up-file').addEventListener('change', function() {
    document.querySelector('.file-upload-design p').innerText = this.files[0] ? this.files[0].name : "Video auswählen";
    document.querySelector('.file-upload-design i').className = "fas fa-check-circle";
    document.querySelector('.file-upload-design i').style.color = "#ff0050";
});
document.getElementById('submit-upload').addEventListener('click', async() => {
    const file = document.getElementById('up-file').files[0];
    const desc = document.getElementById('up-desc').value.trim();

    if (!file || !desc) {
        return showCustomAlert("Fehlende Daten", "Bitte wähle ein Video aus und schreibe eine Beschreibung dazu!");
    }

    if (file.size > 20 * 1024 * 1024) {
        return showCustomAlert("Video zu groß", "Bitte wähle ein Video, das kleiner als 20 MB ist.");
    }

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

        await addDoc(collection(db, "videos"), {
            url: data.secure_url,
            authorUid: currentUser.uid,
            authorName: currentUser.displayName,
            authorPic: currentUser.photoURL,
            authorVerified: currentUser.verified || false,
            description: desc,
            likes: 0,
            comments: []
        });

        showToast("Video veröffentlicht! 🎉");
        document.getElementById('upload-modal').classList.remove('show');
        document.getElementById('up-file').value = '';
        document.getElementById('up-desc').value = '';
        document.querySelector('.file-upload-design p').innerText = "Video auswählen";
        document.querySelector('.file-upload-design i').className = "fas fa-cloud-upload-alt";
        document.querySelector('.file-upload-design i').style.color = "#aaa";

        loadDatabase();
    } catch (e) {
        showCustomAlert("Upload Fehler", "Das Video konnte nicht hochgeladen werden. Stimmt dein Cloudinary Name?");
    } finally {
        btn.disabled = false;
        status.innerText = "";
    }
});

document.getElementById('open-upload').addEventListener('click', () => document.getElementById('upload-modal').classList.add('show'));
document.getElementById('close-upload').addEventListener('click', () => document.getElementById('upload-modal').classList.remove('show'));
document.getElementById('close-comments').addEventListener('click', () => document.getElementById('comment-modal').classList.remove('show'));
document.getElementById('close-settings').addEventListener('click', () => document.getElementById('settings-modal').classList.remove('show'));