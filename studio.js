import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, collection, query, orderBy, addDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// === FIREBASE KONFIG (Gleich wie in script.js) ===
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

// Initialisierung
window.onload = async () => {
    if(!currentUser || currentUser.philPlusTier < 2) {
        alert("Zugriff verweigert. Das Live Studio ist exklusiv für Phil Shorts++ Creator!");
        window.location.href = "index.html";
        return;
    }
    setupCamera();
    setupListeners();
};

async function setupCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('studio-preview').srcObject = localStream;
    } catch (e) {
        alert("Kamera konnte nicht geladen werden.");
    }
}

// Stream Starten / Stoppen
document.getElementById('master-live-btn').addEventListener('click', async () => {
    const btn = document.getElementById('master-live-btn');
    if(!isLive) {
        startStream();
        btn.innerText = "LIVE BEENDEN";
        btn.classList.add('stop');
        document.getElementById('live-dot').style.display = 'block';
    } else {
        stopStream();
        btn.innerText = "STREAM STARTEN";
        btn.classList.remove('stop');
        document.getElementById('live-dot').style.display = 'none';
    }
});

async function startStream() {
    isLive = true;
    startTime = Date.now();
    
    // PeerJS Initialisierung für Broadcaster
    peer = new Peer(currentUser.uid);
    
    peer.on('open', async () => {
        await setDoc(doc(db, "live_streams", currentUser.uid), {
            broadcasterUid: currentUser.uid,
            broadcasterName: currentUser.displayName,
            broadcasterPic: currentUser.photoURL,
            title: "Pro Stream aus dem Studio",
            viewers: 0,
            lastHeartbeat: Date.now(),
            timestamp: Date.now()
        });
    });

    peer.on('call', call => {
        call.answer(localStream);
    });

    // Timer
    durationInterval = setInterval(updateDuration, 1000);
}

async function stopStream() {
    isLive = false;
    clearInterval(durationInterval);
    if(peer) peer.destroy();
    await deleteDoc(doc(db, "live_streams", currentUser.uid));
}

function updateDuration() {
    let diff = Math.floor((Date.now() - startTime) / 1000);
    let h = Math.floor(diff / 3600).toString().padStart(2, '0');
    let m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    let s = (diff % 60).toString().padStart(2, '0');
    document.getElementById('stat-duration').innerText = `${h}:${m}:${s}`;
}

// Echtzeit-Daten (Chat & Geschenke)
function setupListeners() {
    const chatBox = document.getElementById('studio-chat');
    const giftBox = document.getElementById('studio-events');

    // Chat abonnieren
    onSnapshot(query(collection(db, `live_streams/${currentUser.uid}/chat`), orderBy("timestamp", "desc"), limit(20)), snap => {
        chatBox.innerHTML = '';
        snap.forEach(d => {
            const m = d.data();
            chatBox.innerHTML += `<div><strong>${m.name}:</strong> ${m.text}</div>`;
        });
    });

    // Geschenke abonnieren
    onSnapshot(collection(db, `live_streams/${currentUser.uid}/gifts`), snap => {
        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const g = change.doc.data();
                giftBox.innerHTML = `<div class="event-msg">🎁 <strong>${g.name}</strong> hat ${g.giftName} gesendet!</div>` + giftBox.innerHTML;
                document.getElementById('stat-coins').innerText = (parseInt(document.getElementById('stat-coins').innerText) + g.price);
            }
        });
    });
}

// UI Switcher
window.switchStudioTab = (tab) => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('studio-chat').style.display = tab === 'chat' ? 'block' : 'none';
    document.getElementById('studio-events').style.display = tab === 'events' ? 'block' : 'none';
    event.target.classList.add('active');
};