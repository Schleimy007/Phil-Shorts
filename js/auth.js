// ==========================================
// js/auth.js - Auth, Profiles & Gamification
// ==========================================

const XP_LEVELS = [0, 50, 150, 300, 500, 1000, 2000, 5000];

window.awardXP = async function(amount) {
    if (!window.currentUser) return;
    if (!window.currentUser.xp) window.currentUser.xp = 0;

    let oldLevel = 1;
    for (let i = 0; i < XP_LEVELS.length; i++) { if (window.currentUser.xp >= XP_LEVELS[i]) oldLevel = i + 1; }

    window.currentUser.xp += amount;

    let newLevel = 1;
    for (let i = 0; i < XP_LEVELS.length; i++) { if (window.currentUser.xp >= XP_LEVELS[i]) newLevel = i + 1; }

    if (newLevel > oldLevel) {
        window.showAchievement(`Level Up! Du bist jetzt Level ${newLevel}`);
        window.currentUser.coins = (window.currentUser.coins || 0) + (newLevel * 100);
    }

    await window.fs.updateDoc(window.fs.doc(window.db, "users", window.currentUser.uid), { xp: window.currentUser.xp, coins: window.currentUser.coins });
    window.updateProfileGamificationUI();
};

window.updateProfileGamificationUI = function() {
    if (!window.currentUser || !document.getElementById('view-profile').classList.contains('active')) return;
    const actionBtn = document.getElementById('profile-action-btn');
    if (actionBtn && actionBtn.dataset.uid === window.currentUser.uid) {
        const xpEl = document.getElementById('stat-xp');
        if (xpEl) xpEl.innerText = window.currentUser.xp || 0;
        let lvl = 1;
        for (let i = 0; i < XP_LEVELS.length; i++) { if ((window.currentUser.xp || 0) >= XP_LEVELS[i]) lvl = i + 1; }
        const lvlEl = document.getElementById('stat-level');
        if (lvlEl) lvlEl.innerText = lvl;
        const streakEl = document.getElementById('stat-streak');
        if (streakEl) streakEl.innerText = window.currentUser.streak || 0;
    }
};

window.checkDailyStreak = async function() {
    if (!window.currentUser) return;
    const today = new Date().toDateString();
    if (window.currentUser.lastStreakUpdate !== today) {
        let lastDate = new Date(window.currentUser.lastStreakUpdate || 0);
        let yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        if (lastDate.toDateString() === yesterday.toDateString()) {
            window.currentUser.streak = (window.currentUser.streak || 0) + 1;
            window.showAchievement(`${window.currentUser.streak} Tage Streak! 🔥`);
            window.currentUser.coins = (window.currentUser.coins || 0) + 50;
        } else if (window.currentUser.lastStreakUpdate) {
            window.currentUser.streak = 1;
        } else {
            window.currentUser.streak = 1;
        }

        window.currentUser.lastStreakUpdate = today;
        await window.fs.updateDoc(window.fs.doc(window.db, "users", window.currentUser.uid), { streak: window.currentUser.streak, lastStreakUpdate: today, coins: window.currentUser.coins });
    }
};

window.initLiveUser = function() {
    if (!window.currentUser) return;
    if (window.userUnsubscribe) window.userUnsubscribe();
    window.userUnsubscribe = window.fs.onSnapshot(window.fs.doc(window.db, "users", window.currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.banned) { 
                localStorage.removeItem('phil_session');
                alert("Dein Account wurde gesperrt.");
                window.location.reload(); return; 
            }
            window.currentUser = {...window.currentUser, ...data };
            if (window.currentUser.coins === undefined) window.currentUser.coins = 1000;
            if (!window.currentUser.followers) window.currentUser.followers = [];
            if (!window.currentUser.following) window.currentUser.following = [];
            if (!window.currentUser.savedVideos) window.currentUser.savedVideos = [];
            if (!window.currentUser.blockedUsers) window.currentUser.blockedUsers = [];
            if (!window.currentUser.socialLinks) window.currentUser.socialLinks = { ig: '', yt: '', tw: '', tt: '' };
            if (!window.currentUser.decorations) window.currentUser.decorations = [];
            if (!window.currentUser.username) window.currentUser.username = window.currentUser.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
            if (!window.currentUser.appTheme) window.currentUser.appTheme = 'default';
            if (!window.currentUser.appIcon) window.currentUser.appIcon = 'default';
            if (!window.currentUser.philPlusTier) window.currentUser.philPlusTier = 0;
            if (!window.currentUser.customBorder) window.currentUser.customBorder = { c1: '#ff0050', c2: '#00f2fe', grad: true };
            if (!window.currentUser.dmPrivacy) window.currentUser.dmPrivacy = 'everyone'; 

            const dmPrivacySelect = document.getElementById('dm-privacy-select');
            if(dmPrivacySelect) dmPrivacySelect.value = window.currentUser.dmPrivacy;

            const today = new Date().toDateString();
            if (window.currentUser.lastLogin !== today) { 
                let bonus = 100; if (window.checkPhilPlusStatus(3)) bonus = 500;
                else if (window.checkPhilPlusStatus(2)) bonus = 200;
                window.currentUser.coins += bonus;
                window.currentUser.lastLogin = today;
                window.fs.updateDoc(window.fs.doc(window.db, "users", window.currentUser.uid), { coins: window.currentUser.coins, lastLogin: today, lastActive: Date.now() });
                window.showToast(`Täglicher Login: +${bonus} Coins!`); 
            }

            let needsUpdate = false;
            if (!window.checkPhilPlusStatus(2)) { 
                if (window.currentUser.appTheme && window.currentUser.appTheme !== 'default') { window.currentUser.appTheme = 'default'; needsUpdate = true; } 
                if (window.currentUser.activeBorder === 'chroma') { window.currentUser.activeBorder = ''; needsUpdate = true; window.applyBorderStyles(document.getElementById('profile-pic'), '', null); } 
            }
            if (!window.checkPhilPlusStatus(3)) { 
                if (window.currentUser.profileSong || window.currentUser.profileColor || (window.currentUser.appIcon && window.currentUser.appIcon !== 'default') || window.currentUser.activeBorder === 'custom') { 
                    window.currentUser.profileSong = ''; window.currentUser.profileColor = ''; window.currentUser.appIcon = 'default'; 
                    if (window.currentUser.activeBorder === 'custom') window.currentUser.activeBorder = '';
                    needsUpdate = true; 
                } 
            }
            if (needsUpdate) window.fs.updateDoc(window.fs.doc(window.db, "users", window.currentUser.uid), { appTheme: window.currentUser.appTheme, activeBorder: window.currentUser.activeBorder, profileSong: window.currentUser.profileSong || '', profileColor: window.currentUser.profileColor || '', appIcon: window.currentUser.appIcon || 'default' });

            localStorage.setItem('phil_session', JSON.stringify(window.currentUser));
            if (window.checkPhilPlusStatus(2)) { window.applyAppTheme(window.currentUser.appTheme); document.getElementById('app-theme-select').value = window.currentUser.appTheme; } else window.applyAppTheme('default');
            if (window.checkPhilPlusStatus(3) && window.currentUser.appIcon) { 
                document.getElementById('app-icon-select').value = window.currentUser.appIcon; 
                const favicon = document.getElementById('dynamic-favicon'); 
                if (window.currentUser.appIcon === 'gold') favicon.href = "https://cdn-icons-png.flaticon.com/512/189/189118.png";
                else if (window.currentUser.appIcon === 'dark') favicon.href = "https://cdn-icons-png.flaticon.com/512/32/32114.png";
                else favicon.href = "https://i.imgur.com/JDPRzCc.png"; 
            }

            if (window.checkPhilPlusStatus(3)) { 
                document.getElementById('tier3-settings-area').style.display = 'block';
                document.getElementById('account-switcher-area').style.display = 'block';
                document.getElementById('up-story-link').style.display = 'block'; 
            } else { 
                document.getElementById('tier3-settings-area').style.display = 'none';
                document.getElementById('account-switcher-area').style.display = 'none';
                document.getElementById('up-story-link').style.display = 'none'; 
            }

            if (window.checkPhilPlusStatus(2)) { 
                const studioBtn = document.getElementById('open-studio-btn');
                if(studioBtn) studioBtn.style.display = 'block';
            } else {
                const studioBtn = document.getElementById('open-studio-btn');
                if(studioBtn) studioBtn.style.display = 'none';
            }

            document.getElementById('btn-live-stream').style.display = 'flex';

            const supportTab = document.getElementById('tab-support');
            if (supportTab) supportTab.style.display = 'block';
            if (window.initSupportTickets) window.initSupportTickets();
            const coinEl = document.getElementById('my-coins');
            if (coinEl) coinEl.innerText = window.currentUser.coins;
            const viewsEl = document.getElementById('my-views');
            if (viewsEl) viewsEl.innerText = window.currentUser.profileViews || 0;
            const actionBtn = document.getElementById('profile-action-btn');

            if (actionBtn && actionBtn.dataset.uid === window.currentUser.uid) {
                document.getElementById('stat-followers').innerText = window.currentUser.followers.length;
                document.getElementById('stat-following').innerText = window.currentUser.following.length;
                window.applyBorderStyles(document.getElementById('profile-pic'), window.currentUser.activeBorder, window.currentUser.customBorder);
                if (window.checkPhilPlusStatus(1)) { 
                    document.getElementById('phil-plus-badge-container').style.display = 'block'; 
                    let tierText = "Phil Shorts+"; if (window.currentUser.philPlusTier === 2) tierText = "Phil Shorts++"; if (window.currentUser.philPlusTier === 3) tierText = "Phil Shorts+++";
                    document.getElementById('phil-plus-badge-text').innerHTML = `<i class="fas fa-star"></i> ${tierText}`; 
                } else document.getElementById('phil-plus-badge-container').style.display = 'none';
            }
            if (document.getElementById('app-settings-modal').classList.contains('show')) window.renderBlockedUsersList();
            window.updateProfileGamificationUI();
        }
    });
    setInterval(() => { if (window.currentUser && document.visibilityState === 'visible') window.fs.updateDoc(window.fs.doc(window.db, "users", window.currentUser.uid), { lastActive: Date.now() }).catch(() => {}); }, 60000);
};

window.initSearchUsers = async function() {
    try {
        const snapshot = await window.fs.getDocs(window.fs.collection(window.db, "users"));
        window.allKnownUsers = [];
        snapshot.forEach(doc => window.allKnownUsers.push(doc.data()));
        window.allKnownUsers.forEach(u => {
            const isVerif = u.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : '';
            const cleanUsername = u.username || u.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
            let nameClass = "";
            let tier3Badge = "";
            if (u.philPlusUntil && u.philPlusUntil > Date.now() && (u.philPlusTier || 1) >= 1) nameClass = "name-phil-plus";
            if (u.philPlusUntil && u.philPlusUntil > Date.now() && u.philPlusTier === 3) tier3Badge = ' <i class="fas fa-gem" style="color: #00f2fe; font-size: 12px;" title="Plus+++ Legende"></i>';
            document.querySelectorAll(`.live-name-${u.uid}`).forEach(el => { 
                let blockedBadge = ''; 
                if (window.currentUser && window.currentUser.blockedUsers && window.currentUser.blockedUsers.includes(u.uid)) blockedBadge = '<span style="color:#ff4444; font-size:10px; margin-left:5px; font-weight:bold;">[BLOCKIERT]</span>';
                el.innerHTML = u.displayName + isVerif + tier3Badge + blockedBadge; 
                if (nameClass) el.classList.add(nameClass);
                else el.classList.remove("name-phil-plus"); 
            });
            document.querySelectorAll(`.live-username-${u.uid}`).forEach(el => el.innerText = '@' + cleanUsername);
            document.querySelectorAll(`.live-pic-${u.uid}`).forEach(el => { 
                el.src = u.photoURL;
                window.applyBorderStyles(el, u.activeBorder, u.customBorder); 
            });
        });
    } catch(e) { console.error(e); }
};

window.addEventListener('googleLoginSuccess', async(event) => {
    try {
        const data = window.parseJwt(event.detail.credential);
        const uid = data.sub;
        const rawDisplayName = window.escapeHTML(data.name);
        let baseUser = rawDisplayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        if (!baseUser || baseUser.length < 3) baseUser = "user" + Math.floor(100 + Math.random() * 900);
        const pic = data.picture;
        const email = data.email;
        const userRef = window.fs.doc(window.db, "users", uid);
        const userSnap = await window.fs.getDoc(userRef);
        if (!userSnap.exists()) {
            let finalUser = baseUser;
            let nameQuery = window.fs.query(window.fs.collection(window.db, "users"), window.fs.where("username", "==", finalUser));
            let nameSnap = await window.fs.getDocs(nameQuery);
            while (!nameSnap.empty) { 
                finalUser = baseUser + Math.floor(1000 + Math.random() * 9000);
                nameQuery = window.fs.query(window.fs.collection(window.db, "users"), window.fs.where("username", "==", finalUser));
                nameSnap = await window.fs.getDocs(nameQuery); 
            }
            const newUser = { uid: uid, displayName: rawDisplayName, username: finalUser, email: email, photoURL: pic, bio: "Neu in der Community! 👋", following: [], followers: [], savedVideos: [], blockedUsers: [], socialLinks: { ig: '', yt: '', tw: '', tt: '' }, verified: false, coins: 1000, xp: 0, streak: 1, profileViews: 0, isAdmin: false, banned: false, decorations: [], activeBorder: "", stories: [], appTheme: 'default', dmPrivacy: 'everyone', philPlusTier: 0, lastLogin: new Date().toDateString(), lastActive: Date.now(), customBorder: { c1: '#ff0050', c2: '#00f2fe', grad: true } };
            await window.fs.setDoc(userRef, newUser);
            window.currentUser = newUser;
        } else {
            window.currentUser = userSnap.data();
            if (window.currentUser.banned) { 
                window.showCustomAlert("Gesperrt", "Account gesperrt.");
                localStorage.removeItem('phil_session');
                window.currentUser = null;
                document.getElementById('login-screen').classList.add('show'); return; 
            }
            if (!window.currentUser.following) window.currentUser.following = [];
            if (!window.currentUser.savedVideos) window.currentUser.savedVideos = [];
            if (!window.currentUser.blockedUsers) window.currentUser.blockedUsers = [];
            if (!window.currentUser.socialLinks) window.currentUser.socialLinks = { ig: '', yt: '', tt: '' };
            if (!window.currentUser.decorations) window.currentUser.decorations = [];
            if (!window.currentUser.username) window.currentUser.username = window.currentUser.displayName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
            if (window.currentUser.coins === undefined) await window.fs.updateDoc(userRef, { coins: 1000, profileViews: 0, followers: [] });
            if (!window.currentUser.customBorder) await window.fs.updateDoc(userRef, { customBorder: { c1: '#ff0050', c2: '#00f2fe', grad: true } });
            if (!window.currentUser.dmPrivacy) window.currentUser.dmPrivacy = 'everyone'; 
        }
        localStorage.setItem('phil_session', JSON.stringify(window.currentUser));
        document.getElementById('login-screen').classList.remove('show');
        if(window.initLiveDatabase) window.initLiveDatabase();
        window.initLiveUser();
        if(window.initInbox) window.initInbox();
        if(window.initInboxChats) window.initInboxChats();
        window.initSearchUsers();
        if(window.LiveManager) window.LiveManager.init();
        window.checkDailyStreak();
    } catch (error) { window.showCustomAlert("Login Fehler", "Datenbank-Fehler beim Login."); }
});

let isRegisterMode = false;
let generatedOTP = null;
let pendingRegData = null;

window.sendEmailOTP = async function(email, code) {
    try {
        if(typeof emailjs !== 'undefined') {
            const expirationTime = new Date(Date.now() + 15 * 60000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
            await emailjs.send(window.EMAILJS_SERVICE_ID, window.EMAILJS_TEMPLATE_ID, { to_email: email, passcode: code, time: expirationTime });
            window.showToast("Code an E-Mail gesendet! 📧");
        } else { window.showToast("EmailJS fehlt. Code in Konsole."); }
    } catch (err) { window.showToast("Email-Versand Fehler."); }
};

document.getElementById('auth-switch-register-btn')?.addEventListener('click', (e) => {
    isRegisterMode = !isRegisterMode;
    document.getElementById('auth-username').style.display = isRegisterMode ? 'block' : 'none';
    document.getElementById('auth-login-btn').innerText = isRegisterMode ? "Registrieren" : "Einloggen";
    e.target.innerText = isRegisterMode ? "Zurück zum Login" : "Neuen Account erstellen";
});

document.getElementById('auth-login-btn')?.addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const username = document.getElementById('auth-username').value.trim().toLowerCase();
    const btn = document.getElementById('auth-login-btn');

    if(!email || !password) return window.showCustomAlert("Fehler", "Bitte alle Felder ausfüllen.");
    btn.disabled = true; btn.innerText = "Lädt...";

    try {
        if(isRegisterMode) {
            if(password.length < 6) throw new Error("Passwort muss mind. 6 Zeichen lang sein.");
            if(username.length < 3) throw new Error("Benutzername muss mind. 3 Zeichen lang sein.");
            const nameSnap = await window.fs.getDocs(window.fs.query(window.fs.collection(window.db, "users"), window.fs.where("username", "==", username)));
            if (!nameSnap.empty) throw new Error("Dieser Benutzername ist bereits vergeben.");

            generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
            pendingRegData = { email, password, username };
            await window.sendEmailOTP(email, generatedOTP);

            document.getElementById('login-input-section').style.display = 'none';
            document.getElementById('google-login-container').style.display = 'none';
            document.getElementById('otp-section').style.display = 'flex';
        } else {
            const userCredential = await window.fAuth.signInWithEmailAndPassword(window.auth, email, password);
            const userDoc = await window.fs.getDoc(window.fs.doc(window.db, "users", userCredential.user.uid));
            if(userDoc.exists()) {
                window.currentUser = userDoc.data();
                if (window.currentUser.banned) { window.auth.signOut(); throw new Error("Dein Account wurde gesperrt."); }
                localStorage.setItem('phil_session', JSON.stringify(window.currentUser));
                document.getElementById('login-screen').classList.remove('show');
                window.location.reload();
            } else { throw new Error("Benutzerdaten nicht gefunden."); }
        }
    } catch (error) {
        let msg = error.message;
        if(error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') msg = "E-Mail oder Passwort ist falsch.";
        if(error.code === 'auth/invalid-email') msg = "Ungültige E-Mail Adresse.";
        if(error.code === 'auth/email-already-in-use') msg = "Diese E-Mail ist bereits registriert.";
        window.showCustomAlert("Fehler", msg);
    } finally { btn.disabled = false; btn.innerText = isRegisterMode ? "Registrieren" : "Einloggen"; }
});

document.getElementById('auth-cancel-btn')?.addEventListener('click', () => {
    generatedOTP = null; pendingRegData = null;
    document.getElementById('auth-otp').value = '';
    document.getElementById('otp-section').style.display = 'none';
    document.getElementById('login-input-section').style.display = 'flex';
    document.getElementById('google-login-container').style.display = 'block';
});

document.getElementById('auth-verify-btn')?.addEventListener('click', async () => {
    const inputCode = document.getElementById('auth-otp').value.trim();
    if(inputCode !== generatedOTP) return window.showCustomAlert("Falscher Code", "Der eingegebene Code ist inkorrekt.");
    const btn = document.getElementById('auth-verify-btn'); btn.disabled = true; btn.innerText = "Erstelle Account...";

    try {
        const userCredential = await window.fAuth.createUserWithEmailAndPassword(window.auth, pendingRegData.email, pendingRegData.password);
        const uid = userCredential.user.uid;
        const newUser = { uid: uid, displayName: pendingRegData.username, username: pendingRegData.username, email: pendingRegData.email, photoURL: "https://api.dicebear.com/7.x/avataaars/svg?seed=" + uid, bio: "Neu in der Community! 👋", following: [], followers: [], savedVideos: [], blockedUsers: [], socialLinks: { ig: '', yt: '', tw: '', tt: '' }, verified: false, coins: 1000, xp: 0, streak: 1, profileViews: 0, isAdmin: false, banned: false, decorations: [], activeBorder: "", stories: [], appTheme: 'default', dmPrivacy: 'everyone', philPlusTier: 0, lastLogin: new Date().toDateString(), lastActive: Date.now(), customBorder: { c1: '#ff0050', c2: '#00f2fe', grad: true } };

        await window.fs.setDoc(window.fs.doc(window.db, "users", uid), newUser);
        window.currentUser = newUser;
        localStorage.setItem('phil_session', JSON.stringify(window.currentUser));
        window.showToast("Erfolgreich registriert! 🎉");
        document.getElementById('login-screen').classList.remove('show');
        window.location.reload(); 
    } catch (error) {
        let msg = "Fehler bei der Registrierung.";
        if(error.code === 'auth/email-already-in-use') msg = "Diese E-Mail Adresse ist bereits vergeben!";
        window.showCustomAlert("Registrierung fehlgeschlagen", msg);
        document.getElementById('auth-cancel-btn').click();
    } finally { btn.disabled = false; btn.innerText = "Code Bestätigen"; }
});

window.updateAccountSecurity = async function() {
    const newEmail = document.getElementById('settings-email-input').value.trim();
    const newPass = document.getElementById('settings-pass-input').value;
    const confirmPass = document.getElementById('settings-pass-confirm').value;
    if (!newEmail && !newPass) return window.showToast("Keine Änderungen eingetragen.");

    const user = window.auth.currentUser;
    if(!user && (newEmail || newPass)) return window.showCustomAlert("Sicherheit", "Bitte melde dich erneut an, um sensible Daten zu ändern.");

    try {
        let updates = {};
        if (newEmail) {
            if (!newEmail.includes('@')) return window.showCustomAlert("Fehler", "Ungültige E-Mail Adresse.");
            await window.fAuth.updateEmail(user, newEmail);
            updates.email = newEmail;
        }
        if (newPass) {
            if (newPass.length < 6) return window.showCustomAlert("Fehler", "Passwort muss mind. 6 Zeichen haben.");
            if (newPass !== confirmPass) return window.showCustomAlert("Fehler", "Passwörter stimmen nicht überein.");
            await window.fAuth.updatePassword(user, newPass);
        }
        if(Object.keys(updates).length > 0) {
            await window.fs.updateDoc(window.fs.doc(window.db, "users", window.currentUser.uid), updates);
            window.currentUser = { ...window.currentUser, ...updates };
            localStorage.setItem('phil_session', JSON.stringify(window.currentUser));
        }
        window.showToast("Sicherheitsdaten aktualisiert! 🛡️");
        document.getElementById('settings-email-input').value = ""; document.getElementById('settings-pass-input').value = ""; document.getElementById('settings-pass-confirm').value = "";
    } catch (e) {
        if(e.code === 'auth/requires-recent-login') window.showCustomAlert("Sicherheit", "Bitte logge dich kurz aus und wieder ein, um diese Daten zu ändern.");
        else window.showCustomAlert("Fehler", "Daten konnten nicht gespeichert werden.");
    }
};