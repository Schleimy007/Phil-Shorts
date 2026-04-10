import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, orderBy, addDoc, arrayUnion, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

let audioCtx, audioDestination, micSource, analyser; 
let localVideoTrack, localAudioTrack, finalStream; 

const sfx = {
    applaus: new Audio('https://cdn.pixabay.com/download/audio/2022/11/22/audio_d1718ab41b.mp3'),
    airhorn: new Audio('https://cdn.pixabay.com/download/audio/2022/03/15/audio_7ce18e2eb5.mp3'),
    laugh: new Audio('https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8b82ecab0.mp3'),
    wow: new Audio('https://cdn.pixabay.com/download/audio/2021/08/04/audio_bb630cc098.mp3')
};

window.onload = async () => {
    if(!currentUser || currentUser.philPlusTier < 2) {
        alert("Studio ist exklusiv für Phil Shorts++ Creator!");
        window.location.href = "index.html";
        return;
    }
    await initMediaEngine();
    setupListeners();
    setupContextMenu();
    setupHotkeys();
    setupExtraUI();
};

window.sysToast = (msg) => {
    const toast = document.getElementById('sys-toast');
    document.getElementById('toast-text').innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
};

// --- AUDIO/VIDEO ENGINE (WITH ECHTEM OBS METER) ---
async function initMediaEngine() {
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioDestination = audioCtx.createMediaStreamDestination();

        for(let key in sfx) {
            sfx[key].crossOrigin = "anonymous";
            let sfxSource = audioCtx.createMediaElementSource(sfx[key]);
            sfxSource.connect(audioDestination); 
            sfxSource.connect(audioCtx.destination); 
        }

        const rawStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
        localVideoTrack = rawStream.getVideoTracks()[0];
        localAudioTrack = rawStream.getAudioTracks()[0];

        micSource = audioCtx.createMediaStreamSource(new MediaStream([localAudioTrack]));
        micSource.connect(audioDestination);

        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.85; // Butterweich
        micSource.connect(analyser);
        
        finalStream = new MediaStream([localVideoTrack, audioDestination.stream.getAudioTracks()[0]]);
        document.getElementById('studio-preview').srcObject = new MediaStream([localVideoTrack]);

        animateDBMeter();
    } catch (e) { sysToast("Kamera/Mikrofon blockiert!"); }
}

function animateDBMeter() {
    const meter = document.getElementById('mic-level');
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    function draw() {
        requestAnimationFrame(draw);
        if(!localAudioTrack?.enabled) { meter.style.width = '0%'; return; }
        analyser.getByteFrequencyData(dataArray);
        let sum = 0; for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
        let avg = sum / dataArray.length;
        // Map average to percentage (0 to ~150 mapped to 0-100%)
        let percent = Math.min(100, (avg / 100) * 100);
        meter.style.width = percent + '%';
    }
    draw();
}

window.playEffect = (name) => {
    if(sfx[name]) { sfx[name].currentTime = 0; sfx[name].play().catch(()=>{}); }
};

// --- ECHTE UI FUNKTIONEN ---
function setupExtraUI() {
    document.getElementById('studio-chat-input').addEventListener('keypress', (e) => {
        if(e.key === 'Enter') window.sendHostMessage();
    });

    document.getElementById('stream-title').addEventListener('change', async (e) => {
        if(isLive) {
            await updateDoc(doc(db, "live_streams", currentUser.uid), { title: e.target.value });
            sysToast("Stream-Titel aktualisiert!");
        }
    });
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
    document.querySelector('.app-layout').style.gridTemplateColumns = cinemaMode ? '0px 1fr 0px' : '280px 1fr 340px';
    sysToast(cinemaMode ? "Kino Modus aktiv" : "Standard Modus");
};

window.clearChat = async () => {
    if(!isLive || !confirm("Gesamten Chat löschen?")) return;
    const q = query(collection(db, `live_streams/${currentUser.uid}/chat`));
    const snaps = await getDocs(q);
    snaps.forEach(d => deleteDoc(d.ref));
    sysToast("Chat wurde geleert!");
};

window.pinMessage = async (text) => {
    document.getElementById('pinned-text').innerText = text;
    document.getElementById('pinned-msg-bar').style.display = 'flex';
    if(isLive) await updateDoc(doc(db, "live_streams", currentUser.uid), { pinnedMessage: text });
    sysToast("Nachricht angeheftet!");
};

window.unpinMessage = async () => {
    document.getElementById('pinned-msg-bar').style.display = 'none';
    if(isLive) await updateDoc(doc(db, "live_streams", currentUser.uid), { pinnedMessage: null });
};

window.switchScene = async (type) => {
    document.querySelectorAll('.source-btn').forEach(c => c.classList.remove('active'));
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

// --- GO LIVE LOGIK ---
document.getElementById('master-live-btn').addEventListener('click', () => {
    if(!isLive) startStream(); else stopStream();
});

async function startStream() {
    isLive = true;
    startTime = Date.now();
    const btn = document.getElementById('master-live-btn');
    btn.innerHTML = "Stream beenden";
    btn.classList.add('danger');
    
    const ind = document.getElementById('live-indicator');
    ind.classList.add('active');
    ind.innerHTML = '<i class="fas fa-circle"></i> LIVE';

    const title = document.getElementById('stream-title').value || "Live Stream";

    peer = new Peer(currentUser.uid, { config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] }});
    
    peer.on('open', async () => {
        await setDoc(doc(db, "live_streams", currentUser.uid), {
            broadcasterUid: currentUser.uid, 
            broadcasterName: currentUser.displayName, 
            broadcasterPic: currentUser.photoURL,
            title: title, 
            viewers: 0, 
            lastHeartbeat: Date.now(), 
            timestamp: Date.now()
        });
    });

    peer.on('call', call => {
        call.answer(finalStream);
        activeCalls.push(call);
        call.on('close', () => { activeCalls = activeCalls.filter(c => c !== call); });
    });

    durationInterval = setInterval(updateDuration, 1000);
    sysToast("Du bist jetzt Live!");
}

async function stopStream() {
    isLive = false;
    clearInterval(durationInterval);
    if(peer) peer.destroy();
    await deleteDoc(doc(db, "live_streams", currentUser.uid));
    
    const btn = document.getElementById('master-live-btn');
    btn.innerHTML = "Stream Starten";
    btn.classList.remove('danger');
    
    const ind = document.getElementById('live-indicator');
    ind.classList.remove('active');
    ind.innerHTML = '<i class="fas fa-circle"></i> Offline';
    
    activeCalls = [];
}

function updateDuration() {
    let diff = Math.floor((Date.now() - startTime) / 1000);
    let m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    let s = (diff % 60).toString().padStart(2, '0');
    document.getElementById('stat-duration').innerText = `${m}:${s}`;
    
    if(diff % 5 === 0 && isLive) {
        updateDoc(doc(db, "live_streams", currentUser.uid), { lastHeartbeat: Date.now() }).catch(()=>{});
    }
}

window.toggleMic = () => {
    localAudioTrack.enabled = !localAudioTrack.enabled;
    const btn = document.getElementById('toggle-mic');
    btn.classList.toggle('muted', !localAudioTrack.enabled);
    btn.innerHTML = localAudioTrack.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
};

window.toggleVid = () => {
    localVideoTrack.enabled = !localVideoTrack.enabled;
    const btn = document.getElementById('toggle-vid');
    btn.classList.toggle('muted', !localVideoTrack.enabled);
    btn.innerHTML = localVideoTrack.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
};

window.sendHostMessage = async () => {
    const input = document.getElementById('studio-chat-input');
    if(!input.value.trim() || !isLive) return;
    await addDoc(collection(db, `live_streams/${currentUser.uid}/chat`), {
        uid: currentUser.uid, 
        name: currentUser.displayName, 
        text: input.value, 
        timestamp: Date.now()
    });
    input.value = '';
};

// --- CHAT MODERATION & CONTEXT MENU ---
let ctxTargetUid = null;
let ctxTargetMsgId = null;
let ctxTargetText = null;
let ctxTargetName = null;

function setupContextMenu() {
    const menu = document.getElementById('ctx-menu');
    const modal = document.getElementById('viewer-card');
    
    document.addEventListener('contextmenu', (e) => {
        const msgEl = e.target.closest('.tw-msg');
        if(msgEl && msgEl.dataset.uid) {
            e.preventDefault();
            ctxTargetUid = msgEl.dataset.uid;
            ctxTargetMsgId = msgEl.dataset.msgid;
            ctxTargetText = msgEl.dataset.text;
            ctxTargetName = msgEl.dataset.name;
            
            let x = e.clientX; let y = e.clientY;
            if (x + 200 > window.innerWidth) x = window.innerWidth - 210;
            if (y + 220 > window.innerHeight) y = window.innerHeight - 230;
            menu.style.left = `${x}px`; menu.style.top = `${y}px`;
            menu.classList.add('active');
        }
    });

    document.addEventListener('click', (e) => { 
        if(!e.target.closest('.glass-menu')) menu.classList.remove('active'); 
    });

    document.getElementById('ctx-profile').addEventListener('click', openProfileModal);
    document.getElementById('studio-chat').addEventListener('click', (e) => {
        if(e.target.tagName === 'STRONG') {
            const msgEl = e.target.closest('.tw-msg');
            ctxTargetUid = msgEl.dataset.uid;
            ctxTargetName = msgEl.dataset.name;
            openProfileModal();
        }
    });

    function openProfileModal() {
        menu.classList.remove('active');
        document.getElementById('pm-name').innerText = ctxTargetName;
        document.getElementById('pm-avatar').innerText = ctxTargetName.charAt(0).toUpperCase();
        document.getElementById('pm-role').innerText = ctxTargetUid === currentUser.uid ? "Broadcaster" : "Zuschauer";
        modal.classList.add('show');
    }

    document.getElementById('ctx-pin').addEventListener('click', () => { window.pinMessage(ctxTargetText); menu.classList.remove('active'); });
    
    document.getElementById('ctx-delete').addEventListener('click', async () => {
        if(ctxTargetMsgId && isLive) { 
            await deleteDoc(doc(db, `live_streams/${currentUser.uid}/chat`, ctxTargetMsgId)); 
            sysToast("Nachricht entfernt"); 
        }
    });

    const timeoutLogic = async () => {
        if(ctxTargetUid && isLive) {
            await setDoc(doc(db, `live_streams/${currentUser.uid}/timeouts`, ctxTargetUid), { expire: Date.now() + 300000 });
            sysToast(`${ctxTargetName} hat 5m Timeout.`);
            menu.classList.remove('active');
            modal.classList.remove('show');
        }
    };
    document.getElementById('ctx-timeout').addEventListener('click', timeoutLogic);
    document.getElementById('pm-btn-timeout').addEventListener('click', timeoutLogic);
    
    const banLogic = async () => {
        if(ctxTargetUid && confirm(`Willst du ${ctxTargetName} bannen?`)) {
            await updateDoc(doc(db, "users", currentUser.uid), { blockedUsers: arrayUnion(ctxTargetUid) });
            sysToast("Gebannt!");
            modal.classList.remove('show');
        }
    };
    document.getElementById('ctx-ban').addEventListener('click', banLogic);
    document.getElementById('pm-btn-ban').addEventListener('click', banLogic);

    const modLogic = async () => {
        if(ctxTargetUid && isLive) {
            await setDoc(doc(db, `live_streams/${currentUser.uid}/mods`, ctxTargetUid), { uid: ctxTargetUid });
            sysToast(`${ctxTargetName} ist nun Mod!`);
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
            case 'm': e.preventDefault(); window.toggleMic(); break;
            case 'v': e.preventDefault(); window.toggleVid(); break;
            case 'p': e.preventDefault(); window.requestPiP(); break;
            case 'f': e.preventDefault(); window.toggleCinema(); break;
        }
    });
}

// --- TWITCH CHAT SCROLL PHYSICS ---
let isChatPaused = false;

function setupListeners() {
    const chatContainer = document.getElementById('studio-chat');
    const scroller = document.getElementById('chat-scroller');
    const pauseBanner = document.getElementById('chat-paused-banner');
    let modsList = [];

    onSnapshot(collection(db, `live_streams/${currentUser.uid}/mods`), snap => {
        modsList = snap.docs.map(d => d.id);
    });
    
    const stringToColor = (str) => {
        const colors = ['#FF453A', '#0A84FF', '#32D74B', '#FF9F0A', '#BF5AF2', '#FF375F', '#5E5CE6', '#FFD60A'];
        let hash = 0; for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    // Scroll Logic
    scroller.addEventListener('scroll', () => {
        // Wenn man hochscrollt (nicht mehr ganz unten ist)
        const isAtBottom = scroller.scrollHeight - scroller.scrollTop <= scroller.clientHeight + 20;
        if (!isAtBottom && !isChatPaused) {
            isChatPaused = true;
            pauseBanner.style.display = 'flex';
        } else if (isAtBottom && isChatPaused) {
            isChatPaused = false;
            pauseBanner.style.display = 'none';
        }
    });

    window.resumeChatScroll = () => {
        isChatPaused = false;
        pauseBanner.style.display = 'none';
        scroller.scrollTop = scroller.scrollHeight;
    };

    onSnapshot(query(collection(db, `live_streams/${currentUser.uid}/chat`), orderBy("timestamp", "asc")), snap => {
        chatContainer.innerHTML = '';
        snap.forEach(d => {
            const m = d.data();
            const color = stringToColor(m.uid);
            const isHost = m.uid === currentUser.uid;
            const isMod = modsList.includes(m.uid);
            
            let badge = '';
            if(isHost) badge = '<span class="badge host">HOST</span>';
            else if(isMod) badge = '<span class="badge mod">MOD</span>';
            
            const time = new Date(m.timestamp).toLocaleTimeString('de-DE', {hour: '2-digit', minute:'2-digit'});
            
            chatContainer.innerHTML += `<div class="tw-msg" data-uid="${m.uid}" data-msgid="${d.id}" data-text="${m.text}" data-name="${m.name}">
                <span class="timestamp">${time}</span>
                ${badge}<strong style="color:${color}">${m.name}</strong><span style="color:var(--text-muted)">:</span> <span class="text">${m.text}</span>
            </div>`;
        });
        
        if(!isChatPaused) {
            scroller.scrollTop = scroller.scrollHeight;
        }
    });

    onSnapshot(doc(db, "live_streams", currentUser.uid), docSnap => {
        if(docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('stat-viewers').innerText = data.viewers || 0;
            if(data.pinnedMessage) {
                document.getElementById('pinned-text').innerText = data.pinnedMessage;
                document.getElementById('pinned-msg-bar').style.display = 'flex';
            }
        }
    });
}