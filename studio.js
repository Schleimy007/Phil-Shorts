import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, collection, query, orderBy, addDoc, increment, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
let localStream = null;
let peer = null;
let isLive = false;
let startTime = null;
let durationInterval = null;
let activeCalls = [];

// Initialisierung
window.onload = async () => {
    if(!currentUser || currentUser.philPlusTier < 2) {
        alert("Das Live Studio ist exklusiv für Phil Shorts++ Creator!");
        window.location.href = "index.html";
        return;
    }
    setupCamera();
    setupListeners();
};

// --- MULTI-SZENE LOGIK ---
async function setupCamera() {
    try {
        if(localStream) localStream.getTracks().forEach(t => t.stop());
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 1280, height: 720 }, 
            audio: true 
        });
        document.getElementById('studio-preview').srcObject = localStream;
    } catch (e) {
        console.error("Kamerafehler", e);
    }
}

window.switchScene = async (type) => {
    document.querySelectorAll('.scene-card').forEach(c => c.classList.remove('active'));
    document.querySelector(`[data-scene="${type}"]`).classList.add('active');

    try {
        let newStream;
        if (type === 'screen') {
            newStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        } else {
            newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        }

        // Tracks im laufenden Stream für alle Zuschauer austauschen
        const videoTrack = newStream.getVideoTracks()[0];
        if (isLive) {
            activeCalls.forEach(call => {
                const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                sender.replaceTrack(videoTrack);
            });
        }
        
        localStream = newStream;
        document.getElementById('studio-preview').srcObject = localStream;
        document.getElementById('studio-preview').style.transform = type === 'cam' ? 'scaleX(-1)' : 'none';

    } catch (e) { console.warn("Szenenwechsel abgebrochen"); }
};

// --- STREAM KONTROLLE ---
document.getElementById('master-live-btn').addEventListener('click', () => {
    if(!isLive) startStream();
    else stopStream();
});

async function startStream() {
    isLive = true;
    startTime = Date.now();
    const btn = document.getElementById('master-live-btn');
    btn.innerText = "LIVE BEENDEN";
    btn.classList.add('stop');
    document.getElementById('live-dot').style.display = 'block';
    document.getElementById('stream-status-text').innerText = "Streaming live...";

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
        call.answer(localStream);
        activeCalls.push(call);
    });

    durationInterval = setInterval(updateDuration, 1000);
}

function updateDuration() {
    let diff = Math.floor((Date.now() - startTime) / 1000);
    let h = Math.floor(diff / 3600).toString().padStart(2, '0');
    let m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    let s = (diff % 60).toString().padStart(2, '0');
    document.getElementById('stat-duration').innerText = `${h}:${m}:${s}`;
}

// --- INTERAKTIONS FUNKTIONEN ---
window.toggleMic = () => {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    document.getElementById('toggle-mic').classList.toggle('muted', !audioTrack.enabled);
};

window.toggleVid = () => {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    document.getElementById('toggle-vid').classList.toggle('muted', !videoTrack.enabled);
};

window.updateGoal = async () => {
    const val = document.getElementById('goal-input').value;
    if(!val) return;
    await updateDoc(doc(db, "live_streams", currentUser.uid), {
        goalTarget: parseInt(val),
        goalCurrent: 0,
        goalDesc: "Studio Goal"
    });
    alert("Live-Ziel gesetzt!");
};

window.sendHostMessage = async () => {
    const input = document.getElementById('studio-chat-input');
    if(!input.value.trim()) return;
    await addDoc(collection(db, `live_streams/${currentUser.uid}/chat`), {
        uid: currentUser.uid,
        name: "HOST: " + currentUser.displayName,
        text: input.value,
        timestamp: Date.now()
    });
    input.value = '';
};

// Echtzeit-Überwachung
function setupListeners() {
    onSnapshot(query(collection(db, `live_streams/${currentUser.uid}/chat`), orderBy("timestamp", "desc"), limit(25)), snap => {
        const box = document.getElementById('studio-chat');
        box.innerHTML = snap.docs.map(d => {
            const m = d.data();
            return `<div class="chat-msg"><strong>${m.name}:</strong> ${m.text}</div>`;
        }).join('');
    });

    onSnapshot(collection(db, `live_streams/${currentUser.uid}/gifts`), snap => {
        const giftBox = document.getElementById('studio-events');
        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const g = change.doc.data();
                giftBox.innerHTML = `<div class="event-msg">🎁 <strong>${g.name}</strong> schickt ${g.giftName}!</div>` + giftBox.innerHTML;
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