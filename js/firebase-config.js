// ==========================================
// js/firebase-config.js
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, updateDoc, increment, addDoc, arrayUnion, arrayRemove, deleteDoc, onSnapshot, query, orderBy, where, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateEmail, updatePassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const firebaseConfig = { 
    apiKey: "AIzaSyAF-QW_MtVBkImqh1gXwhKrc2pLLCAe3Ek", 
    authDomain: "phil-shorts.firebaseapp.com", 
    projectId: "phil-shorts", 
    storageBucket: "phil-shorts.firebasestorage.app", 
    messagingSenderId: "785802511451", 
    appId: "1:785802511451:web:c7aabd40a4a8ea89616b7e", 
    measurementId: "G-ZCTKSM7EGJ" 
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const supabaseUrl = 'https://smxxafxqtehgegyziplm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNteHhhZnhxdGVoZ2VneXppcGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NDAxNTQsImV4cCI6MjA5MDExNjE1NH0.sZ1Oasg08RLluHjFavz6cR-dntcgAQboAUdMsfVqYBY';
const supabase = createClient(supabaseUrl, supabaseKey);

// Globale Variablen & API Keys für das ganze Projekt
window.GIPHY_API_KEY = "Vj2uCqfOmAT1sXEKQgQvneGy60VIxgCk";
window.EMAILJS_SERVICE_ID = "service_0w0m1ns";
window.EMAILJS_TEMPLATE_ID = "template_ae1lp14";

window.db = db;
window.auth = auth;
window.supabase = supabase;

window.fs = { collection, getDocs, doc, setDoc, getDoc, updateDoc, increment, addDoc, arrayUnion, arrayRemove, deleteDoc, onSnapshot, query, orderBy, where, limit };
window.fAuth = { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateEmail, updatePassword };

window.allVideosData = [];
window.allKnownUsers = [];
window.currentUser = JSON.parse(localStorage.getItem('phil_session'));
if (window.currentUser) window.currentUser.verified = false;
window.notifSettings = JSON.parse(localStorage.getItem('phil_notif_settings')) || { master: false, comments: true, likes: true, dms: true, follows: true };

window.editingProfileUid = null;
window.globalMuted = false;
window.globalVolume = 1;
window.linkPreviewCache = window.linkPreviewCache || {};
window.cropperInstance = null;
window.sessionInterests = {};
window.creatorAffinities = {};
window.selectedLibrarySound = null; 
window.soundPreviewPlayer = new Audio();
window.soundRequestFile = null;