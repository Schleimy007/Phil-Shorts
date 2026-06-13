// ==========================================
// js/stream.js - LiveKit Stream & Mod Panel
// ==========================================

if (!document.getElementById('premium-live-styles')) {
    const style = document.createElement('style');
    style.id = 'premium-live-styles';
    style.innerHTML = `
        .ultra-live-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
        .premium-live-card { background: #111; border-radius: 16px; overflow: hidden; cursor: pointer; position: relative; border: 1px solid rgba(255,255,255,0.05); transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .premium-live-card:hover { transform: translateY(-5px) scale(1.02); border-color: #00f2fe; box-shadow: 0 15px 40px rgba(0, 242, 254, 0.2); }
        .card-thumbnail { position: relative; height: 280px; width: 100%; overflow: hidden; background: #000; display: flex; align-items: center; justify-content: center; }
        .thumb-bg { position: absolute; width: 100%; height: 100%; background-size: cover; background-position: center; filter: blur(20px) brightness(0.5); transform: scale(1.2); }
        .card-thumbnail img { position: relative; z-index: 1; height: 100%; width: 100%; object-fit: cover; }
        .live-badge-glow { position: absolute; top: 12px; left: 12px; background: rgba(255, 0, 80, 0.9); backdrop-filter: blur(10px); color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 800; letter-spacing: 1px; z-index: 2; display: flex; align-items: center; gap: 6px; box-shadow: 0 0 15px rgba(255,0,80,0.6); }
        .live-badge-glow i { animation: pulseLive 2s infinite; }
        .viewer-count { position: absolute; top: 12px; right: 12px; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(10px); color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; z-index: 2; border: 1px solid rgba(255,255,255,0.1); }
        .play-overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 40px; color: rgba(255,255,255,0.8); z-index: 2; opacity: 0; transition: 0.2s; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.5)); }
        .premium-live-card:hover .play-overlay { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
        .card-info { padding: 15px; background: linear-gradient(to top, rgba(10,10,10,1) 0%, rgba(20,20,20,0.8) 100%); position: absolute; bottom: 0; left: 0; width: 100%; z-index: 3; display: flex; gap: 12px; align-items: center; backdrop-filter: blur(10px); border-top: 1px solid rgba(255,255,255,0.05); }
        .card-info .avatar { width: 40px; height: 40px; border-radius: 50%; border: 2px solid #00f2fe; object-fit: cover; }
        .card-info .text-info { flex: 1; min-width: 0; }
        .card-info h4 { margin: 0; font-size: 14px; font-weight: 700; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 2px 4px rgba(0,0,0,0.8); }
        .card-info span { font-size: 12px; color: #aaa; font-weight: 500; }
    `;
    document.head.appendChild(style);
}

window.generateLiveKitToken = async function(roomName, participantName, isBroadcaster = false) {
    const apiKey = "APIabumFsfYCfwJ"; 
    const apiSecret = "vh0kN1T3RwCahxLF520Zy00geWxeRbnWGmofgvb3woGA";
    const header = { alg: "HS256", typ: "JWT" };
    const payload = {
        iss: apiKey, sub: participantName,
        nbf: Math.floor(Date.now() / 1000) - 5, exp: Math.floor(Date.now() / 1000) + (6 * 60 * 60),
        video: { roomJoin: true, room: roomName, canPublish: isBroadcaster, canPublishData: isBroadcaster, canSubscribe: true, hidden: false }
    };
    const base64UrlEncode = (obj) => { const str = unescape(encodeURIComponent(JSON.stringify(obj))); return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); };
    const encodedHeader = base64UrlEncode(header); const encodedPayload = base64UrlEncode(payload); const unsignedToken = `${encodedHeader}.${encodedPayload}`;

    try {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey("raw", encoder.encode(apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(unsignedToken));
        const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        return `${unsignedToken}.${encodedSignature}`;
    } catch(e) { window.showCustomAlert("Verbindungsfehler", "LiveKit Token konnte nicht erstellt werden."); throw e; }
};

window.LiveManager = {
    unsubscribe: null,
    init: function() {
        const grid = document.getElementById('live-streams-grid');
        if(!grid) return;
        if (this.unsubscribe) this.unsubscribe();
        this.unsubscribe = window.fs.onSnapshot(window.fs.collection(window.db, "live_streams"), (snapshot) => {
            grid.innerHTML = '';
            if (snapshot.empty) {
                grid.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height: 60vh; text-align: center;"><div style="width: 80px; height: 80px; border-radius: 50%; background: #111; display:flex; align-items:center; justify-content:center; margin-bottom: 20px; box-shadow: inset 0 0 20px rgba(0,0,0,0.8); border: 1px solid #222;"><i class="fas fa-video-slash" style="font-size: 30px; color: #444;"></i></div><h3 style="color: white; margin-bottom: 8px;">Niemand ist live</h3><p style="font-size: 14px; color: #888;">Die Creator schlafen wahrscheinlich gerade. Zzz...</p></div>`; return;
            }
            let html = '<div class="ultra-live-grid">';
            snapshot.forEach(docSnap => {
                const stream = docSnap.data();
                html += `<div class="premium-live-card" onclick="window.joinLiveStream('${docSnap.id}')"><div class="card-thumbnail"><div class="thumb-bg" style="background-image: url('${stream.broadcasterPic}')"></div><img src="${stream.broadcasterPic}"><div class="live-badge-glow"><i class="fas fa-circle" style="font-size:8px;"></i> LIVE</div><div class="viewer-count"><i class="fas fa-eye"></i> ${stream.viewers || 0}</div><i class="fas fa-play-circle play-overlay"></i><div class="card-info"><img src="${stream.broadcasterPic}" class="avatar"><div class="text-info"><h4>${stream.title || 'Live Stream'}</h4><span>@${stream.broadcasterName}</span></div></div></div></div>`;
            });
            html += '</div>';
            grid.innerHTML = html;
        });
    }
};

window.currentRoom = null;
window.currentLiveStreamId = null;
window.currentLiveStreamerUid = null;
window.liveRoomUnsubscribes = [];
window.currentLiveMods = [];

window.joinLiveStream = async function(streamId) {
    if(!window.currentUser) return window.showToast("Bitte erst einloggen!");
    window.currentLiveStreamId = streamId;
    window.switchView('live-room');
    
    const videoEl = document.getElementById('live-video-player');
    const offlineText = document.getElementById('live-stream-offline-text');
    
    if(videoEl) {
        videoEl.srcObject = null;
        const volSlider = document.getElementById('live-pc-volume');
        if(volSlider) {
            videoEl.volume = volSlider.value;
            volSlider.oninput = (e) => {
                videoEl.volume = e.target.value;
                const icon = document.getElementById('live-vol-icon');
                if(icon) { if(e.target.value == 0) icon.className = 'fas fa-volume-mute'; else if(e.target.value < 0.5) icon.className = 'fas fa-volume-down'; else icon.className = 'fas fa-volume-up'; }
            };
        }
    }

    if(offlineText) {
        offlineText.style.display = 'flex';
        offlineText.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="font-size:40px; color:#00f2fe; margin-bottom:10px;"></i><span>Verbinde mit Live-Server...</span>';
    }
    
    const streamSnap = await window.fs.getDoc(window.fs.doc(window.db, "live_streams", streamId));
    if(!streamSnap.exists()) { window.showToast("Stream ist offline."); window.leaveLiveRoom(); return; }
    const streamData = streamSnap.data();
    window.currentLiveStreamerUid = streamData.broadcasterUid;
    
    if(document.getElementById('live-broadcaster-pic')) document.getElementById('live-broadcaster-pic').src = streamData.broadcasterPic || 'https://i.imgur.com/JDPRzCc.png';
    if(document.getElementById('live-broadcaster-name')) document.getElementById('live-broadcaster-name').innerText = streamData.broadcasterName || 'Creator';
    
    await window.fs.updateDoc(window.fs.doc(window.db, "live_streams", streamId), { viewers: window.fs.increment(1) }).catch(()=>{});
    
    if(window.currentRoom) window.currentRoom.disconnect();
    
    const livekitUrl = "wss://phil-shorts-cv9pfxjq.livekit.cloud"; 
    
    try {
        const uniqueViewerId = window.currentUser.uid + "_" + Math.floor(Math.random() * 100000);
        const token = await window.generateLiveKitToken(streamId, uniqueViewerId, false);
        window.currentRoom = new LivekitClient.Room({ adaptiveStream: false, dynacast: false });

        window.currentRoom.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if(offlineText) offlineText.style.display = 'none';
            if (track.kind === 'audio') { track.attach(videoEl); } 
            else if (track.kind === 'video') {
                if (publication.source === LivekitClient.Track.Source.ScreenShare) { track.attach(videoEl); } 
                else if (publication.source === LivekitClient.Track.Source.Camera) {
                    let camEl = document.getElementById('viewer-pip-cam');
                    if(!camEl) {
                        camEl = document.createElement('video'); camEl.id = 'viewer-pip-cam';
                        camEl.style.cssText = "position:absolute; top:20px; right:20px; width:110px; aspect-ratio:9/16; object-fit:cover; border-radius:12px; border:2px solid #00f2fe; z-index:100; box-shadow:0 10px 30px rgba(0,0,0,0.5); transform: scaleX(-1);";
                        document.querySelector('.lr-video-col').appendChild(camEl);
                    }
                    camEl.style.display = 'block'; track.attach(camEl);
                } else { track.attach(videoEl); }
            }
            const unmuteOverlay = document.getElementById('live-unmute-overlay');
            if(unmuteOverlay) { unmuteOverlay.style.display = 'flex'; unmuteOverlay.onclick = () => { videoEl.muted = false; unmuteOverlay.style.display = 'none'; }; }
        });

        window.currentRoom.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track, publication) => {
            track.detach();
            if (publication.source === LivekitClient.Track.Source.Camera) { const camEl = document.getElementById('viewer-pip-cam'); if(camEl) camEl.remove(); }
        });

        window.currentRoom.on(LivekitClient.RoomEvent.Disconnected, () => {
            if(offlineText) { offlineText.style.display = 'flex'; offlineText.innerHTML = '<i class="fas fa-broadcast-tower" style="font-size:40px; color:#ff4444; margin-bottom:10px;"></i><span>Stream beendet</span>'; }
            const camEl = document.getElementById('viewer-pip-cam'); if(camEl) camEl.remove();
        });

        await window.currentRoom.connect(livekitUrl, token);
    } catch (error) {
        if(offlineText) offlineText.innerHTML = '<i class="fas fa-exclamation-triangle" style="font-size:40px; color:#ff4444; margin-bottom:10px;"></i><span style="color:#ff4444;">Live-Server Fehler</span>';
        window.showCustomAlert("Verbindungsfehler", "Konnte nicht mit dem Live-Server verbinden.");
    }
    
    window.initLiveRoomListeners(streamId);
};

window.leaveLiveRoom = async function() {
    if(window.currentLiveStreamId && window.currentUser) await window.fs.updateDoc(window.fs.doc(window.db, "live_streams", window.currentLiveStreamId), { viewers: window.fs.increment(-1) }).catch(()=>{});
    if(window.currentRoom) { window.currentRoom.disconnect(); window.currentRoom = null; }
    const videoEl = document.getElementById('live-video-player'); if(videoEl) { videoEl.pause(); videoEl.srcObject = null; }
    if(window.liveRoomUnsubscribes) { window.liveRoomUnsubscribes.forEach(unsub => unsub()); window.liveRoomUnsubscribes = []; }
    window.currentLiveStreamId = null;
    window.switchView('live-list');
};

window.ctxTargetUid = null;
window.ctxTargetMsgId = null;
window.ctxTargetName = null;
window.ctxTargetText = null;

window.initLiveRoomListeners = function(streamId) {
    if(window.liveRoomUnsubscribes) window.liveRoomUnsubscribes.forEach(unsub => unsub());
    window.liveRoomUnsubscribes = [];
    
    const chatBox = document.getElementById('live-chat-box');
    if(chatBox) chatBox.innerHTML = '';
    
    const modUnsub = window.fs.onSnapshot(window.fs.collection(window.db, `live_streams/${streamId}/mods`), snap => { window.currentLiveMods = snap.docs.map(d => d.id); });
    window.liveRoomUnsubscribes.push(modUnsub);

    let timedOutUsers = {};
    const timeoutUnsub = window.fs.onSnapshot(window.fs.collection(window.db, `live_streams/${streamId}/timeouts`), snap => { snap.docs.forEach(d => { timedOutUsers[d.id] = d.data().expire; }); });
    window.liveRoomUnsubscribes.push(timeoutUnsub);
    
    const chatUnsub = window.fs.onSnapshot(window.fs.query(window.fs.collection(window.db, `live_streams/${streamId}/chat`), window.fs.orderBy("timestamp", "desc"), window.fs.limit(50)), snap => {
        if(!chatBox) return; chatBox.innerHTML = '';
        const amIHost = window.currentUser.uid === streamId; const amIMod = window.currentLiveMods.includes(window.currentUser.uid); const amIAppAdmin = window.currentUser.isAdmin || window.currentUser.email === "schleimyverteilung@gmail.com"; const hasModPower = amIHost || amIMod || amIAppAdmin;

        snap.forEach(d => {
            const m = d.data();
            if(timedOutUsers[m.uid] && timedOutUsers[m.uid] > Date.now()) return;
            const isHost = m.uid === streamId; const isMod = window.currentLiveMods.includes(m.uid);
            let badge = '';
            if(isHost) badge = '<span class="chat-badge badge-host">HOST</span>';
            else if(m.uid === "schleimyverteilung@gmail.com" || m.isAdmin) badge = '<span class="chat-badge badge-admin">ADMIN</span>';
            else if(isMod) badge = '<span class="chat-badge badge-mod">MOD</span>';
            
            const canManageMsg = hasModPower || m.uid === window.currentUser.uid;
            const safeText = m.text ? m.text.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
            const safeName = m.name ? m.name.replace(/'/g, "\\'") : 'User';
            const clickInt = canManageMsg ? `oncontextmenu="window.openLiveCtxMenu(event, '${m.uid}', '${d.id}', '${safeName}', '${safeText}')" onclick="window.openLiveCtxMenu(event, '${m.uid}', '${d.id}', '${safeName}', '${safeText}')"` : '';

            chatBox.innerHTML += `<div class="lr-chat-msg" ${clickInt} style="cursor:${canManageMsg ? 'pointer' : 'default'}">${badge}<strong>${m.name}</strong><span>:</span> <span style="color:#efeff1;">${m.text}</span></div>`;
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
    window.liveRoomUnsubscribes.push(chatUnsub);

    const streamDocUnsub = window.fs.onSnapshot(window.fs.doc(window.db, "live_streams", streamId), (docSnap) => {
        if(docSnap.exists()) {
            const data = docSnap.data();
            if (data.bannedUsers && data.bannedUsers.includes(window.currentUser.uid)) { window.leaveLiveRoom(); window.showCustomAlert("Gebannt", "Du wurdest aus diesem Stream gebannt."); }
            if (data.pinnedMessage) { document.getElementById('live-pinned-msg-bar').style.display = 'block'; document.getElementById('live-pinned-text').innerText = data.pinnedMessage; let isModOrHostPanel = (window.currentLiveStreamerUid === window.currentUser.uid) || window.currentLiveMods.includes(window.currentUser.uid); document.getElementById('live-unpin-btn').style.display = isModOrHostPanel ? 'block' : 'none'; } else { document.getElementById('live-pinned-msg-bar').style.display = 'none'; }
            let isModOrHostPanel = (window.currentLiveStreamerUid === window.currentUser.uid) || window.currentLiveMods.includes(window.currentUser.uid); document.getElementById('live-mod-panel-btn').style.display = isModOrHostPanel ? 'flex' : 'none';
            if (window.currentUser.isAdmin) { document.getElementById('admin-force-offline-btn').style.display = 'flex'; document.getElementById('admin-revoke-license-btn').style.display = 'flex'; }
            if (data.goalTarget && data.goalTarget > 0) { document.getElementById('live-goal-container').style.display = 'block'; document.getElementById('live-goal-desc').innerText = data.goalDesc || 'Ziel'; document.getElementById('live-goal-target').innerText = data.goalTarget; document.getElementById('live-goal-current').innerText = data.goalCurrent || 0; let pct = Math.min(100, ((data.goalCurrent || 0) / data.goalTarget) * 100); document.getElementById('live-goal-progress').style.width = pct + '%'; } else { document.getElementById('live-goal-container').style.display = 'none'; }
            const followerToggle = document.getElementById('mod-follower-only-toggle'); const slowToggle = document.getElementById('mod-slow-mode-toggle'); const lockToggle = document.getElementById('mod-lock-chat-toggle');
            if(followerToggle) followerToggle.checked = data.followerOnly || false; if(slowToggle) slowToggle.checked = data.slowMode || false; if(lockToggle) lockToggle.checked = data.chatLocked || false;
            window.currentStreamSettings = { followerOnly: data.followerOnly || false, slowMode: data.slowMode || false, chatLocked: data.chatLocked || false };
        }
    });
    window.liveRoomUnsubscribes.push(streamDocUnsub);
};

window.openLiveCtxMenu = function(e, uid, msgId, name, text) {
    e.preventDefault(); window.ctxTargetUid = uid; window.ctxTargetMsgId = msgId; window.ctxTargetName = name; window.ctxTargetText = text;
    const menu = document.getElementById('live-ctx-menu'); if(!menu) return;
    const amIHost = window.currentUser.uid === window.currentLiveStreamId; const amIMod = window.currentLiveMods.includes(window.currentUser.uid); const amIAppAdmin = window.currentUser.isAdmin || window.currentUser.email === "schleimyverteilung@gmail.com"; const hasModPower = amIHost || amIMod || amIAppAdmin;
    const targetIsHost = uid === window.currentLiveStreamId; const targetIsMod = window.currentLiveMods.includes(uid); const isMe = uid === window.currentUser.uid;

    document.getElementById('lctx-whisper').style.display = isMe ? 'none' : 'flex';
    document.getElementById('lctx-delete').style.display = 'none'; document.getElementById('lctx-ban').style.display = 'none'; document.getElementById('lctx-timeout').style.display = 'none'; document.getElementById('lctx-mod').style.display = 'none';
    if(document.getElementById('lctx-pin')) document.getElementById('lctx-pin').style.display = hasModPower ? 'flex' : 'none';
    if (isMe || (hasModPower && !targetIsHost)) document.getElementById('lctx-delete').style.display = 'flex';
    if (hasModPower && !targetIsHost && !isMe) { document.getElementById('lctx-ban').style.display = 'flex'; document.getElementById('lctx-timeout').style.display = 'flex'; }
    if ((amIHost || amIAppAdmin) && !targetIsHost && !isMe) { document.getElementById('lctx-mod').style.display = 'flex'; document.getElementById('lctx-mod').innerHTML = targetIsMod ? '<i class="fas fa-user-minus" style="color:#ff4444;"></i> Mod-Status entfernen' : '<i class="fas fa-shield-alt"></i> Moderator machen'; }

    let x = e.clientX; let y = e.clientY;
    if (x + 200 > window.innerWidth) x = window.innerWidth - 210;
    if (y + 250 > window.innerHeight) y = window.innerHeight - 260;
    menu.style.left = `${x}px`; menu.style.top = `${y}px`; menu.classList.add('active');
};

document.addEventListener('click', (e) => { const menu = document.getElementById('live-ctx-menu'); if(menu && !e.target.closest('.live-ctx-menu')) menu.classList.remove('active'); });

document.getElementById('lctx-pin')?.addEventListener('click', async () => { if(window.ctxTargetText && (window.currentLiveStreamerUid || window.currentLiveStreamId)) { await window.fs.updateDoc(window.fs.doc(window.db, "live_streams", window.currentLiveStreamerUid || window.currentLiveStreamId), { pinnedMessage: window.ctxTargetText }); document.getElementById('live-ctx-menu').classList.remove('active'); window.showToast("Nachricht angeheftet!"); } });
window.unpinLiveMessage = async function() { if(window.currentLiveStreamerUid || window.currentLiveStreamId) { await window.fs.updateDoc(window.fs.doc(window.db, "live_streams", window.currentLiveStreamerUid || window.currentLiveStreamId), { pinnedMessage: null }); } };
document.getElementById('lctx-whisper')?.addEventListener('click', () => { if(window.ctxTargetUid) { window.openDM(window.ctxTargetUid, window.ctxTargetName, 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + window.ctxTargetUid); document.getElementById('live-ctx-menu').classList.remove('active'); window.switchView('dm'); } });
document.getElementById('lctx-delete')?.addEventListener('click', async () => { if(window.ctxTargetMsgId && window.currentLiveStreamId) { await window.fs.deleteDoc(window.fs.doc(window.db, `live_streams/${window.currentLiveStreamId}/chat`, window.ctxTargetMsgId)); window.showToast("Nachricht gelöscht"); document.getElementById('live-ctx-menu').classList.remove('active'); } });
document.getElementById('lctx-timeout')?.addEventListener('click', async () => { if(window.ctxTargetUid && window.currentLiveStreamId) { let mins = prompt(`Wie viele Minuten Timeout für ${window.ctxTargetName}?`, "5"); if(mins && !isNaN(mins)) { await window.fs.setDoc(window.fs.doc(window.db, `live_streams/${window.currentLiveStreamId}/timeouts`, window.ctxTargetUid), { expire: Date.now() + (parseInt(mins) * 60000) }); window.showToast(`${window.ctxTargetName} hat ${mins}m Timeout.`); document.getElementById('live-ctx-menu').classList.remove('active'); } } });
document.getElementById('lctx-ban')?.addEventListener('click', async () => { if(window.ctxTargetUid && confirm(`Willst du ${window.ctxTargetName} wirklich aus dem Stream bannen?`)) { await window.fs.updateDoc(window.fs.doc(window.db, "live_streams", window.currentLiveStreamId), { bannedUsers: window.fs.arrayUnion(window.ctxTargetUid) }); await window.fs.updateDoc(window.fs.doc(window.db, "users", window.currentLiveStreamId), { blockedUsers: window.fs.arrayUnion(window.ctxTargetUid) }); window.showToast("User gebannt & gekickt!"); document.getElementById('live-ctx-menu').classList.remove('active'); } });
document.getElementById('lctx-mod')?.addEventListener('click', async () => { if(window.ctxTargetUid && window.currentLiveStreamId) { const targetIsMod = window.currentLiveMods.includes(window.ctxTargetUid); if(targetIsMod) { await window.fs.deleteDoc(window.fs.doc(window.db, `live_streams/${window.currentLiveStreamId}/mods`, window.ctxTargetUid)); window.showToast(`Mod-Rechte von ${window.ctxTargetName} entfernt.`); } else { await window.fs.setDoc(window.fs.doc(window.db, `live_streams/${window.currentLiveStreamId}/mods`, window.ctxTargetUid), { uid: window.ctxTargetUid }); window.showToast(`${window.ctxTargetName} ist nun Mod!`); } document.getElementById('live-ctx-menu').classList.remove('active'); } });

window.toggleStreamSetting = async function(settingKey, value) { const streamId = window.currentLiveStreamerUid || window.currentLiveStreamId; if(!streamId) return; let updateData = {}; updateData[settingKey] = value; await window.fs.updateDoc(window.fs.doc(window.db, "live_streams", streamId), updateData); window.showToast("Stream-Einstellung live aktualisiert!"); };
document.getElementById('live-mod-panel-btn')?.addEventListener('click', () => { document.getElementById('mod-panel-modal').classList.add('show'); });
window.clearLiveChat = async function() { if(!confirm("Gesamten Chat wirklich leeren?")) return; const streamId = window.currentLiveStreamerUid || window.currentLiveStreamId; const q = window.fs.query(window.fs.collection(window.db, `live_streams/${streamId}/chat`)); const snaps = await window.fs.getDocs(q); snaps.forEach(d => window.fs.deleteDoc(d.ref)); window.showToast("Chat wurde geleert!"); document.getElementById('mod-panel-modal').classList.remove('show'); };

document.getElementById('send-live-chat-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('live-chat-input'); const text = input.value.trim(); if(!text || !window.currentLiveStreamId || !window.currentUser) return;
    const streamId = window.currentLiveStreamId; const amIHost = window.currentUser.uid === streamId; const amIMod = window.currentLiveMods.includes(window.currentUser.uid); const amIAppAdmin = window.currentUser.isAdmin || window.currentUser.email === "schleimyverteilung@gmail.com"; const hasModPower = amIHost || amIMod || amIAppAdmin;
    const settings = window.currentStreamSettings || {};
    if (!hasModPower) {
        if (settings.chatLocked) return window.showCustomAlert("Chat gesperrt", "Der Chat wurde von einem Moderator temporär gesperrt.");
        if (settings.followerOnly) { if (!window.currentUser.following || !window.currentUser.following.includes(streamId)) return window.showCustomAlert("Follower-Only", "Nur Follower können in diesem Stream schreiben. Klicke auf 'Folgen'!"); }
        if (settings.slowMode) { const now = Date.now(); if (window.lastLiveChatSent && (now - window.lastLiveChatSent) < 5000) return window.showToast("Slow Mode aktiv! Bitte warte 5 Sekunden."); }
    }
    window.lastLiveChatSent = Date.now();
    await window.fs.addDoc(window.fs.collection(window.db, `live_streams/${window.currentLiveStreamId}/chat`), { uid: window.currentUser.uid, name: window.currentUser.displayName, text: text, timestamp: Date.now() });
    input.value = '';
});
document.getElementById('live-chat-input')?.addEventListener('keypress', (e) => { if(e.key === 'Enter') document.getElementById('send-live-chat-btn').click(); });
document.getElementById('live-gift-btn')?.addEventListener('click', () => { if(window.currentLiveStreamId) window.openGiftModal(window.currentLiveStreamId); });

window.adminForceStreamOffline = async function() { if(!confirm("Diesen Stream wirklich offline zwingen?")) return; await window.fs.deleteDoc(window.fs.doc(window.db, "live_streams", window.currentLiveStreamerUid || window.currentLiveStreamId)); window.showToast("Stream wurde beendet."); };
window.adminRevokeStreamLicense = async function() { if(!confirm("Diesem Nutzer die Stream-Lizenz entziehen? Er kann danach nicht mehr streamen.")) return; await window.fs.updateDoc(window.fs.doc(window.db, "users", window.currentLiveStreamerUid || window.currentLiveStreamId), { streamLicense: false }); window.showToast("Lizenz entzogen."); };