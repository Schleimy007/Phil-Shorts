// ==========================================
// js/chat.js - Phil Shorts Chat & Inbox System
// ==========================================

let inboxUnsubscribe = null;
let inboxChatsUnsubscribe = null;
let supportUnsubscribe = null;
let currentDMSnapshot = null;
let currentTicketSnapshot = null;
let currentTicketMetaSnapshot = null;
let isInitialNotifLoad = true;

window.currentChatId = null;
window.currentChatPartner = null;
window.currentActiveTicketId = null;
window.dmReplyTarget = null;
window.currentEditDMId = null;
window.dmPressTimer = null;

// === BENACHRICHTIGUNGEN (NOTIFICATIONS) ===
window.addNotification = async function(targetUid, type, text, videoId = null) {
    if (!window.currentUser || targetUid === window.currentUser.uid) return;
    let targetUser = window.allKnownUsers?.find(u => u.uid === targetUid);
    if (targetUser && targetUser.blockedUsers && targetUser.blockedUsers.includes(window.currentUser.uid)) return;
    
    await window.fs.addDoc(window.fs.collection(window.db, "users", targetUid, "notifications"), { 
        fromUid: window.currentUser.uid, 
        fromName: window.currentUser.displayName, 
        fromUsername: window.currentUser.username, 
        fromPic: window.currentUser.photoURL, 
        type: type, 
        text: text, 
        videoId: videoId, 
        timestamp: Date.now() 
    });
};

window.initInbox = function() {
    const inboxBox = document.getElementById('inbox-notifications-box'); 
    if (!window.currentUser) return; 
    if (inboxUnsubscribe) inboxUnsubscribe(); 
    isInitialNotifLoad = true;

    const q = window.fs.query(window.fs.collection(window.db, "users", window.currentUser.uid, "notifications"), window.fs.orderBy("timestamp", "desc"));
    
    inboxUnsubscribe = window.fs.onSnapshot(q, (snapshot) => {
        let blocked = (window.currentUser && window.currentUser.blockedUsers) ? window.currentUser.blockedUsers : [];
        
        if (!isInitialNotifLoad) { 
            snapshot.docChanges().forEach((change) => { 
                if (change.type === "added") { 
                    const n = change.doc.data(); 
                    if(blocked.includes(n.fromUid)) return; 
                    const isCurrentlyChatting = document.getElementById('view-dm').classList.contains('active') && window.currentChatPartner && window.currentChatPartner.uid === n.fromUid; 
                    
                    if (!isCurrentlyChatting && window.sendDesktopNotification) { 
                        const nUser = window.getUserData(n.fromUid, n.fromName, n.fromUsername, n.fromPic, false); 
                        let toastMsg = `🔔 Aktivität von @${nUser.username}`; 
                        if (n.type === 'message') toastMsg = `💬 Nachricht von @${nUser.username}`; 
                        else if (n.type === 'like') toastMsg = `❤️ @${nUser.username} mag dein Post`; 
                        else if (n.type === 'follow') toastMsg = `👤 @${nUser.username} folgt dir`; 
                        else if (n.type === 'gift') toastMsg = `🎁 @${nUser.username} hat gespendet!`; 
                        else if (n.type === 'comment') toastMsg = `💬 @${nUser.username} hat kommentiert`; 
                        
                        window.showToast(toastMsg); 
                        window.sendDesktopNotification("Phil Shorts", toastMsg, n.type); 
                    } 
                } 
            }); 
        }
        
        isInitialNotifLoad = false; 
        inboxBox.innerHTML = '';
        
        let validNotifs = []; 
        snapshot.forEach((doc) => { const n = doc.data(); if(!blocked.includes(n.fromUid)) validNotifs.push(n); });
        
        if (validNotifs.length === 0) { inboxBox.innerHTML = '<div class="empty-state" style="height: 100%;"><p>Keine neuen Benachrichtigungen</p></div>'; return; }
        
        validNotifs.forEach((n) => {
            const nUser = window.getUserData(n.fromUid, n.fromName, n.fromUsername, n.fromPic, false); 
            let clickAction = `window.openProfile('${n.fromUid}')`; 
            if (n.type === 'message') clickAction = `window.openDM('${n.fromUid}', '${nUser.username.replace(/'/g, "\\'")}', '${nUser.pic}')`; 
            else if (n.videoId) clickAction = `window.jumpToVideo('${n.videoId}')`; 
            
            const isVerif = window.getVerifiedBadge(nUser.verified); 
            let nameClass = nUser.philPlusUntil && nUser.philPlusUntil > Date.now() && nUser.philPlusTier >= 1 ? "name-phil-plus" : "";
            
            inboxBox.innerHTML += `
                <div class="inbox-msg" onclick="${clickAction}">
                    <img src="${nUser.pic}" class="chat-avatar live-pic-${n.fromUid}" style="flex-shrink:0;">
                    <div style="flex:1; min-width:0;">
                        <span class="chat-username" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            <span class="live-name-${n.fromUid} ${nameClass}">${nUser.displayName}${isVerif}</span>
                        </span>
                        <div class="chat-bubble" style="background: transparent; padding: 0;">${window.formatText(n.text)}</div>
                        <div class="chat-time" style="font-size: 11px; color: #666; margin-top: 4px;">${window.timeAgo(n.timestamp)}</div>
                    </div>
                </div>`;
        });
    });
};

// === CHAT ÜBERSICHT (Die optimierte Version!) ===
window.initInboxChats = function() {
    if (!window.currentUser) return; 
    const msgBox = document.getElementById('inbox-messages-box'); 
    if (inboxChatsUnsubscribe) inboxChatsUnsubscribe();
    
    // Performance-Boost: Lädt nur die Chats des Users
    const q = window.fs.query(window.fs.collection(window.db, "chats"), window.fs.where("participants", "array-contains", window.currentUser.uid));

    inboxChatsUnsubscribe = window.fs.onSnapshot(q, (snapshot) => {
        let blocked = (window.currentUser && window.currentUser.blockedUsers) ? window.currentUser.blockedUsers : [];
        let chats = []; 
        
        snapshot.forEach(doc => { 
            const chat = doc.data(); 
            const partnerUid = chat.participants.find(uid => uid !== window.currentUser.uid); 
            if(!blocked.includes(partnerUid)) {
                chats.push({ id: doc.id, ...chat }); 
            }
        }); 
        
        chats.sort((a, b) => b.lastMessageTime - a.lastMessageTime); 
        msgBox.innerHTML = '';
        
        if (chats.length === 0) { msgBox.innerHTML = '<div class="empty-state" style="height:100%;"><p>Keine Nachrichten</p></div>'; return; }
        
        chats.forEach(chat => {
            const partnerUid = chat.participants.find(uid => uid !== window.currentUser.uid); 
            const partner = chat.users[partnerUid]; if (!partner) return; 
            const nUser = window.getUserData(partnerUid, partner.name, partner.name, partner.pic, false); 
            const safeName = nUser.username.replace(/'/g, "\\'"); 
            const isVerif = window.getVerifiedBadge(nUser.verified); 
            let nameClass = nUser.philPlusUntil && nUser.philPlusUntil > Date.now() && nUser.philPlusTier >= 1 ? "name-phil-plus" : "";
            
            let previewText = chat.lastMessage; if(previewText && previewText.startsWith('[IMAGE]')) previewText = "📸 Bild gesendet";
            let isUnread = chat.lastMessageSender === partnerUid && chat.lastMessageRead === false;
            let fontWeight = isUnread ? "bold" : "normal";
            let colorMsg = isUnread ? "white" : "#888";
            let unreadDot = isUnread ? '<div style="width:10px; height:10px; background:#ff0050; border-radius:50%; margin-left:auto;"></div>' : '';
            
            let partnerData = window.allKnownUsers?.find(u => u.uid === partnerUid);
            let showReadReceipts = window.checkPhilPlusStatus(2) || (partnerData && partnerData.philPlusUntil > Date.now() && partnerData.philPlusTier >= 2);
            let tickHtml = '';
            
            if (chat.lastMessageSender === window.currentUser.uid && showReadReceipts) {
                tickHtml = chat.lastMessageRead ? '<span style="color:#00f2fe; margin-right:4px;">✓✓</span>' : '<span style="color:#888; margin-right:4px;">✓</span>';
            }
            
            msgBox.innerHTML += `
                <div class="inbox-msg" onclick="window.openDM('${partnerUid}', '${safeName}', '${nUser.pic}')">
                    <img src="${nUser.pic}" class="chat-avatar live-pic-${partnerUid}" style="flex-shrink:0;">
                    <div style="flex:1; min-width:0;">
                        <span class="chat-username" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            <span class="live-name-${partnerUid} ${nameClass}">${nUser.displayName}${isVerif}</span>
                        </span>
                        <div class="chat-bubble" style="background: transparent; padding: 0; color: ${colorMsg}; font-weight: ${fontWeight};">${tickHtml}${window.formatText(previewText) || 'Neuer Chat...'}</div>
                        <div class="chat-time" style="font-size: 11px; color: #666; margin-top: 4px;">${window.timeAgo(chat.lastMessageTime)}</div>
                    </div>
                    ${unreadDot}
                </div>`;
        });
    });
};

// === DIREKTNACHRICHTEN (DMs) ÖFFNEN ===
window.openDM = async function(targetUid, targetName, targetPic) {
    if (!window.currentUser) return; 

    // DM Privatsphäre-Check
    const tUser = window.allKnownUsers?.find(u => u.uid === targetUid);
    if(tUser) {
        const privacy = tUser.dmPrivacy || 'everyone';
        if(privacy === 'off') {
            window.showCustomAlert("Privatsphäre", "Dieser Nutzer empfängt momentan keine Nachrichten.");
            return;
        }
        if(privacy === 'friends') {
            const theyFollowMe = tUser.following && tUser.following.includes(window.currentUser.uid);
            const iFollowThem = window.currentUser.following && window.currentUser.following.includes(targetUid);
            if(!theyFollowMe || !iFollowThem) {
                window.showCustomAlert("Privatsphäre", "Ihr müsst euch gegenseitig folgen, um Nachrichten zu senden.");
                return;
            }
        }
    }

    window.currentChatPartner = { uid: targetUid, name: targetName, pic: targetPic }; 
    const uids = [window.currentUser.uid, targetUid].sort(); 
    window.currentChatId = `${uids[0]}_${uids[1]}`; 
    const nUser = window.getUserData(targetUid, targetName, targetName, targetPic, false); 
    const isVerif = window.getVerifiedBadge(nUser.verified);
    
    document.getElementById('dm-name-span').innerHTML = '@' + targetName + ' ' + isVerif; 
    window.switchView('dm');
    
    let statusHtml = ''; 
    if(nUser.lastActive) { 
        let diff = Date.now() - nUser.lastActive; 
        statusHtml = diff < 5 * 60000 ? '<span style="color:#39ff14;">🟢 Online</span>' : 'Zuletzt online: ' + window.timeAgo(nUser.lastActive); 
    }
    document.getElementById('dm-status-span').innerHTML = statusHtml;

    if (currentDMSnapshot) currentDMSnapshot(); 
    const dmBox = document.getElementById('dm-box'); 
    dmBox.innerHTML = '<div class="loading-screen"><i class="fas fa-circle-notch fa-spin"></i></div>';
    
    const chatRef = window.fs.doc(window.db, "chats", window.currentChatId); 
    const chatSnap = await window.fs.getDoc(chatRef);
    
    if (!chatSnap.exists()) {
        await window.fs.setDoc(chatRef, { 
            participants: [window.currentUser.uid, targetUid], 
            users: { 
                [window.currentUser.uid]: { name: window.currentUser.displayName, pic: window.currentUser.photoURL }, 
                [targetUid]: { name: targetName, pic: targetPic } 
            }, 
            lastMessage: "", 
            lastMessageTime: Date.now(), 
            lastMessageRead: false 
        });
    }
    
    let showReadReceipts = window.checkPhilPlusStatus(2);
    if (!showReadReceipts) {
        const tDoc = await window.fs.getDoc(window.fs.doc(window.db, "users", targetUid));
        if (tDoc.exists() && tDoc.data().philPlusUntil > Date.now() && tDoc.data().philPlusTier >= 2) {
            showReadReceipts = true;
        }
    }
    
    const q = window.fs.query(window.fs.collection(window.db, `chats/${window.currentChatId}/messages`), window.fs.orderBy("timestamp", "asc"));
    currentDMSnapshot = window.fs.onSnapshot(q, (snapshot) => {
        dmBox.innerHTML = '';
        let unreadIds = [];
        
        if (snapshot.empty) {
            dmBox.innerHTML = '<div class="empty-state" style="height:100%;"><p>Schreib die erste Nachricht!</p></div>'; 
        } else { 
            snapshot.forEach(docSnap => { 
                const msg = docSnap.data(); 
                const isMe = msg.senderUid === window.currentUser.uid ? 'me' : ''; 
                const pic = isMe ? window.currentUser.photoURL : targetPic; 
                
                if (!isMe && !msg.read) unreadIds.push(docSnap.id);
                
                let readReceipt = '';
                if (isMe && showReadReceipts) {
                    readReceipt = msg.read ? `<span style="font-size:10px; color:#00f2fe; margin-left:5px; font-weight:bold; letter-spacing:-2px;">✓✓</span>` : `<span style="font-size:10px; color:#888; margin-left:5px; font-weight:bold;">✓</span>`;
                }

                let replyHtml = '';
                if (msg.replyTo) {
                    replyHtml = `<div class="chat-reply-quote" onclick="document.getElementById('dm-reply-preview').style.display='none';"><strong>${msg.replyTo.name}</strong><br>${window.formatText(msg.replyTo.text)}</div>`;
                }

                let editedHtml = msg.edited ? `<span style="font-size:10px; color:#888; margin-left:5px;">(bearbeitet)</span>` : '';
                let extraClass = isMe && window.checkPhilPlusStatus(2) ? 'gold-bubble' : ''; 
                
                // Embed-Formatierung, wenn vorhanden (z.B. formatDMText)
                let bubbleContent = window.formatDMText ? window.formatDMText(msg.text) : window.formatText(msg.text);
                let safeText = msg.text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                
                let interactions = `oncontextmenu="event.preventDefault(); window.openDMContextMenu('${docSnap.id}', '${msg.senderUid}', '${safeText}');"`;
                interactions += ` onmousedown="window.dmPressTimer = setTimeout(() => { window.openDMContextMenu('${docSnap.id}', '${msg.senderUid}', '${safeText}'); }, 500);" onmouseup="clearTimeout(window.dmPressTimer)" onmouseleave="clearTimeout(window.dmPressTimer)" ontouchstart="window.dmPressTimer = setTimeout(() => { window.openDMContextMenu('${docSnap.id}', '${msg.senderUid}', '${safeText}'); }, 500);" ontouchend="clearTimeout(window.dmPressTimer)"`;

                dmBox.innerHTML += `
                    <div class="chat-msg ${isMe}">
                        <img src="${pic}" class="chat-avatar" style="flex-shrink:0;">
                        <div style="min-width:0; max-width: 100%;">
                            <div class="chat-bubble ${extraClass}" ${interactions} style="cursor:pointer;">${replyHtml}${bubbleContent}${editedHtml}</div>
                            <div class="chat-time" style="font-size: 10px; color: #666; margin-top: 4px; text-align: ${isMe ? 'right' : 'left'};">${window.timeAgo(msg.timestamp)}${readReceipt}</div>
                        </div>
                    </div>`; 
            }); 
        }
        
        dmBox.scrollTop = dmBox.scrollHeight;
        if(window.processEmbeds) window.processEmbeds();

        if (unreadIds.length > 0) {
            unreadIds.forEach(id => window.fs.updateDoc(window.fs.doc(window.db, `chats/${window.currentChatId}/messages`, id), { read: true }));
            window.fs.updateDoc(window.fs.doc(window.db, "chats", window.currentChatId), { lastMessageRead: true });
        }
    });
};

// === NACHRICHT SENDEN LOGIK ===
window.sendDMMessage = async function() {
    const input = document.getElementById('dm-input'); 
    const text = input.value.trim(); 
    if (!text || !window.currentChatId || !window.currentUser) return; 
    input.value = ''; 

    let msgObj = { senderUid: window.currentUser.uid, text: text, timestamp: Date.now(), read: false };
    if(window.dmReplyTarget) {
        msgObj.replyTo = window.dmReplyTarget;
        window.dmReplyTarget = null;
        document.getElementById('dm-reply-preview').style.display = 'none';
    }

    await window.fs.addDoc(window.fs.collection(window.db, `chats/${window.currentChatId}/messages`), msgObj); 

    await window.fs.updateDoc(window.fs.doc(window.db, "chats", window.currentChatId), { 
        lastMessage: text, 
        lastMessageTime: Date.now(), 
        lastMessageSender: window.currentUser.uid, 
        lastMessageRead: false, 
        users: { 
            [window.currentUser.uid]: { name: window.currentUser.displayName, pic: window.currentUser.photoURL }, 
            [window.currentChatPartner.uid]: { name: window.currentChatPartner.name, pic: window.currentChatPartner.pic } 
        } 
    }); 
    window.addNotification(window.currentChatPartner.uid, "message", `hat geschrieben: "${text}"`);
};

// === DM CONTEXT MENU LOGIK ===
window.openDMContextMenu = function(msgId, senderUid, text) {
    if(!window.currentUser) return;
    const isOwner = window.currentUser.uid === senderUid;
    let html = '';
    
    html += `<button class="profile-action-btn edit-btn" onclick="window.copyDM('${text.replace(/'/g, "\\'")}')"><i class="fas fa-copy"></i> Kopieren</button>`;
    html += `<button class="profile-action-btn edit-btn" onclick="window.replyDM('${msgId}', '${text.replace(/'/g, "\\'")}', '${senderUid}')"><i class="fas fa-reply"></i> Antworten</button>`;
    
    if (isOwner) {
        html += `<button class="profile-action-btn edit-btn" onclick="window.openEditDMModal('${msgId}', '${text.replace(/'/g, "\\'")}')"><i class="fas fa-pen"></i> Bearbeiten</button>`;
        html += `<button class="profile-action-btn" style="background:#ff4444; color:white;" onclick="window.deleteDM('${msgId}')"><i class="fas fa-trash"></i> Löschen</button>`;
    } else {
        html += `<button class="profile-action-btn" style="background:#ff4444; color:white;" onclick="window.reportDM('${msgId}', '${senderUid}', '${text.replace(/'/g, "\\'")}')"><i class="fas fa-flag"></i> Melden</button>`;
    }
    
    document.getElementById('dm-context-content').innerHTML = html;
    document.getElementById('dm-context-modal').classList.add('show');
};

window.copyDM = function(text) {
    navigator.clipboard.writeText(text);
    window.showToast("Nachricht kopiert!");
    document.getElementById('dm-context-modal').classList.remove('show');
};

window.replyDM = function(msgId, text, senderUid) {
    const sender = window.allKnownUsers?.find(u => u.uid === senderUid) || window.currentChatPartner;
    window.dmReplyTarget = { id: msgId, text: text, name: sender ? sender.displayName : 'User' };
    document.getElementById('dm-reply-name').innerText = window.dmReplyTarget.name;
    document.getElementById('dm-reply-text').innerText = text;
    document.getElementById('dm-reply-preview').style.display = 'flex';
    document.getElementById('dm-context-modal').classList.remove('show');
    document.getElementById('dm-input').focus();
};

window.deleteDM = async function(msgId) {
    if(confirm("Möchtest du diese Nachricht für alle löschen?")) {
        try {
            await window.fs.deleteDoc(window.fs.doc(window.db, `chats/${window.currentChatId}/messages`, msgId));
            window.showToast("Nachricht gelöscht.");
            document.getElementById('dm-context-modal').classList.remove('show');
        } catch(e) { window.showCustomAlert("Fehler", "Konnte nicht gelöscht werden."); }
    }
};

window.reportDM = async function(msgId, senderUid, text) {
    if (!window.currentUser) return;
    try {
        const ticketRef = await window.fs.addDoc(window.fs.collection(window.db, "reports"), { 
            uid: window.currentUser.uid, 
            name: window.currentUser.displayName, 
            hasPlus: window.checkPhilPlusStatus(1), 
            tier: window.currentUser.philPlusTier || 0, 
            status: 'open', 
            type: 'dm_report',
            reportedUser: senderUid,
            timestamp: Date.now() 
        }); 
        
        await window.fs.addDoc(window.fs.collection(window.db, `reports/${ticketRef.id}/messages`), { 
            senderUid: window.currentUser.uid, 
            text: `[SYSTEM] DM MELDUNG:\nChat-ID: ${window.currentChatId}\nNachricht: "${text}"`, 
            timestamp: Date.now() 
        });

        window.showToast("Nachricht gemeldet! Ticket erstellt.");
    } catch(e) { window.showCustomAlert("Fehler", "Meldung fehlgeschlagen."); }
    document.getElementById('dm-context-modal').classList.remove('show');
};

window.openEditDMModal = function(msgId, oldText) {
    window.currentEditDMId = msgId;
    document.getElementById('dm-edit-input').value = oldText;
    document.getElementById('dm-context-modal').classList.remove('show');
    document.getElementById('dm-edit-modal').classList.add('show');
};

window.saveEditDM = async function() {
    const newText = document.getElementById('dm-edit-input').value.trim();
    if(!newText || !window.currentEditDMId) return;
    try {
        await window.fs.updateDoc(window.fs.doc(window.db, `chats/${window.currentChatId}/messages`, window.currentEditDMId), {
            text: newText,
            edited: true
        });
        window.showToast("Nachricht bearbeitet.");
        document.getElementById('dm-edit-modal').classList.remove('show');
    } catch(e) { window.showCustomAlert("Fehler", "Konnte nicht bearbeitet werden."); }
};


// === SUPPORT TICKETS (INBOX) ===
window.initSupportTickets = function() {
    if (!window.currentUser) return; 
    const supportBox = document.getElementById('inbox-support-box'); 
    const isAdmin = (window.currentUser.email === "schleimyverteilung@gmail.com" || window.currentUser.isAdmin);
    
    if (supportUnsubscribe) supportUnsubscribe();
    
    const q = window.fs.query(window.fs.collection(window.db, "reports"), window.fs.orderBy("timestamp", "desc"));
    
    supportUnsubscribe = window.fs.onSnapshot(q, (snapshot) => {
        supportBox.innerHTML = ''; 
        let foundAny = false;
        
        snapshot.forEach(docSnap => {
            const ticket = docSnap.data(); 
            if (!isAdmin && ticket.uid !== window.currentUser.uid) return; 
            foundAny = true;
            
            const ticketId = docSnap.id; 
            const isVip = ticket.hasPlus ? 'vip' : ''; 
            let plusText = ticket.tier === 3 ? "PLUS+++" : (ticket.tier === 2 ? "PLUS++" : "PLUS");
            const vipBadge = ticket.hasPlus ? `<span class="phil-plus-badge" style="font-size:9px; margin-left:5px;">${plusText}</span>` : ''; 
            const uData = window.getUserData(ticket.uid, ticket.name, ticket.name, 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback', false);
            
            let adminButtons = '';
            if (isAdmin) {
                if (ticket.status === 'closed') adminButtons = `<button class="profile-action-btn edit-btn" onclick="window.deleteTicket(event, '${ticketId}')" style="min-height:26px; font-size:11px; background:transparent; border:1px solid #ff4444; color:#ff4444; padding:0 8px;"><i class="fas fa-trash"></i> Löschen</button>`;
                else adminButtons = `<button class="profile-action-btn edit-btn" onclick="window.resolveTicket(event, '${ticketId}')" style="min-height:26px; font-size:11px; background:transparent; border:1px solid #ffd700; color:#ffd700; padding:0 8px;"><i class="fas fa-lock"></i> Schließen</button>`;
            }
            
            supportBox.innerHTML += `
                <div class="support-ticket ${isVip}" onclick="window.openTicketChat('${ticketId}', '${uData.username.replace(/'/g, "\\'")}', '${ticket.uid}')" style="cursor:pointer; display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong style="color:white; font-size:14px;">@${uData.username} ${vipBadge}</strong>
                        <span style="color:#888; font-size:11px;">${window.timeAgo(ticket.timestamp)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="font-size:12px; color:#aaa;"><i class="fas fa-ticket-alt"></i> Status: <span style="color:${ticket.status === 'closed' ? '#ff4444' : '#39ff14'}; font-weight:bold;">${ticket.status === 'closed' ? 'Geschlossen' : 'Offen'}</span></div>
                        ${adminButtons}
                    </div>
                </div>`;
        });
        
        if (!foundAny) supportBox.innerHTML = '<div class="empty-state" style="height:100%;"><i class="fas fa-check-circle" style="color:#00f2fe; font-size:40px; margin-bottom:10px;"></i><p>Keine Support-Tickets gefunden!</p></div>';
    });
};

window.openTicketChat = async function(ticketId, username, ticketOwnerUid) {
    if (!window.currentUser) return; 
    window.currentActiveTicketId = ticketId; 
    document.getElementById('ticket-title').innerText = "Ticket: @" + username; 
    window.switchView('ticket');
    
    const ticketBox = document.getElementById('ticket-box'); 
    ticketBox.innerHTML = '<div class="loading-screen"><i class="fas fa-circle-notch fa-spin"></i></div>';
    
    const isAdmin = (window.currentUser.email === "schleimyverteilung@gmail.com" || window.currentUser.isAdmin);
    
    if (currentTicketSnapshot) currentTicketSnapshot(); 
    if (currentTicketMetaSnapshot) currentTicketMetaSnapshot();
    
    const q = window.fs.query(window.fs.collection(window.db, `reports/${ticketId}/messages`), window.fs.orderBy("timestamp", "asc"));
    currentTicketSnapshot = window.fs.onSnapshot(q, (snapshot) => {
        ticketBox.innerHTML = '';
        if (snapshot.empty) {
            ticketBox.innerHTML = '<div class="empty-state" style="height:100%;"><p>Keine Nachrichten</p></div>'; 
        } else {
            snapshot.forEach(docSnap => {
                const msg = docSnap.data(); 
                const isMe = msg.senderUid === window.currentUser.uid ? 'me' : ''; 
                const isSupportSender = msg.senderUid !== ticketOwnerUid;
                const pic = isSupportSender ? 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin' : (msg.senderUid === window.currentUser.uid ? window.currentUser.photoURL : `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.senderUid}`);
                
                let bg = isMe ? '#ff0050' : '#333'; 
                let adminLabel = isSupportSender ? '<div style="font-size:10px; color:#ffd700; margin-bottom:4px;"><i class="fas fa-shield-alt"></i> Support Team</div>' : '';
                
                ticketBox.innerHTML += `
                    <div class="chat-msg ${isMe}">
                        <img src="${pic}" class="chat-avatar" style="flex-shrink:0;">
                        <div style="min-width:0; max-width: 100%;">
                            <div class="chat-bubble" style="background:${bg}; border-color:${bg};">${adminLabel}${window.formatText(msg.text)}</div>
                            <div class="chat-time" style="font-size: 10px; color: #666; margin-top: 4px; text-align: ${isMe ? 'right' : 'left'};">${window.timeAgo(msg.timestamp)}</div>
                        </div>
                    </div>`;
            });
        }
        ticketBox.scrollTop = ticketBox.scrollHeight;
    });

    currentTicketMetaSnapshot = window.fs.onSnapshot(window.fs.doc(window.db, "reports", ticketId), (docSnap) => {
        const statEl = document.getElementById('ticket-status');
        if(docSnap.exists()) {
            const tData = docSnap.data(); 
            if(tData.status === 'closed') { 
                statEl.innerText = "Geschlossen"; statEl.style.background = "#ff4444"; statEl.style.color = "white"; 
                document.getElementById('ticket-input-area').style.display = 'none'; 
                document.getElementById('admin-close-ticket-btn').style.display = 'none'; 
            } else { 
                statEl.innerText = "Offen"; statEl.style.background = "#39ff14"; statEl.style.color = "black"; 
                document.getElementById('ticket-input-area').style.display = 'flex'; 
                document.getElementById('admin-close-ticket-btn').style.display = isAdmin ? 'block' : 'none'; 
            }
        } else { 
            statEl.innerText = "Gelöscht"; statEl.style.background = "#ff4444"; 
            document.getElementById('ticket-input-area').style.display = 'none'; 
            document.getElementById('admin-close-ticket-btn').style.display = 'none'; 
        }
    });
};

window.sendTicketMessage = async function() { 
    const input = document.getElementById('ticket-input'); 
    const text = input.value.trim(); 
    if (!text || !window.currentActiveTicketId || !window.currentUser) return; 
    input.value = ''; 
    await window.fs.addDoc(window.fs.collection(window.db, `reports/${window.currentActiveTicketId}/messages`), { senderUid: window.currentUser.uid, text: text, timestamp: Date.now() }); 
};

window.sendSupport = async function() { 
    const msg = document.getElementById('support-msg').value.trim(); 
    if(!msg || !window.currentUser) return; 
    
    const ticketRef = await window.fs.addDoc(window.fs.collection(window.db, "reports"), { 
        uid: window.currentUser.uid, 
        name: window.currentUser.displayName, 
        hasPlus: window.checkPhilPlusStatus(1), 
        tier: window.currentUser.philPlusTier || 0, 
        status: 'open', 
        timestamp: Date.now() 
    }); 
    
    await window.fs.addDoc(window.fs.collection(window.db, `reports/${ticketRef.id}/messages`), { 
        senderUid: window.currentUser.uid, 
        text: msg, 
        timestamp: Date.now() 
    }); 
    
    window.showToast("Ticket erstellt!"); 
    document.getElementById('support-msg').value = ''; 
    document.getElementById('app-settings-modal').classList.remove('show'); 
    window.switchView('inbox'); 
    document.getElementById('tab-support').click(); 
};

window.resolveTicket = async function(event, ticketId) { 
    event.stopPropagation(); 
    if(confirm("Ticket schließen?")) { 
        await window.fs.updateDoc(window.fs.doc(window.db, "reports", ticketId), { status: 'closed' }); 
        window.showToast("Geschlossen."); 
    } 
};

window.deleteTicket = async function(event, ticketId) { 
    event.stopPropagation(); 
    if(confirm("Ticket löschen?")) { 
        await window.fs.deleteDoc(window.fs.doc(window.db, "reports", ticketId)); 
        window.showToast("Gelöscht."); 
    } 
};

// === EVENT LISTENERS VERKNÜPFEN ===
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('send-dm-btn')?.addEventListener('click', window.sendDMMessage);
    document.getElementById('dm-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') window.sendDMMessage(); });
    
    document.getElementById('save-dm-edit-btn')?.addEventListener('click', window.saveEditDM);
    
    document.getElementById('send-ticket-btn')?.addEventListener('click', window.sendTicketMessage);
    document.getElementById('ticket-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') window.sendTicketMessage(); });
    
    document.getElementById('admin-close-ticket-btn')?.addEventListener('click', async() => { 
        if(!window.currentActiveTicketId) return; 
        if(confirm("Ticket schließen?")) { 
            await window.fs.updateDoc(window.fs.doc(window.db, "reports", window.currentActiveTicketId), { status: 'closed' }); 
            window.showToast("Ticket geschlossen."); 
        } 
    });
});