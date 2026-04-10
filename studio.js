import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, orderBy, addDoc, limit, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// === FIREBASE KONFIG ===
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

// === AUDIO & VIDEO ENGINE PRO ===
let audioCtx;
let audioDestination;
let micSource;
let analyser; // FÜR DEN VISUALIZER
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
        alert("Das Live Studio ist exklusiv für Phil Shorts++ Creator!");
        window.location.href = "index.html";
        return;
    }
    await initMediaEngine();
    setupListeners();
    setupContextMenu();
    setupHotkeys();
};

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

        // === ECHTZEIT AUDIO VISUALIZER ===
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        micSource.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const micBar = document.getElementById('mic-level-bar');

        function drawVisualizer() {
            requestAnimationFrame(drawVisualizer);
            if(!localAudioTrack.enabled) { micBar.style.height = '0%'; return; }
            analyser.getByteFrequencyData(dataArray);
            let sum = 0; for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            let avg = sum / dataArray.length;
            micBar.style.height = Math.min(100, (avg / 128) * 100) + '%';
            if(avg > 100) micBar.style.background = '#ff0050'; // Rot wenn zu laut
            else micBar.style.background = '#39ff14';
        }
        drawVisualizer();

        finalStream = new MediaStream([localVideoTrack, audioDestination.stream.getAudioTracks()[0]]);
        document.getElementById('studio-preview').srcObject = new MediaStream([localVideoTrack]);

    } catch (e) {
        console.error("Engine Fehler", e);
        alert("Bitte erlaube Kamera und Mikrofon für das Studio.");
    }
}

// --- SOUNDBOARD KONTROLLE ---
window.playEffect = (name) => {
    if(sfx[name]) {
        sfx[name].currentTime = 0;
        sfx[name].play().catch(e => console.log(e));
    }
};

// --- SZENENSTEUERUNG ---
window.switchScene = async (type) => {
    document.querySelectorAll('.scene-card').forEach(c => c.classList.remove('active'));
    document.querySelector(`[data-scene="${type}"]`).classList.add('active');

    try {
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

        if (isLive) {
            activeCalls.forEach(call => {
                const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                if(sender) sender.replaceTrack(localVideoTrack);
            });
        }
    } catch (e) { console.warn("Szenenwechsel abgebrochen"); }
};

// --- STREAM START / STOP ---
document.getElementById('master-live-btn').addEventListener('click', () => {
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); 
    if(!isLive) startStream();
    else stopStream();
});

async function startStream() {
    isLive = true;
    startTime = Date.now();
    const btn = document.getElementById('master-live-btn');
    btn.innerText = "STREAM BEENDEN";
    btn.classList.add('stop');
    document.getElementById('live-dot').style.display = 'block';
    
    let statusText = document.getElementById('stream-status-text');
    statusText.innerHTML = '<i class="fas fa-circle" style="color:#ff0050; font-size:8px; vertical-align:middle; margin-right:5px;"></i> LIVE (PRO)';

    peer = new Peer(currentUser.uid, { config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] }});
    
    peer.on('open', async () => {
        await setDoc(doc(db, "live_streams", currentUser.uid), {
            broadcasterUid: currentUser.uid,
            broadcasterName: currentUser.displayName,
            broadcasterPic: currentUser.photoURL,
            title: "Pro Creator Stream",
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
}

async function stopStream() {
    isLive = false;
    clearInterval(durationInterval);
    if(peer) peer.destroy();
    await deleteDoc(doc(db, "live_streams", currentUser.uid));
    
    const btn = document.getElementById('master-live-btn');
    btn.innerText = "STREAM STARTEN";
    btn.classList.remove('stop');
    document.getElementById('live-dot').style.display = 'none';
    let statusText = document.getElementById('stream-status-text');
    statusText.innerHTML = '<i class="fas fa-circle" style="color:#444; font-size:8px; vertical-align:middle; margin-right:5px;"></i> OFFLINE';
    
    activeCalls = [];
}

function updateDuration() {
    let diff = Math.floor((Date.now() - startTime) / 1000);
    let h = Math.floor(diff / 3600).toString().padStart(2, '0');
    let m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    let s = (diff % 60).toString().padStart(2, '0');
    document.getElementById('stat-duration').innerText = `${h}:${m}:${s}`;
    
    if(diff % 5 === 0 && isLive) {
        updateDoc(doc(db, "live_streams", currentUser.uid), { lastHeartbeat: Date.now() }).catch(()=>{});
    }
}

// --- INTERAKTIONS FUNKTIONEN ---
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

window.updateGoal = async () => {
    const val = document.getElementById('goal-input').value;
    if(!val || !isLive) return;
    await updateDoc(doc(db, "live_streams", currentUser.uid), {
        goalTarget: parseInt(val), goalCurrent: 0, goalDesc: "Creator Goal"
    });
    document.getElementById('goal-input').value = '';
};

window.setLiveBanner = async () => {
    const val = document.getElementById('banner-input').value;
    if(!isLive) return;
    await updateDoc(doc(db, "live_streams", currentUser.uid), { title: val });
    document.getElementById('banner-input').value = '';
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

// --- CUSTOM CONTEXT MENU FÜR MODERATION ---
let ctxTargetUid = null;
let ctxTargetMsgId = null;

function setupContextMenu() {
    const menu = document.getElementById('studio-context-menu');
    
    document.addEventListener('contextmenu', (e) => {
        const msgEl = e.target.closest('.chat-msg');
        if(msgEl && msgEl.dataset.uid) {
            e.preventDefault();
            ctxTargetUid = msgEl.dataset.uid;
            ctxTargetMsgId = msgEl.dataset.msgid;
            
            // Eigene Nachrichten kann man nicht bannen/modden
            const isMe = ctxTargetUid === currentUser.uid;
            document.getElementById('ctx-ban').style.display = isMe ? 'none' : 'flex';
            document.getElementById('ctx-mod').style.display = isMe ? 'none' : 'flex';

            let x = e.clientX; let y = e.clientY;
            if (x + 200 > window.innerWidth) x = window.innerWidth - 210;
            if (y + 150 > window.innerHeight) y = window.innerHeight - 160;

            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;
            menu.classList.add('active');
        }
    });

    document.addEventListener('click', () => { menu.classList.remove('active'); });

    document.getElementById('ctx-delete').addEventListener('click', async () => {
        if(ctxTargetMsgId && isLive) {
            await deleteDoc(doc(db, `live_streams/${currentUser.uid}/chat`, ctxTargetMsgId));
        }
    });

    document.getElementById('ctx-ban').addEventListener('click', async () => {
        if(ctxTargetUid && confirm("User bannen?")) {
            await updateDoc(doc(db, "users", currentUser.uid), { blockedUsers: arrayUnion(ctxTargetUid) });
        }
    });

    document.getElementById('ctx-mod').addEventListener('click', async () => {
        if(ctxTargetUid && isLive) {
            await setDoc(doc(db, `live_streams/${currentUser.uid}/mods`, ctxTargetUid), { uid: ctxTargetUid });
            alert("Zum Moderator ernannt!");
        }
    });
}

// --- PRO KEYBOARD HOTKEYS ---
function setupHotkeys() {
    window.addEventListener('keydown', (e) => {
        if(document.activeElement.tagName === 'INPUT') return;
        
        switch(e.key.toLowerCase()) {
            case 'm': e.preventDefault(); toggleMic(); break;
            case 'v': e.preventDefault(); toggleVid(); break;
            case 's': 
                e.preventDefault(); 
                const isCam = document.querySelector('[data-scene="cam"]').classList.contains('active');
                window.switchScene(isCam ? 'screen' : 'cam'); 
                break;
            case 'c': e.preventDefault(); document.getElementById('studio-chat-input').focus(); break;
        }
    });
}

// --- FIREBASE REALTIME LISTENERS ---
function setupListeners() {
    onSnapshot(query(collection(db, `live_streams/${currentUser.uid}/chat`), orderBy("timestamp", "desc"), limit(40)), snap => {
        const box = document.getElementById('studio-chat');
        box.innerHTML = '';
        snap.forEach(d => {
            const m = d.data();
            const isHost = m.uid === currentUser.uid;
            const hostBadge = isHost ? '<span style="background:#ff0050; color:white; font-size:10px; padding:2px 4px; border-radius:3px; margin-right:5px; vertical-align:middle;">HOST</span>' : '';
            box.innerHTML += `<div class="chat-msg" data-uid="${m.uid}" data-msgid="${d.id}">
                ${hostBadge}<strong>${m.name}:</strong> <span style="color:#ddd;">${m.text}</span>
            </div>`;
        });
    });

    onSnapshot(collection(db, `live_streams/${currentUser.uid}/gifts`), snap => {
        const giftBox = document.getElementById('studio-events');
        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const g = change.doc.data();
                giftBox.innerHTML = `<div class="event-msg">
                    <span style="font-size:24px; float:left; margin-right:10px;">${g.emoji}</span>
                    <div>
                        <strong style="color:#ffd700;">${g.name}</strong> hat <b>${g.giftName}</b> gesendet!
                        <div style="color:#888; font-size:10px; margin-top:2px;">+${g.price} Coins</div>
                    </div>
                </div>` + giftBox.innerHTML;
                document.getElementById('stat-coins').innerText = (parseInt(document.getElementById('stat-coins').innerText) + g.price);
            }
        });
    });

    onSnapshot(doc(db, "live_streams", currentUser.uid), docSnap => {
        if(docSnap.exists()) {
            document.getElementById('stat-viewers').innerText = docSnap.data().viewers || 0;
        }
    });
}

window.switchStudioTab = (tab) => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('studio-chat').style.display = tab === 'chat' ? 'flex' : 'none';
    document.getElementById('studio-events').style.display = tab === 'events' ? 'flex' : 'none';
    event.target.classList.add('active');
};