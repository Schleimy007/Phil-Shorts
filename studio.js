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

let localVideoTrack;
let localAudioTrack;
let finalStream; 

const sfx = {
    applaus: new Audio('https://cdn.pixabay.com/download/audio/2022/11/22/audio_d1718ab41b.mp3'),
    airhorn: new Audio('https://cdn.pixabay.com/download/audio/2022/03/15/audio_7ce18e2eb5.mp3'),
    laugh: new Audio('https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8b82ecab0.mp3'),
    wow: new Audio('https://cdn.pixabay.com/download/audio/2021/08/04/audio_bb630cc098.mp3')
};

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

window.playEffect = (name) => {
    if(sfx[name]) { sfx[name].currentTime = 0; sfx[name].play().catch(()=>{}); }
};

async function initMediaEngine() {
    try {
        const rawStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
        localVideoTrack = rawStream.getVideoTracks()[0];
        localAudioTrack = rawStream.getAudioTracks()[0];
        finalStream = new MediaStream([localVideoTrack, localAudioTrack]);
        document.getElementById('studio-preview').srcObject = finalStream;
    } catch (e) {
        macToast("Kamera/Mikrofon nicht gefunden");
    }
}

window.requestPiP = async () => {
    const video = document.getElementById('studio-preview');
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else if (document.pictureInPictureEnabled) await video.requestPictureInPicture();
};

let cinemaMode = false;
window.toggleCinema = () => {
    cinemaMode = !cinemaMode;
    document.getElementById('left-sidebar').style.display = cinemaMode ? 'none' : 'flex';
    document.getElementById('right-sidebar').style.display = cinemaMode ? 'none' : 'flex';
    macToast(cinemaMode ? "Kino Modus an" : "Kino Modus aus");
};

window.clearChat = async () => {
    if(!isLive || !confirm("Gesamten Chat löschen?")) return;
    const q = query(collection(db, `live_streams/${currentUser.uid}/chat`));
    const snaps = await getDocs(q);
    snaps.forEach(d => deleteDoc(d.ref));
    macToast("Chat geleert");
};

window.pinMessage = (text) => {
    document.getElementById('pinned-text').innerText = text;
    document.getElementById('pinned-msg-bar').style.display = 'flex';
    macToast("Nachricht angeheftet");
};

window.switchScene = async (type) => {
    document.querySelectorAll('.discord-item').forEach(c => c.classList.remove('active'));
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
    btn.innerHTML = "<i class='fas fa-phone-slash'></i> Stream beenden";
    btn.classList.replace('btn-blurple', 'btn-green');
    btn.style.background = 'var(--red)';
    document.getElementById('live-dot').style.display = 'flex';

    peer = new Peer(currentUser.uid, { config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] }});
    
    peer.on('open', async () => {
        await setDoc(doc(db, "live_streams", currentUser.uid), {
            broadcasterUid: currentUser.uid, broadcasterName: currentUser.displayName, broadcasterPic: currentUser.photoURL,
            title: "GlassCord Stream", viewers: 0, lastHeartbeat: Date.now(), timestamp: Date.now()
        });
    });

    peer.on('call', call => {
        call.answer(finalStream);
        activeCalls.push(call);
        call.on('close', () => { activeCalls = activeCalls.filter(c => c !== call); });
    });

    durationInterval = setInterval(updateDuration, 1000);
    macToast("Du bist Live!");
}

async function stopStream() {
    isLive = false;
    clearInterval(durationInterval);
    if(peer) peer.destroy();
    await deleteDoc(doc(db, "live_streams", currentUser.uid));
    
    const btn = document.getElementById('master-live-btn');
    btn.innerHTML = "<i class='fas fa-satellite-dish'></i> Stream Starten";
    btn.style.background = '';
    btn.classList.replace('btn-green', 'btn-blurple');
    document.getElementById('live-dot').style.display = 'none';
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

// --- CONTEXT MENU & MODAL LOGIC ---
let ctxTargetUid = null;
let ctxTargetMsgId = null;
let ctxTargetText = null;
let ctxTargetName = null;

function setupContextMenu() {
    const menu = document.getElementById('mac-context-menu');
    const modal = document.getElementById('profile-modal');
    
    document.addEventListener('contextmenu', (e) => {
        const msgEl = e.target.closest('.dc-msg');
        if(msgEl && msgEl.dataset.uid) {
            e.preventDefault();
            ctxTargetUid = msgEl.dataset.uid;
            ctxTargetMsgId = msgEl.dataset.msgid;
            ctxTargetText = msgEl.dataset.text;
            ctxTargetName = msgEl.dataset.name;
            
            let x = e.clientX; let y = e.clientY;
            if (x + 200 > window.innerWidth) x = window.innerWidth - 210;
            if (y + 250 > window.innerHeight) y = window.innerHeight - 260;
            menu.style.left = `${x}px`; menu.style.top = `${y}px`;
            menu.classList.add('active');
        }
    });

    document.addEventListener('click', (e) => { 
        if(!e.target.closest('.glass-context')) menu.classList.remove('active'); 
    });

    document.getElementById('ctx-open-profile').addEventListener('click', openProfileModal);
    document.getElementById('studio-chat').addEventListener('click', (e) => {
        if(e.target.tagName === 'STRONG' || e.target.classList.contains('avatar')) {
            const msgEl = e.target.closest('.dc-msg');
            ctxTargetUid = msgEl.dataset.uid;
            ctxTargetName = msgEl.dataset.name;
            openProfileModal();
        }
    });

    function openProfileModal() {
        menu.classList.remove('active');
        document.getElementById('pm-name').innerText = ctxTargetName;
        document.getElementById('pm-avatar').innerText = ctxTargetName.charAt(0).toUpperCase();
        document.getElementById('pm-role').innerText = ctxTargetUid === currentUser.uid ? "SERVER OWNER" : "MEMBER";
        modal.classList.add('show');
    }

    document.getElementById('ctx-pin').addEventListener('click', () => { pinMessage(ctxTargetText); menu.classList.remove('active'); });
    
    document.getElementById('ctx-delete').addEventListener('click', async () => {
        if(ctxTargetMsgId && isLive) { await deleteDoc(doc(db, `live_streams/${currentUser.uid}/chat`, ctxTargetMsgId)); macToast("Nachricht gelöscht"); }
    });

    document.getElementById('ctx-timeout').addEventListener('click', () => { macToast(`${ctxTargetName} ist im Timeout.`); menu.classList.remove('active'); });
    
    const banLogic = async () => {
        if(ctxTargetUid && confirm(`Willst du ${ctxTargetName} bannen?`)) {
            await updateDoc(doc(db, "users", currentUser.uid), { blockedUsers: arrayUnion(ctxTargetUid) });
            macToast("Gebannt");
            modal.classList.remove('show');
        }
    };
    document.getElementById('ctx-ban').addEventListener('click', banLogic);
    document.getElementById('pm-btn-ban').addEventListener('click', banLogic);

    const modLogic = async () => {
        if(ctxTargetUid && isLive) {
            await setDoc(doc(db, `live_streams/${currentUser.uid}/mods`, ctxTargetUid), { uid: ctxTargetUid });
            macToast(`${ctxTargetName} ist Moderator`);
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
    
    // Einfaches Hashing für Avatar-Farben (wie in Discord)
    const stringToColor = (str) => {
        let hash = 0; for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        return '#' + "00000".substring(0, 6 - c.length) + c;
    };

    onSnapshot(query(collection(db, `live_streams/${currentUser.uid}/chat`), orderBy("timestamp", "asc")), snap => {
        chatBox.innerHTML = '';
        snap.forEach(d => {
            const m = d.data();
            const initial = m.name.charAt(0).toUpperCase();
            const color = stringToColor(m.uid);
            
            chatBox.innerHTML += `<div class="dc-msg ${m.uid === 'system' ? 'system' : ''}" data-uid="${m.uid}" data-msgid="${d.id}" data-text="${m.text}" data-name="${m.name}">
                <div class="avatar" style="background:${color}">${initial}</div>
                <div>
                    <div><strong>${m.name}</strong> <span style="font-size:10px; color:var(--text-muted); margin-left:4px;">Heute</span></div>
                    <div>${m.text}</div>
                </div>
            </div>`;
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });

    onSnapshot(doc(db, "live_streams", currentUser.uid), docSnap => {
        if(docSnap.exists()) document.getElementById('stat-viewers').innerText = docSnap.data().viewers || 0;
    });
}