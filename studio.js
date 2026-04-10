import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, orderBy, addDoc, limit, arrayUnion, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = { 
    apiKey: "AIzaSyAF-QW_MtVBkImqh1gXwhKrc2pLLCAe3Ek", 
    authDomain: "phil-shorts.firebaseapp.com", 
    projectId: "phil-shorts", 
    storageBucket: "phil-shorts.firebasestorage.app", 
    messagingSenderId: "785802511451", 
    appId: "1:785802511451:web:c7aabd40a4a8ea89616b7e"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentUser = JSON.parse(localStorage.getItem('phil_session'));
let peer = null;
let isLive = false;
let startTime = null;
let durationInterval = null;
let activeCalls = [];

// Engine
let localVideoTrack;
let localAudioTrack;
let finalStream; 

window.onload = async () => {
    if(!currentUser || currentUser.philPlusTier < 2) {
        alert("Studio ist exklusiv für Phil Shorts++");
        window.location.href = "index.html";
        return;
    }
    await initMediaEngine();
    setupListeners();
    setupContextMenu();
    setupHotkeys();
};

window.macToast = (msg) => {
    const toast = document.getElementById('mac-toast');
    document.getElementById('toast-msg').innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
};

async function initMediaEngine() {
    try {
        const rawStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
        localVideoTrack = rawStream.getVideoTracks()[0];
        localAudioTrack = rawStream.getAudioTracks()[0];
        finalStream = new MediaStream([localVideoTrack, localAudioTrack]);
        document.getElementById('studio-preview').srcObject = finalStream;
    } catch (e) {
        macToast("Fehler: Kamera nicht gefunden");
    }
}

// === NEW FEATURES LOGIC ===

// Feature: Picture in Picture (PiP)
window.requestPiP = async () => {
    const video = document.getElementById('studio-preview');
    if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
    }
};

// Feature: Cinema Mode
let cinemaMode = false;
window.toggleCinema = () => {
    cinemaMode = !cinemaMode;
    document.getElementById('left-sidebar').style.display = cinemaMode ? 'none' : 'flex';
    document.getElementById('right-sidebar').style.display = cinemaMode ? 'none' : 'flex';
    document.querySelector('.studio-container').style.gridTemplateColumns = cinemaMode ? '0px 1fr 0px' : '280px 1fr 340px';
    macToast(cinemaMode ? "Kino Modus an" : "Kino Modus aus");
};

// Feature: Clear Chat
window.clearChat = async () => {
    if(!isLive || !confirm("Gesamten Chat unwiderruflich löschen?")) return;
    const q = query(collection(db, `live_streams/${currentUser.uid}/chat`));
    const snaps = await getDocs(q);
    snaps.forEach(d => deleteDoc(d.ref));
    macToast("Chat wurde geleert");
};

// Feature: Quick Poll
window.startPoll = () => {
    if(!isLive) return;
    const q = prompt("Umfrage-Frage eingeben:");
    if(q) {
        addDoc(collection(db, `live_streams/${currentUser.uid}/chat`), {
            uid: "system", name: "📊 UMFRAGE", text: q + " (Antwortet mit Ja/Nein)", timestamp: Date.now()
        });
        macToast("Umfrage gestartet");
    }
};

// Feature: Pin Message
window.pinMessage = (text) => {
    document.getElementById('pinned-text').innerText = text;
    document.getElementById('pinned-msg-bar').style.display = 'flex';
    macToast("Nachricht angeheftet");
};

// --- STREAM KONTROLLE ---
window.switchScene = async (type) => {
    document.querySelectorAll('.apple-card').forEach(c => c.classList.remove('active'));
    document.querySelector(`[data-scene="${type}"]`).classList.add('active');
    
    let newVideoTrack;
    if (type === 'screen') {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        newVideoTrack = screenStream.getVideoTracks()[0];
        newVideoTrack.onended = () => { window.switchScene('cam'); };
    } else {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
        newVideoTrack = camStream.getVideoTracks()[0];
    }

    finalStream.removeTrack(localVideoTrack);
    finalStream.addTrack(newVideoTrack);
    localVideoTrack = newVideoTrack;

    document.getElementById('studio-preview').srcObject = new MediaStream([localVideoTrack]);
    document.getElementById('studio-preview').style.transform = type === 'cam' ? 'scaleX(-1)' : 'none';
};

document.getElementById('master-live-btn').addEventListener('click', () => {
    if(!isLive) startStream(); else stopStream();
});

async function startStream() {
    isLive = true;
    startTime = Date.now();
    const btn = document.getElementById('master-live-btn');
    btn.innerText = "Stream beenden";
    btn.classList.add('btn-danger');
    
    document.getElementById('stream-status').innerHTML = '<i class="fas fa-circle" style="color:var(--apple-red); font-size:8px;"></i> LIVE';

    peer = new Peer(currentUser.uid, { config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] }});
    
    peer.on('open', async () => {
        await setDoc(doc(db, "live_streams", currentUser.uid), {
            broadcasterUid: currentUser.uid, broadcasterName: currentUser.displayName, broadcasterPic: currentUser.photoURL,
            title: "Mac Studio Stream", viewers: 0, lastHeartbeat: Date.now(), timestamp: Date.now()
        });
    });

    peer.on('call', call => {
        call.answer(finalStream);
        activeCalls.push(call);
        call.on('close', () => { activeCalls = activeCalls.filter(c => c !== call); });
    });

    durationInterval = setInterval(updateDuration, 1000);
    macToast("Du bist jetzt Live!");
}

async function stopStream() {
    isLive = false;
    clearInterval(durationInterval);
    if(peer) peer.destroy();
    await deleteDoc(doc(db, "live_streams", currentUser.uid));
    
    const btn = document.getElementById('master-live-btn');
    btn.innerText = "Go Live";
    btn.classList.remove('btn-danger');
    document.getElementById('stream-status').innerHTML = '<i class="fas fa-circle" style="color:var(--text-muted); font-size:8px;"></i> Bereit';
    activeCalls = [];
}

function updateDuration() {
    let diff = Math.floor((Date.now() - startTime) / 1000);
    let m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    let s = (diff % 60).toString().padStart(2, '0');
    document.getElementById('stat-duration').innerText = `${m}:${s}`;
    if(diff % 5 === 0 && isLive) updateDoc(doc(db, "live_streams", currentUser.uid), { lastHeartbeat: Date.now() }).catch(()=>{});
}

window.toggleMic = () => {
    localAudioTrack.enabled = !localAudioTrack.enabled;
    const btn = document.getElementById('toggle-mic');
    btn.classList.toggle('danger', !localAudioTrack.enabled);
    btn.innerHTML = localAudioTrack.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
};

window.toggleVid = () => {
    localVideoTrack.enabled = !localVideoTrack.enabled;
    const btn = document.getElementById('toggle-vid');
    btn.classList.toggle('danger', !localVideoTrack.enabled);
    btn.innerHTML = localVideoTrack.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
};

window.sendHostMessage = async () => {
    const input = document.getElementById('studio-chat-input');
    if(!input.value.trim() || !isLive) return;
    await addDoc(collection(db, `live_streams/${currentUser.uid}/chat`), {
        uid: currentUser.uid, name: currentUser.displayName, text: input.value, timestamp: Date.now()
    });
    input.value = '';
};

// --- MAC CONTEXT MENU & PROFILE MODAL ---
let ctxTargetUid = null;
let ctxTargetMsgId = null;
let ctxTargetText = null;
let ctxTargetName = null;

function setupContextMenu() {
    const menu = document.getElementById('mac-context-menu');
    const modal = document.getElementById('profile-modal');
    
    // Rechtsklick Event
    document.addEventListener('contextmenu', (e) => {
        const msgEl = e.target.closest('.mac-chat-msg');
        if(msgEl && msgEl.dataset.uid) {
            e.preventDefault();
            ctxTargetUid = msgEl.dataset.uid;
            ctxTargetMsgId = msgEl.dataset.msgid;
            ctxTargetText = msgEl.dataset.text;
            ctxTargetName = msgEl.dataset.name;
            
            let x = e.clientX; let y = e.clientY;
            if (x + 220 > window.innerWidth) x = window.innerWidth - 230;
            if (y + 250 > window.innerHeight) y = window.innerHeight - 260;
            menu.style.left = `${x}px`; menu.style.top = `${y}px`;
            menu.classList.add('active');
        }
    });

    document.addEventListener('click', (e) => { 
        if(!e.target.closest('.mac-context-menu')) menu.classList.remove('active'); 
    });

    // Profil öffnen (aus Menü oder Klick auf Namen)
    document.getElementById('ctx-open-profile').addEventListener('click', openProfileModal);

    // Klick auf Name im Chat
    document.getElementById('studio-chat').addEventListener('click', (e) => {
        if(e.target.tagName === 'STRONG') {
            const msgEl = e.target.closest('.mac-chat-msg');
            ctxTargetUid = msgEl.dataset.uid;
            ctxTargetName = msgEl.dataset.name;
            openProfileModal();
        }
    });

    function openProfileModal() {
        menu.classList.remove('active');
        document.getElementById('pm-name').innerText = ctxTargetName;
        document.getElementById('pm-role').innerText = ctxTargetUid === currentUser.uid ? "HOST" : "Zuschauer";
        modal.classList.add('show');
    }

    // Aktionen
    document.getElementById('ctx-pin').addEventListener('click', () => { pinMessage(ctxTargetText); menu.classList.remove('active'); });
    
    document.getElementById('ctx-delete').addEventListener('click', async () => {
        if(ctxTargetMsgId && isLive) { await deleteDoc(doc(db, `live_streams/${currentUser.uid}/chat`, ctxTargetMsgId)); macToast("Nachricht gelöscht"); }
    });

    document.getElementById('ctx-timeout').addEventListener('click', () => { macToast(`${ctxTargetName} wurde für 5 Minuten stummgeschaltet.`); menu.classList.remove('active'); });
    
    const banLogic = async () => {
        if(ctxTargetUid && confirm(`Willst du ${ctxTargetName} wirklich bannen?`)) {
            await updateDoc(doc(db, "users", currentUser.uid), { blockedUsers: arrayUnion(ctxTargetUid) });
            macToast("User gebannt");
            modal.classList.remove('show');
        }
    };
    document.getElementById('ctx-ban').addEventListener('click', banLogic);
    document.getElementById('pm-btn-ban').addEventListener('click', banLogic);

    const modLogic = async () => {
        if(ctxTargetUid && isLive) {
            await setDoc(doc(db, `live_streams/${currentUser.uid}/mods`, ctxTargetUid), { uid: ctxTargetUid });
            macToast(`${ctxTargetName} ist nun Moderator`);
            modal.classList.remove('show');
        }
    };
    document.getElementById('ctx-mod').addEventListener('click', modLogic);
    document.getElementById('pm-btn-mod').addEventListener('click', modLogic);
}

function setupHotkeys() {
    window.addEventListener('keydown', (e) => {
        if(document.activeElement.tagName === 'INPUT') return;
        switch(e.key.toLowerCase()) {
            case 'm': e.preventDefault(); toggleMic(); break;
            case 'v': e.preventDefault(); toggleVid(); break;
            case 'p': e.preventDefault(); requestPiP(); break;
            case 'f': e.preventDefault(); toggleCinema(); break;
        }
    });
}

function setupListeners() {
    const chatBox = document.getElementById('studio-chat');
    onSnapshot(query(collection(db, `live_streams/${currentUser.uid}/chat`), orderBy("timestamp", "asc")), snap => {
        chatBox.innerHTML = '';
        snap.forEach(d => {
            const m = d.data();
            const isSys = m.uid === "system";
            const color = isSys ? "var(--apple-blue)" : "var(--text-main)";
            chatBox.innerHTML += `<div class="mac-chat-msg" data-uid="${m.uid}" data-msgid="${d.id}" data-text="${m.text}" data-name="${m.name}">
                <div><strong style="color:${color}">${m.name}</strong></div>
                <div style="color:var(--text-muted); margin-top:2px;">${m.text}</div>
            </div>`;
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });

    onSnapshot(doc(db, "live_streams", currentUser.uid), docSnap => {
        if(docSnap.exists()) document.getElementById('stat-viewers').innerText = docSnap.data().viewers || 0;
    });
}