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
let currentRoom = null; // 🔥 LiveKit Raum-Instanz
let isLive = false;
let startTime = null;
let durationInterval = null;
let modsList = [];

// === AUDIO & VIDEO ENGINE PRO ===
let audioCtx;
let audioDestination;
let micSource;
let screenAudioSource;
let musicSource;
let analyser;

let localVideoTrack = null;
let localScreenTrack = null;
let localAudioTrack = null;
let finalStream; 

let mode = 'cam'; 
let isPiPMode = false;
let animationFrameId;

// 🔥 FPS & Performance-Einstellungen
let targetFPS = 30;
let fpsInterval = 1000 / targetFPS;
let thenRenderTime = Date.now();

const canvas = document.getElementById('composite-canvas');
// GPU Beschleunigung: Alpha deaktiviert, Desynchronized an (Spart massiv CPU!)
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'low'; 

const previewVideo = document.getElementById('studio-preview');
const facecamVideo = document.getElementById('facecam-preview') || document.getElementById('facecam-video');
const facecamOverlay = document.getElementById('facecam-overlay') || document.getElementById('facecam-container');
const bgMusicPlayer = document.getElementById('bg-music-player');

let fcState = { x: 0.75, y: 0.05, width: 0.23 }; 

// --- DRAG & DROP FÜR FACECAM OVERLAY ---
let isDragging = false;
let startX, startY, initialLeft, initialTop;

if(facecamOverlay) {
    facecamOverlay.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX; startY = e.clientY;
        initialLeft = facecamOverlay.offsetLeft; initialTop = facecamOverlay.offsetTop;
        facecamOverlay.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX; const dy = e.clientY - startY;
        
        const wrapper = document.getElementById('preview-viewport');
        let newLeft = initialLeft + dx; let newTop = initialTop + dy;
        
        newLeft = Math.max(0, Math.min(newLeft, wrapper.clientWidth - facecamOverlay.offsetWidth));
        newTop = Math.max(0, Math.min(newTop, wrapper.clientHeight - facecamOverlay.offsetHeight));

        facecamOverlay.style.left = `${newLeft}px`;
        facecamOverlay.style.top = `${newTop}px`;

        fcState.x = newLeft / wrapper.clientWidth;
        fcState.y = newTop / wrapper.clientHeight;
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        facecamOverlay.style.cursor = 'move';
    });

    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const wrapper = document.getElementById('preview-viewport');
            fcState.width = entry.contentRect.width / wrapper.clientWidth;
        }
    });
    resizeObserver.observe(facecamOverlay);
}


// --- INIT ENGINE ---
window.onload = async () => {
    if(!currentUser || currentUser.philPlusTier < 2) {
        alert("Studio ist exklusiv für Phil Shorts++ Creator!");
        window.location.href = "index.html"; return;
    }
    
    onSnapshot(collection(db, `live_streams/${currentUser.uid}/mods`), snap => {
        modsList = snap.docs.map(d => d.id);
    });

    await initBaseCamera();
    setupExtraUI();
    setupListeners();
    setupContextMenu();
    setupHotkeys();
    setupGifts();
    
    if(typeof loadMusicLibrary === 'function') loadMusicLibrary();
};

window.changeFPS = async () => {
    const val = parseInt(document.getElementById('fps-select').value);
    targetFPS = val;
    fpsInterval = 1000 / targetFPS;
    
    if (localVideoTrack) {
        try { await localVideoTrack.applyConstraints({ frameRate: { ideal: targetFPS, max: targetFPS } }); } catch(e) {}
    }
    if (localScreenTrack) {
        try { await localScreenTrack.applyConstraints({ frameRate: { ideal: targetFPS, max: targetFPS } }); } catch(e) {}
    }
    sysToast(`Stream-Qualität auf ${targetFPS} FPS gesetzt!`);
};

// Startet beim Laden NUR die Kamera für die Vorschau
async function initBaseCamera() {
    try {
        const camStream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: targetFPS, max: targetFPS } }, 
            audio: true 
        });
        localVideoTrack = camStream.getVideoTracks()[0];
        localAudioTrack = camStream.getAudioTracks()[0];

        if(facecamVideo) facecamVideo.srcObject = new MediaStream([localVideoTrack]);
        previewVideo.srcObject = new MediaStream([localVideoTrack]);
        previewVideo.style.transform = 'scaleX(-1)';
        
        await populateMics();
    } catch(e) {
        sysToast("Kamera-Berechtigung fehlt.");
    }
}

// Füllt das Dropdown und reagiert auf Mic-Wechsel
async function populateMics() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        const select = document.getElementById('mic-select');
        if(!select) return;
        select.innerHTML = audioInputs.map(d => `<option value="${d.deviceId}">${d.label || 'Mikrofon ' + (select.length + 1)}</option>`).join('');
        
        select.onchange = async () => {
            const deviceId = select.value;
            const newCamStream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: targetFPS, max: targetFPS } }, 
                audio: { deviceId: { exact: deviceId } } 
            });
            
            localAudioTrack = newCamStream.getAudioTracks()[0];
            localVideoTrack = newCamStream.getVideoTracks()[0];

            if(facecamVideo) facecamVideo.srcObject = new MediaStream([localVideoTrack]);
            if(mode === 'cam') previewVideo.srcObject = new MediaStream([localVideoTrack]);
            
            // Wenn der Mixer (und der Stream) schon läuft, Audio Source updaten!
            if(audioCtx && micSource) {
                micSource.disconnect();
                micSource = audioCtx.createMediaStreamSource(new MediaStream([localAudioTrack]));
                micSource.connect(audioDestination);
                micSource.connect(analyser); 
                
                finalStream.removeTrack(finalStream.getAudioTracks()[0]);
                finalStream.addTrack(audioDestination.stream.getAudioTracks()[0]);
            }
        };
    } catch(e) {}
}

// Wird beim allerersten Szene-Wechsel ODER bei Stream-Start aktiviert, um zeitsyncro zu sichern
function initAudioMixer() {
    if(audioCtx) return;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioDestination = audioCtx.createMediaStreamDestination();

    // Soundboard
    for(let key in sfx) {
        sfx[key].crossOrigin = "anonymous";
        let sfxSource = audioCtx.createMediaElementSource(sfx[key]);
        sfxSource.connect(audioDestination); 
        sfxSource.connect(audioCtx.destination); 
    }

    // Hintergrundmusik (falls vorhanden)
    if(bgMusicPlayer) {
        musicSource = audioCtx.createMediaElementSource(bgMusicPlayer);
        musicSource.connect(audioDestination);
        musicSource.connect(audioCtx.destination);
    }

    micSource = audioCtx.createMediaStreamSource(new MediaStream([localAudioTrack]));
    micSource.connect(audioDestination);

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.85; 
    micSource.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const micBar = document.getElementById('mic-level');

    let lastVisTime = 0;
    function drawVisualizer(now) {
        requestAnimationFrame(drawVisualizer);
        if (now - lastVisTime < 50) return;
        lastVisTime = now;

        if(!localAudioTrack.enabled) { if(micBar) micBar.style.width = '0%'; return; }
        analyser.getByteFrequencyData(dataArray);
        let sum = 0; for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        let avg = sum / dataArray.length;
        let percent = Math.min(100, (avg / 100) * 100);
        if(micBar) micBar.style.width = percent + '%';
    }
    requestAnimationFrame(drawVisualizer);

    // Canvas liefert das Bild, audioDest liefert das fertige Audio!
    const canvasStream = canvas.captureStream(60); 
    finalStream = new MediaStream([canvasStream.getVideoTracks()[0], audioDestination.stream.getAudioTracks()[0]]);
    
    thenRenderTime = Date.now();
    startCompositor();
}

// === COMPOSITING (Der Video-Mixer für die Zuschauer) ===
function startCompositor() {
    function renderCanvas() {
        animationFrameId = requestAnimationFrame(renderCanvas);
        
        let now = Date.now();
        let elapsed = now - thenRenderTime;

        // 🔥 DIE FRAME-BREMSE (Verhindert CPU-Überlastung!)
        if (elapsed > fpsInterval) {
            thenRenderTime = now - (elapsed % fpsInterval);

            // Da alpha: false gesetzt ist, überschreiben wir das Bild einfach
            if (isPiPMode) {
                if (localScreenTrack) ctx.drawImage(previewVideo, 0, 0, canvas.width, canvas.height);
                
                if (localVideoTrack && facecamVideo) {
                    const camW = canvas.width * fcState.width;
                    const camH = camW * (9/16); 
                    const camX = canvas.width * fcState.x;
                    const camY = canvas.height * fcState.y;
                    
                    ctx.save();
                    ctx.translate(camX + camW, camY);
                    ctx.scale(-1, 1);
                    ctx.drawImage(facecamVideo, 0, 0, camW, camH);
                    ctx.restore();

                    ctx.strokeStyle = '#00f2fe';
                    ctx.lineWidth = 4;
                    ctx.strokeRect(camX, camY, camW, camH);
                }
            } else {
                const sourceVideo = previewVideo; 
                if (sourceVideo.srcObject) {
                    if(sourceVideo.style.transform.includes('scaleX(-1)')) {
                        ctx.save();
                        ctx.translate(canvas.width, 0);
                        ctx.scale(-1, 1);
                        ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
                        ctx.restore();
                    } else {
                        ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
                    }
                } else {
                    ctx.fillStyle = '#000';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
            }
        }
    }
    requestAnimationFrame(renderCanvas);
}

// --- SZENENSTEUERUNG ---
window.switchScene = async (type) => {
    document.querySelectorAll('.source-btn').forEach(c => c.classList.remove('active'));
    let activeBtn = document.querySelector(`[data-scene="${type}"]`);
    if(activeBtn) activeBtn.classList.add('active');
    
    isPiPMode = false;
    if(facecamOverlay) facecamOverlay.style.display = 'none';
    mode = type;
    
    initAudioMixer(); // Startet den Mixer im Hintergrund

    try {
        if (type === 'screen' || type === 'pip') {
            if (!localScreenTrack) {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
                    video: { frameRate: { ideal: targetFPS, max: targetFPS } }, 
                    audio: true // Versucht PC-Systemsound abzugreifen
                });
                localScreenTrack = screenStream.getVideoTracks()[0];
                
                if(screenStream.getAudioTracks().length > 0) {
                    if(screenAudioSource) screenAudioSource.disconnect();
                    screenAudioSource = audioCtx.createMediaStreamSource(screenStream);
                    screenAudioSource.connect(audioDestination);
                }
                
                localScreenTrack.onended = () => { window.switchScene('cam'); };
            }
            
            previewVideo.srcObject = new MediaStream([localScreenTrack]);
            previewVideo.style.transform = 'none';
            
            if(type === 'pip') {
                isPiPMode = true;
                if(facecamOverlay) facecamOverlay.style.display = 'block';
            }
        } else {
            // Normale Cam Ansicht
            previewVideo.srcObject = new MediaStream([localVideoTrack]);
            previewVideo.style.transform = 'scaleX(-1)';
        }
    } catch (e) { console.warn("Szenenwechsel abgebrochen", e); }
};

// ... SOUNDBOARD SFX ...
const sfx = {
    applaus: new Audio('https://cdn.pixabay.com/download/audio/2022/11/22/audio_d1718ab41b.mp3'),
    airhorn: new Audio('https://cdn.pixabay.com/download/audio/2022/03/15/audio_7ce18e2eb5.mp3'),
    laugh: new Audio('https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8b82ecab0.mp3'),
    wow: new Audio('https://cdn.pixabay.com/download/audio/2021/08/04/audio_bb630cc098.mp3')
};

window.sysToast = (msg) => {
    const toast = document.getElementById('sys-toast');
    if(!toast) return;
    document.getElementById('toast-text').innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
};

window.playEffect = (name) => {
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if(sfx[name]) { sfx[name].currentTime = 0; sfx[name].play().catch(()=>{}); }
};

// --- ECHTE UI FUNKTIONEN ---
function setupExtraUI() {
    const chatInput = document.getElementById('studio-chat-input');
    if(chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') window.sendHostMessage();
        });
    }

    const titleInput = document.getElementById('stream-title');
    if(titleInput) {
        titleInput.addEventListener('change', async (e) => {
            if(isLive) {
                await updateDoc(doc(db, "live_streams", currentUser.uid), { title: e.target.value });
                sysToast("Stream-Titel aktualisiert!");
            }
        });
    }

    const volSlider = document.getElementById('pc-volume-slider');
    if(volSlider) {
        volSlider.addEventListener('input', (e) => {
            previewVideo.volume = e.target.value;
        });
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
    const left = document.getElementById('left-sidebar');
    const right = document.getElementById('right-sidebar');
    const layout = document.querySelector('.app-layout');
    if(left) left.style.display = cinemaMode ? 'none' : 'flex';
    if(right) right.style.display = cinemaMode ? 'none' : 'flex';
    if(layout) layout.style.gridTemplateColumns = cinemaMode ? '0px 1fr 0px' : '280px 1fr 340px';
    sysToast(cinemaMode ? "Kino Modus aktiv" : "Standard Modus");
};

// --- ADMIN TOOLS ---
window.clearChat = async () => {
    if(!confirm("Gesamten Chat löschen?")) return;
    const q = query(collection(db, `live_streams/${currentUser.uid}/chat`));
    const snaps = await getDocs(q);
    snaps.forEach(d => deleteDoc(d.ref));
    sysToast("Chat wurde geleert!");
};

window.pinMessage = async (text) => {
    const textEl = document.getElementById('pinned-text');
    const barEl = document.getElementById('pinned-msg-bar');
    if(textEl) textEl.innerText = text;
    if(barEl) barEl.style.display = 'flex';
    if(isLive) await updateDoc(doc(db, "live_streams", currentUser.uid), { pinnedMessage: text });
    sysToast("Nachricht angeheftet!");
};

window.unpinMessage = async () => {
    const barEl = document.getElementById('pinned-msg-bar');
    if(barEl) barEl.style.display = 'none';
    if(isLive) await updateDoc(doc(db, "live_streams", currentUser.uid), { pinnedMessage: null });
};

window.updateLiveGoal = async () => {
    const goalTarget = parseInt(document.getElementById('goal-target')?.value) || 0;
    const goalDesc = document.getElementById('goal-desc')?.value || "Ziel";
    if(isLive) {
        await updateDoc(doc(db, "live_streams", currentUser.uid), { goalTarget: goalTarget, goalDesc: goalDesc });
        sysToast("Live Ziel wurde an Zuschauer gesendet!");
    } else {
        sysToast("Wird beim Streamstart übernommen.");
    }
};

// =====================================
// 🔥 GO LIVE LOGIK (LIVEKIT UPGRADE) 🔥
// =====================================
const btnLive = document.getElementById('master-live-btn');
if(btnLive) {
    btnLive.addEventListener('click', () => {
        if(!isLive) startStream(); else stopStream();
    });
}

async function startStream() {
    initAudioMixer(); 
    if(audioCtx && audioCtx.state === 'suspended') await audioCtx.resume(); 

    // Chat leeren
    const q = query(collection(db, `live_streams/${currentUser.uid}/chat`));
    const snaps = await getDocs(q);
    snaps.forEach(d => deleteDoc(d.ref));

    isLive = true;
    startTime = Date.now();
    const btn = document.getElementById('master-live-btn');
    if(btn) {
        btn.innerHTML = "STREAM BEENDEN";
        btn.classList.add('danger');
    }
    
    const ind = document.getElementById('live-indicator');
    if(ind) ind.style.display = 'block';

    const title = document.getElementById('stream-title')?.value || "Live Stream";
    const goalTarget = parseInt(document.getElementById('goal-target')?.value) || 0;
    const goalDesc = document.getElementById('goal-desc')?.value || "";

    // Firebase Datenbank Eintrag aktualisieren
    await setDoc(doc(db, "live_streams", currentUser.uid), {
        broadcasterUid: currentUser.uid, 
        broadcasterName: currentUser.displayName, 
        broadcasterPic: currentUser.photoURL,
        title: title, 
        viewers: 0, 
        goalTarget: goalTarget,
        goalCurrent: 0,
        goalDesc: goalDesc,
        lastHeartbeat: Date.now(), 
        timestamp: Date.now()
    });

    // 🔴 LIVEKIT CONNECTION 🔴
    if(currentRoom) {
        currentRoom.disconnect();
    }
    
    const livekitUrl = "wss://phil-shorts-cv9pfxjq.livekit.cloud"; // <-- Hier LiveKit URL eintragen
    const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzU4NzI1NDMsImlkZW50aXR5Ijoic3RyZWFtZXIxIiwiaXNzIjoiQVBJYWJ1bUZzZllDZndKIiwibmJmIjoxNzc1ODY4OTQzLCJzdWIiOiJzdHJlYW1lcjEiLCJ2aWRlbyI6eyJjYW5QdWJsaXNoIjp0cnVlLCJjYW5QdWJsaXNoRGF0YSI6ZmFsc2UsImNhblN1YnNjcmliZSI6dHJ1ZSwicm9vbSI6InRlc3RyYXVtIiwicm9vbUpvaW4iOnRydWV9fQ.bnDC7xpwY5oDtlzR83u_VNbjCVp6zSLK11Q3TpifD1M"; // <-- Hier Token mit Publish Rechten eintragen

    if(typeof LivekitClient !== 'undefined') {
        currentRoom = new LivekitClient.Room();

        try {
            await currentRoom.connect(livekitUrl, token);
            console.log("Erfolgreich als Host im LiveKit Raum!");

            // Videotrack und Audiotrack an den Server pushen
            const videoTrack = finalStream.getVideoTracks()[0];
            const audioTrack = finalStream.getAudioTracks()[0];

    if(videoTrack) {
            await currentRoom.localParticipant.publishTrack(videoTrack, {
                videoEncoding: {
                    maxBitrate: 3500000, // Zwingt LiveKit, fette 3.5 Mbit/s für HD zu nutzen
                    maxFramerate: targetFPS
                },
                simulcast: false // 🔥 ABSOLUT WICHTIG: Verhindert, dass der Server das Canvas-Video zerschneidet und runterskaliert!
            });
        }            if(audioTrack) await currentRoom.localParticipant.publishTrack(audioTrack);

        } catch (e) {
            console.error("LiveKit Fehler:", e);
            sysToast("LiveKit Verbindungsfehler!");
        }
    } else {
        console.warn("LivekitClient SDK nicht geladen! Stream läuft nur lokal in Vorschau.");
    }

    durationInterval = setInterval(updateDuration, 1000);
    sysToast("Du bist jetzt Live!");
}

async function stopStream() {
    isLive = false;
    clearInterval(durationInterval);
    
    // LiveKit sauber trennen
    if(currentRoom) {
        currentRoom.disconnect();
        currentRoom = null;
    }
    
    await deleteDoc(doc(db, "live_streams", currentUser.uid));
    
    const btn = document.getElementById('master-live-btn');
    if(btn) {
        btn.innerHTML = "STREAM STARTEN";
        btn.classList.remove('danger');
    }
    const ind = document.getElementById('live-indicator');
    if(ind) ind.style.display = 'none';
}

function updateDuration() {
    let diff = Math.floor((Date.now() - startTime) / 1000);
    let m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    let s = (diff % 60).toString().padStart(2, '0');
    const statDur = document.getElementById('stat-duration');
    if(statDur) statDur.innerText = `${m}:${s}`;
    
    if(diff % 5 === 0 && isLive) {
        updateDoc(doc(db, "live_streams", currentUser.uid), { lastHeartbeat: Date.now() }).catch(()=>{});
    }
}

window.toggleMic = () => {
    if(!localAudioTrack) return;
    localAudioTrack.enabled = !localAudioTrack.enabled;
    const btn = document.getElementById('toggle-mic');
    if(btn) {
        btn.classList.toggle('muted', !localAudioTrack.enabled);
        btn.innerHTML = localAudioTrack.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
    }
};

window.toggleVid = () => {
    if(!localVideoTrack) return;
    localVideoTrack.enabled = !localVideoTrack.enabled;
    const btn = document.getElementById('toggle-vid');
    if(btn) {
        btn.classList.toggle('muted', !localVideoTrack.enabled);
        btn.innerHTML = localVideoTrack.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
    }
};

window.sendHostMessage = async () => {
    const input = document.getElementById('studio-chat-input');
    if(!input || !input.value.trim() || !isLive) return;
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
    if(!menu) return;
    const modal = document.getElementById('viewer-card');
    
    document.addEventListener('contextmenu', (e) => {
        const msgEl = e.target.closest('.tw-msg');
        if(msgEl && msgEl.dataset.uid) {
            e.preventDefault();
            ctxTargetUid = msgEl.dataset.uid;
            ctxTargetMsgId = msgEl.dataset.msgid;
            ctxTargetText = msgEl.dataset.text;
            ctxTargetName = msgEl.dataset.name;
            
            const isMe = (ctxTargetUid === currentUser.uid);
            const isMod = modsList.includes(ctxTargetUid);

            // Streamer-Schutz 
            const btnDelete = document.getElementById('ctx-delete');
            const btnBan = document.getElementById('ctx-ban');
            const btnTimeout = document.getElementById('ctx-timeout');
            const btnMod = document.getElementById('ctx-mod');

            if(btnDelete) btnDelete.style.display = isMe ? 'none' : 'flex';
            if(btnBan) btnBan.style.display = isMe ? 'none' : 'flex';
            if(btnTimeout) btnTimeout.style.display = isMe ? 'none' : 'flex';
            if(btnMod) btnMod.style.display = isMe ? 'none' : 'flex';

            if(!isMe && btnMod) {
                btnMod.innerHTML = isMod ? '<i class="fas fa-user-minus"></i> Mod-Status entfernen' : '<i class="fas fa-shield-alt"></i> Moderator machen';
            }

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

    const ctxProfile = document.getElementById('ctx-profile');
    if(ctxProfile) ctxProfile.addEventListener('click', openProfileModal);

    const studioChat = document.getElementById('studio-chat');
    if(studioChat) {
        studioChat.addEventListener('click', (e) => {
            if(e.target.tagName === 'STRONG') {
                const msgEl = e.target.closest('.tw-msg');
                ctxTargetUid = msgEl.dataset.uid;
                ctxTargetName = msgEl.dataset.name;
                openProfileModal();
            }
        });
    }

    function openProfileModal() {
        menu.classList.remove('active');
        document.getElementById('pm-name').innerText = ctxTargetName;
        document.getElementById('pm-avatar').innerText = ctxTargetName.charAt(0).toUpperCase();
        document.getElementById('pm-role').innerText = ctxTargetUid === currentUser.uid ? "Broadcaster" : (modsList.includes(ctxTargetUid) ? "Moderator" : "Zuschauer");
        
        const isMe = (ctxTargetUid === currentUser.uid);
        const btnMod = document.getElementById('pm-btn-mod');
        const btnTimeout = document.getElementById('pm-btn-timeout');
        const btnBan = document.getElementById('pm-btn-ban');

        if(btnMod) btnMod.style.display = isMe ? 'none' : 'flex';
        if(btnTimeout) btnTimeout.style.display = isMe ? 'none' : 'flex';
        if(btnBan) btnBan.style.display = isMe ? 'none' : 'flex';

        if(!isMe && btnMod) {
            btnMod.innerHTML = modsList.includes(ctxTargetUid) ? '<i class="fas fa-user-minus"></i> Als Mod entfernen' : '<i class="fas fa-shield-alt" style="color:#10b981"></i> Als Mod ernennen';
        }

        if(modal) modal.classList.add('show');
    }

    const ctxPin = document.getElementById('ctx-pin');
    if(ctxPin) ctxPin.addEventListener('click', () => { window.pinMessage(ctxTargetText); menu.classList.remove('active'); });
    
    const ctxWhisper = document.getElementById('ctx-whisper');
    if(ctxWhisper) {
        ctxWhisper.addEventListener('click', () => { 
            window.open(`index.html?dm=${ctxTargetUid}`, '_blank'); 
            menu.classList.remove('active'); 
        });
    }
    
    const ctxDelete = document.getElementById('ctx-delete');
    if(ctxDelete) {
        ctxDelete.addEventListener('click', async () => {
            if(ctxTargetMsgId && isLive) { 
                await deleteDoc(doc(db, `live_streams/${currentUser.uid}/chat`, ctxTargetMsgId)); 
                sysToast("Nachricht entfernt"); 
                menu.classList.remove('active');
            }
        });
    }

    const timeoutLogic = async () => {
        if(ctxTargetUid && isLive) {
            let mins = prompt(`Wie viele Minuten Timeout für ${ctxTargetName}?`, "5");
            if(mins && !isNaN(mins)) {
                await setDoc(doc(db, `live_streams/${currentUser.uid}/timeouts`, ctxTargetUid), { expire: Date.now() + (parseInt(mins) * 60000) });
                sysToast(`${ctxTargetName} hat ${mins}m Timeout.`);
                menu.classList.remove('active');
                if(modal) modal.classList.remove('show');
            }
        }
    };
    const ctxTimeout = document.getElementById('ctx-timeout');
    const pmBtnTimeout = document.getElementById('pm-btn-timeout');
    if(ctxTimeout) ctxTimeout.addEventListener('click', timeoutLogic);
    if(pmBtnTimeout) pmBtnTimeout.addEventListener('click', timeoutLogic);
    
    const banLogic = async () => {
        if(ctxTargetUid && confirm(`Willst du ${ctxTargetName} bannen?`)) {
            await updateDoc(doc(db, "users", currentUser.uid), { blockedUsers: arrayUnion(ctxTargetUid) });
            sysToast("Gebannt!");
            if(modal) modal.classList.remove('show');
            menu.classList.remove('active');
        }
    };
    const ctxBan = document.getElementById('ctx-ban');
    const pmBtnBan = document.getElementById('pm-btn-ban');
    if(ctxBan) ctxBan.addEventListener('click', banLogic);
    if(pmBtnBan) pmBtnBan.addEventListener('click', banLogic);

    const modLogic = async () => {
        if(ctxTargetUid && isLive) {
            const isMod = modsList.includes(ctxTargetUid);
            if(isMod) {
                await deleteDoc(doc(db, `live_streams/${currentUser.uid}/mods`, ctxTargetUid));
                sysToast(`Mod-Rechte von ${ctxTargetName} entfernt.`);
            } else {
                await setDoc(doc(db, `live_streams/${currentUser.uid}/mods`, ctxTargetUid), { uid: ctxTargetUid });
                sysToast(`${ctxTargetName} ist nun Mod!`);
            }
            if(modal) modal.classList.remove('show');
            menu.classList.remove('active');
        }
    };
    const ctxMod = document.getElementById('ctx-mod');
    const pmBtnMod = document.getElementById('pm-btn-mod');
    if(ctxMod) ctxMod.addEventListener('click', modLogic);
    if(pmBtnMod) pmBtnMod.addEventListener('click', modLogic);
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

// --- TIKTOK GIFTS ANIMATION IM STUDIO ---
function setupGifts() {
    let currentCoins = 0;
    onSnapshot(collection(db, `live_streams/${currentUser.uid}/gifts`), snap => {
        snap.docChanges().forEach(change => {
            if(change.type === 'added') {
                const g = change.doc.data();
                currentCoins += g.price;
                const statCoins = document.getElementById('stat-coins');
                if(statCoins) statCoins.innerText = currentCoins;
                
                const animZone = document.getElementById('gift-overlay-zone');
                if(animZone) {
                    const el = document.createElement('div');
                    el.className = 'gift-overlay';
                    el.innerHTML = `<span>${g.emoji}</span><strong>${g.name} hat ${g.giftName} gesendet!</strong>`;
                    animZone.appendChild(el);
                    setTimeout(() => el.remove(), 3000);
                }
            }
        });
    });
}

// --- TWITCH CHAT SCROLL PHYSICS ---
let isChatPaused = false;

function setupListeners() {
    const chatContainer = document.getElementById('studio-chat');
    const scroller = document.getElementById('chat-scroller');
    const pauseBanner = document.getElementById('chat-paused-banner');

    if(!chatContainer || !scroller) return;

    const stringToColor = (str) => {
        const colors = ['#FF453A', '#0A84FF', '#32D74B', '#FF9F0A', '#BF5AF2', '#FF375F', '#5E5CE6', '#FFD60A'];
        let hash = 0; for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    scroller.addEventListener('scroll', () => {
        const isAtBottom = scroller.scrollHeight - scroller.scrollTop <= scroller.clientHeight + 20;
        if (!isAtBottom && !isChatPaused) {
            isChatPaused = true;
            if(pauseBanner) pauseBanner.style.display = 'flex';
        } else if (isAtBottom && isChatPaused) {
            isChatPaused = false;
            if(pauseBanner) pauseBanner.style.display = 'none';
        }
    });

    window.resumeChatScroll = () => {
        isChatPaused = false;
        if(pauseBanner) pauseBanner.style.display = 'none';
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
            const statViewers = document.getElementById('stat-viewers');
            if(statViewers) statViewers.innerText = data.viewers || 0;
            
            if(data.pinnedMessage) {
                const pinnedText = document.getElementById('pinned-text');
                const pinnedBar = document.getElementById('pinned-msg-bar');
                if(pinnedText) pinnedText.innerText = data.pinnedMessage;
                if(pinnedBar) pinnedBar.style.display = 'flex';
            }
        }
    });
}