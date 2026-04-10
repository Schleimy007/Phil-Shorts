import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, orderBy, addDoc, limit, arrayUnion, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = { 
    apiKey: "AIzaSyAF-QW_MtVBkImqh1gXwhKrc2pLLCAe3Ek", authDomain: "phil-shorts.firebaseapp.com", 
    projectId: "phil-shorts", storageBucket: "phil-shorts.firebasestorage.app", 
    messagingSenderId: "785802511451", appId: "1:785802511451:web:c7aabd40a4a8ea89616b7e"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentUser = JSON.parse(localStorage.getItem('phil_session'));
let peer = null;
let isLive = false;
let startTime = null;
let durationInterval = null;
let activeCalls = [];
let modsList = [];

// === AUDIO & VIDEO ENGINE PRO ===
let audioCtx;
let audioDestination;
let micSource;
let screenAudioSource;
let analyser;

let localVideoTrack = null;
let localScreenTrack = null;
let localAudioTrack = null;
let finalStream; 

let mode = 'cam'; 
let isPiPMode = false;
let animationFrameId;

const canvas = document.getElementById('composite-canvas');
const ctx = canvas.getContext('2d');
const previewVideo = document.getElementById('studio-preview');
const facecamVideo = document.getElementById('facecam-video');
const facecamOverlay = document.getElementById('facecam-container');

// Facecam Position & Größe (relativ zum Canvas, 0-1)
let fcState = { x: 0.75, y: 0.05, width: 0.23 }; 

// --- DRAG & DROP FÜR FACECAM OVERLAY ---
let isDragging = false;
let startX, startY, initialLeft, initialTop;

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
};

async function initBaseCamera() {
    try {
        // 🔥 PERFORMANCE FIX: Kamera zwingend auf max. 30 FPS limitieren
        const camStream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, 
            audio: true 
        });
        localVideoTrack = camStream.getVideoTracks()[0];
        localAudioTrack = camStream.getAudioTracks()[0];

        facecamVideo.srcObject = new MediaStream([localVideoTrack]);
        previewVideo.srcObject = new MediaStream([localVideoTrack]);
        previewVideo.style.transform = 'scaleX(-1)';
        
        await populateMics();
    } catch(e) {
        sysToast("Kamera-Berechtigung fehlt.");
    }
}

async function populateMics() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        const select = document.getElementById('mic-select');
        select.innerHTML = audioInputs.map(d => `<option value="${d.deviceId}">${d.label || 'Mikrofon ' + (select.length + 1)}</option>`).join('');
        
        select.onchange = async () => {
            const deviceId = select.value;
            // 🔥 PERFORMANCE FIX: Auch hier auf 30 FPS limitieren
            const newCamStream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, 
                audio: { deviceId: { exact: deviceId } } 
            });
            
            localAudioTrack = newCamStream.getAudioTracks()[0];
            localVideoTrack = newCamStream.getVideoTracks()[0];

            facecamVideo.srcObject = new MediaStream([localVideoTrack]);
            if(mode === 'cam') previewVideo.srcObject = new MediaStream([localVideoTrack]);
            
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

function initAudioMixer() {
    if(audioCtx) return;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioDestination = audioCtx.createMediaStreamDestination();

    for(let key in sfx) {
        sfx[key].crossOrigin = "anonymous";
        let sfxSource = audioCtx.createMediaElementSource(sfx[key]);
        sfxSource.connect(audioDestination); 
        sfxSource.connect(audioCtx.destination); 
    }

    micSource = audioCtx.createMediaStreamSource(new MediaStream([localAudioTrack]));
    micSource.connect(audioDestination);

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.85; 
    micSource.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const micBar = document.getElementById('mic-level');

    // 🔥 PERFORMANCE FIX: Die Audio-Pegel Animation CPU-schonend auf ~20 FPS drosseln
    let lastVisTime = 0;
    function drawVisualizer(now) {
        requestAnimationFrame(drawVisualizer);
        if (now - lastVisTime < 50) return; // Überspringt Frame, wenn weniger als 50ms vergangen sind
        lastVisTime = now;

        if(!localAudioTrack.enabled) { micBar.style.width = '0%'; return; }
        analyser.getByteFrequencyData(dataArray);
        let sum = 0; for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        let avg = sum / dataArray.length;
        let percent = Math.min(100, (avg / 100) * 100);
        micBar.style.width = percent + '%';
    }
    requestAnimationFrame(drawVisualizer);

    const canvasStream = canvas.captureStream(30); 
    finalStream = new MediaStream([canvasStream.getVideoTracks()[0], audioDestination.stream.getAudioTracks()[0]]);
    
    startCompositor();
}


// === COMPOSITING (Der Video-Mixer für die Zuschauer) ===
function startCompositor() {
    let lastRenderTime = 0;
    const fpsInterval = 1000 / 30; // 🔥 PERFORMANCE FIX: Strikte 30 FPS Bremse! Verhindert 144Hz-Lags.

    function render(now) {
        animationFrameId = requestAnimationFrame(render);
        
        // Prüfen, ob es schon Zeit für das nächste 30fps Frame ist (CPU schonen!)
        const elapsed = now - lastRenderTime;
        if (elapsed < fpsInterval) return;
        lastRenderTime = now - (elapsed % fpsInterval);

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (isPiPMode) {
            if (localScreenTrack) ctx.drawImage(previewVideo, 0, 0, canvas.width, canvas.height);
            
            if (localVideoTrack) {
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
            }
        }
    }
    requestAnimationFrame(render);
}

// --- SZENENSTEUERUNG ---
window.switchScene = async (type) => {
    document.querySelectorAll('.source-btn').forEach(c => c.classList.remove('active'));
    document.querySelector(`[data-scene="${type}"]`).classList.add('active');
    
    isPiPMode = false;
    facecamOverlay.style.display = 'none';
    
    initAudioMixer();

    try {
        if (type === 'screen' || type === 'pip') {
            if (!localScreenTrack) {
                // 🔥 PERFORMANCE FIX: Screen-Capture framerate begrenzen
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
                    video: { frameRate: { ideal: 30, max: 30 } }, 
                    audio: true 
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
                facecamOverlay.style.display = 'block';
            }
        } else {
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
    document.getElementById('studio-chat-input').addEventListener('keypress', (e) => {
        if(e.key === 'Enter') window.sendHostMessage();
    });

    document.getElementById('stream-title').addEventListener('change', async (e) => {
        if(isLive) {
            await updateDoc(doc(db, "live_streams", currentUser.uid), { title: e.target.value });
            sysToast("Stream-Titel aktualisiert!");
        }
    });

    document.getElementById('pc-volume-slider').addEventListener('input', (e) => {
        previewVideo.volume = e.target.value;
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

// --- ADMIN TOOLS ---
window.clearChat = async () => {
    if(!confirm("Gesamten Chat löschen?")) return;
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

window.updateLiveGoal = async () => {
    const goalTarget = parseInt(document.getElementById('goal-target').value) || 0;
    const goalDesc = document.getElementById('goal-desc').value || "Ziel";
    if(isLive) {
        await updateDoc(doc(db, "live_streams", currentUser.uid), { goalTarget: goalTarget, goalDesc: goalDesc });
        sysToast("Live Ziel wurde an Zuschauer gesendet!");
    } else {
        sysToast("Wird beim Streamstart übernommen.");
    }
};

// --- GO LIVE LOGIK ---
document.getElementById('master-live-btn').addEventListener('click', () => {
    if(!isLive) startStream(); else stopStream();
});

async function startStream() {
    initAudioMixer(); 
    if(audioCtx.state === 'suspended') await audioCtx.resume(); 

    const q = query(collection(db, `live_streams/${currentUser.uid}/chat`));
    const snaps = await getDocs(q);
    snaps.forEach(d => deleteDoc(d.ref));

    isLive = true;
    startTime = Date.now();
    const btn = document.getElementById('master-live-btn');
    btn.innerHTML = "STREAM BEENDEN";
    btn.classList.add('danger');
    
    const ind = document.getElementById('live-indicator');
    ind.style.display = 'block';

    const title = document.getElementById('stream-title').value || "Live Stream";
    const goalTarget = parseInt(document.getElementById('goal-target').value) || 0;
    const goalDesc = document.getElementById('goal-desc').value || "";

    if(peer) peer.destroy(); 
    
    peer = new Peer(currentUser.uid, { config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] }});
    
    peer.on('open', async () => {
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
    });

    peer.on('connection', (conn) => {
        conn.on('open', () => {
            const call = peer.call(conn.peer, finalStream);
            activeCalls.push(call);
            call.on('close', () => { activeCalls = activeCalls.filter(c => c !== call); });
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
    btn.innerHTML = "STREAM STARTEN";
    btn.classList.remove('danger');
    document.getElementById('live-indicator').style.display = 'none';
    
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
            
            const isMe = (ctxTargetUid === currentUser.uid);
            const isMod = modsList.includes(ctxTargetUid);

            document.getElementById('ctx-delete').style.display = isMe ? 'none' : 'flex';
            document.getElementById('ctx-ban').style.display = isMe ? 'none' : 'flex';
            document.getElementById('ctx-timeout').style.display = isMe ? 'none' : 'flex';
            document.getElementById('ctx-mod').style.display = isMe ? 'none' : 'flex';

            if(!isMe) {
                document.getElementById('ctx-mod').innerHTML = isMod ? '<i class="fas fa-user-minus"></i> Mod-Status entfernen' : '<i class="fas fa-shield-alt"></i> Moderator machen';
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
        document.getElementById('pm-role').innerText = ctxTargetUid === currentUser.uid ? "Broadcaster" : (modsList.includes(ctxTargetUid) ? "Moderator" : "Zuschauer");
        
        const isMe = (ctxTargetUid === currentUser.uid);
        document.getElementById('pm-btn-mod').style.display = isMe ? 'none' : 'flex';
        document.getElementById('pm-btn-timeout').style.display = isMe ? 'none' : 'flex';
        document.getElementById('pm-btn-ban').style.display = isMe ? 'none' : 'flex';

        if(!isMe) {
            document.getElementById('pm-btn-mod').innerHTML = modsList.includes(ctxTargetUid) ? '<i class="fas fa-user-minus"></i> Als Mod entfernen' : '<i class="fas fa-shield-alt" style="color:#10b981"></i> Als Mod ernennen';
        }

        modal.classList.add('show');
    }

    document.getElementById('ctx-pin').addEventListener('click', () => { window.pinMessage(ctxTargetText); menu.classList.remove('active'); });
    document.getElementById('ctx-whisper').addEventListener('click', () => { window.open(`index.html?dm=${ctxTargetUid}`, '_blank'); menu.classList.remove('active'); });
    
    document.getElementById('ctx-delete').addEventListener('click', async () => {
        if(ctxTargetMsgId && isLive) { 
            await deleteDoc(doc(db, `live_streams/${currentUser.uid}/chat`, ctxTargetMsgId)); 
            sysToast("Nachricht entfernt"); 
        }
    });

    const timeoutLogic = async () => {
        if(ctxTargetUid && isLive) {
            let mins = prompt(`Wie viele Minuten Timeout für ${ctxTargetName}?`, "5");
            if(mins && !isNaN(mins)) {
                await setDoc(doc(db, `live_streams/${currentUser.uid}/timeouts`, ctxTargetUid), { expire: Date.now() + (parseInt(mins) * 60000) });
                sysToast(`${ctxTargetName} hat ${mins}m Timeout.`);
                menu.classList.remove('active');
                modal.classList.remove('show');
            }
        }
    };
    document.getElementById('ctx-timeout').addEventListener('click', timeoutLogic);
    document.getElementById('pm-btn-timeout').addEventListener('click', timeoutLogic);
    
    const banLogic = async () => {
        if(ctxTargetUid && confirm(`Willst du ${ctxTargetName} bannen?`)) {
            await updateDoc(doc(db, "users", currentUser.uid), { blockedUsers: arrayUnion(ctxTargetUid) });
            sysToast("Gebannt!");
            modal.classList.remove('show');
            menu.classList.remove('active');
        }
    };
    document.getElementById('ctx-ban').addEventListener('click', banLogic);
    document.getElementById('pm-btn-ban').addEventListener('click', banLogic);

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
            modal.classList.remove('show');
            menu.classList.remove('active');
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

// --- TIKTOK GIFTS ANIMATION IM STUDIO ---
function setupGifts() {
    let currentCoins = 0;
    onSnapshot(collection(db, `live_streams/${currentUser.uid}/gifts`), snap => {
        snap.docChanges().forEach(change => {
            if(change.type === 'added') {
                const g = change.doc.data();
                currentCoins += g.price;
                document.getElementById('stat-coins').innerText = currentCoins;
                
                const animZone = document.getElementById('gift-overlay-zone');
                const el = document.createElement('div');
                el.className = 'gift-overlay';
                el.innerHTML = `<span>${g.emoji}</span><strong>${g.name} hat ${g.giftName} gesendet!</strong>`;
                animZone.appendChild(el);
                setTimeout(() => el.remove(), 3000);
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

    const stringToColor = (str) => {
        const colors = ['#FF453A', '#0A84FF', '#32D74B', '#FF9F0A', '#BF5AF2', '#FF375F', '#5E5CE6', '#FFD60A'];
        let hash = 0; for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    scroller.addEventListener('scroll', () => {
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
        
        if(!isChatPaused) scroller.scrollTop = scroller.scrollHeight;
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