import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, orderBy, addDoc, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// === AUDIO & VIDEO ENGINE ===
let audioCtx;
let audioDestination;
let micSource;
let localVideoTrack;
let localAudioTrack;
let finalStream; // Das ist der gemixte Stream, der an die Zuschauer geht

// Soundboard Assets (Öffentliche, lizenzfreie URLs für den Test)
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
};

async function initMediaEngine() {
    try {
        // 1. Audio Mixer erstellen
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioDestination = audioCtx.createMediaStreamDestination();

        // 2. Soundboard in den Mixer leiten
        for(let key in sfx) {
            sfx[key].crossOrigin = "anonymous";
            let sfxSource = audioCtx.createMediaElementSource(sfx[key]);
            sfxSource.connect(audioDestination); // Zum Stream
            sfxSource.connect(audioCtx.destination); // Zum lokalen Lautsprecher (damit du es selbst hörst)
        }

        // 3. Kamera & Mikrofon holen
        const rawStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
        localVideoTrack = rawStream.getVideoTracks()[0];
        localAudioTrack = rawStream.getAudioTracks()[0];

        // 4. Mikrofon in den Mixer leiten
        micSource = audioCtx.createMediaStreamSource(new MediaStream([localAudioTrack]));
        micSource.connect(audioDestination);

        // 5. Finalen Stream für PeerJS zusammenbauen (Video + Gemixte Audio)
        finalStream = new MediaStream([localVideoTrack, audioDestination.stream.getAudioTracks()[0]]);

        // Lokale Vorschau (nur Video, sonst hört man sich selbst doppelt)
        const previewStream = new MediaStream([localVideoTrack]);
        document.getElementById('studio-preview').srcObject = previewStream;

    } catch (e) {
        console.error("Engine Fehler", e);
        alert("Kamera/Mikrofon konnte nicht geladen werden.");
    }
}

// --- SOUNDBOARD KONTROLLE ---
window.playEffect = (name) => {
    if(sfx[name]) {
        sfx[name].currentTime = 0;
        sfx[name].play().catch(e => console.log("Audio Play Error:", e));
    }
};

// --- SZENENSTEUERUNG (SCREEN & CAM) ---
window.switchScene = async (type) => {
    document.querySelectorAll('.scene-card').forEach(c => c.classList.remove('active'));
    document.querySelector(`[data-scene="${type}"]`).classList.add('active');

    try {
        let newVideoTrack;
        if (type === 'screen') {
            // Bildschirm aufnehmen
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            newVideoTrack = screenStream.getVideoTracks()[0];
            
            // Wenn Screen beendet wird, zurück zur Kamera
            newVideoTrack.onended = () => { window.switchScene('cam'); };
        } else {
            // Zurück zur Kamera
            const camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
            newVideoTrack = camStream.getVideoTracks()[0];
        }

        // Den laufenden Stream updaten
        finalStream.removeTrack(localVideoTrack);
        finalStream.addTrack(newVideoTrack);
        localVideoTrack = newVideoTrack;

        // Vorschau anpassen
        document.getElementById('studio-preview').srcObject = new MediaStream([localVideoTrack]);
        document.getElementById('studio-preview').style.transform = type === 'cam' ? 'scaleX(-1)' : 'none';

        // Allen aktuellen Zuschauern den neuen Track pushen!
        if (isLive && activeCalls.length > 0) {
            activeCalls.forEach(call => {
                const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                if(sender) sender.replaceTrack(localVideoTrack);
            });
        }
    } catch (e) { console.warn("Szenenwechsel abgebrochen"); }
};

// --- STREAM START / STOP ---
document.getElementById('master-live-btn').addEventListener('click', () => {
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); // Wichtig für Browser-Policy
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
    statusText.innerHTML = '<i class="fas fa-circle" style="color:#39ff14;"></i> Du bist LIVE';
    statusText.style.color = '#39ff14';

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
        // HIER SENDEN WIR DEN GEMIXTEN STREAM (MIC + SOUNDBOARD + VIDEO)
        call.answer(finalStream);
        activeCalls.push(call);
        
        call.on('close', () => {
            activeCalls = activeCalls.filter(c => c !== call);
        });
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
    statusText.innerHTML = '<i class="fas fa-circle" style="color:#444;"></i> Offline';
    statusText.style.color = '#888';
    
    activeCalls = [];
}

function updateDuration() {
    let diff = Math.floor((Date.now() - startTime) / 1000);
    let h = Math.floor(diff / 3600).toString().padStart(2, '0');
    let m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    let s = (diff % 60).toString().padStart(2, '0');
    document.getElementById('stat-duration').innerText = `${h}:${m}:${s}`;
    
    // Heartbeat an Firebase (damit Zuschauer sehen, dass Stream noch da ist)
    if(diff % 5 === 0 && isLive) {
        updateDoc(doc(db, "live_streams", currentUser.uid), { lastHeartbeat: Date.now() }).catch(()=>{});
    }
}

// --- INTERAKTIONS FUNKTIONEN ---
window.toggleMic = () => {
    localAudioTrack.enabled = !localAudioTrack.enabled;
    document.getElementById('toggle-mic').classList.toggle('muted', !localAudioTrack.enabled);
    document.getElementById('toggle-mic').innerHTML = localAudioTrack.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
};

window.toggleVid = () => {
    localVideoTrack.enabled = !localVideoTrack.enabled;
    document.getElementById('toggle-vid').classList.toggle('muted', !localVideoTrack.enabled);
    document.getElementById('toggle-vid').innerHTML = localVideoTrack.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
};

window.updateGoal = async () => {
    const val = document.getElementById('goal-input').value;
    if(!val || !isLive) return;
    await updateDoc(doc(db, "live_streams", currentUser.uid), {
        goalTarget: parseInt(val),
        goalCurrent: 0,
        goalDesc: "Creator Goal"
    });
    document.getElementById('goal-input').value = '';
};

// NEU: Stream Banner
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

// NEU: Chat Moderation
window.deleteMsg = async (msgId) => {
    if(confirm("Nachricht aus dem Stream löschen?")) {
        await deleteDoc(doc(db, `live_streams/${currentUser.uid}/chat`, msgId));
    }
};

// Echtzeit-Überwachung
function setupListeners() {
    // Chat mit Löschfunktion
    onSnapshot(query(collection(db, `live_streams/${currentUser.uid}/chat`), orderBy("timestamp", "desc"), limit(30)), snap => {
        const box = document.getElementById('studio-chat');
        box.innerHTML = '';
        snap.forEach(d => {
            const m = d.data();
            const isHost = m.uid === currentUser.uid;
            const hostBadge = isHost ? '<span style="background:#ff0050; color:white; font-size:10px; padding:2px 4px; border-radius:3px; margin-right:5px;">HOST</span>' : '';
            box.innerHTML += `<div class="chat-msg" onclick="deleteMsg('${d.id}')" title="Klicken zum Löschen">
                ${hostBadge}<strong>${m.name}:</strong> <span style="color:#ddd;">${m.text}</span>
            </div>`;
        });
    });

    onSnapshot(collection(db, `live_streams/${currentUser.uid}/gifts`), snap => {
        const giftBox = document.getElementById('studio-events');
        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const g = change.doc.data();
                giftBox.innerHTML = `<div class="event-msg" style="background: rgba(255,215,0,0.1); padding: 10px; border-radius: 8px; border-left: 3px solid #ffd700; margin-bottom: 8px;">
                    🎁 <strong style="color:#ffd700;">${g.name}</strong> hat <b>${g.giftName}</b> (${g.emoji}) gesendet! <span style="color:#888; font-size:11px;">+${g.price} Coins</span>
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