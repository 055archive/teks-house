/**
 * Firebase Firestore Synchronization Module
 * Mendukung sinkronisasi cloud real-time antar perangkat HP/Laptop
 * dengan fallback otomatis ke LocalStorage jika offline atau belum diatur.
 */

// State konfigurasi Firebase
let firebaseApp = null;
let firestoreDb = null;
let isCloudSyncActive = false;
let unsubscribers = [];

const FIREBASE_CONFIG_KEY = 'sewa_apartemen_firebase_config';

// Mengambil konfigurasi tersimpan
function getSavedFirebaseConfig() {
  try {
    const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error("Gagal membaca firebase config:", e);
    return null;
  }
}

// Menyimpan konfigurasi Firebase baru
function saveFirebaseConfig(configObj) {
  try {
    localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(configObj));
    return true;
  } catch (e) {
    console.error("Gagal menyimpan firebase config:", e);
    return false;
  }
}

// Inisialisasi Firebase
async function initFirebaseSync(onDataChangedCallback) {
  const config = getSavedFirebaseConfig();
  const statusBadge = document.getElementById('cloudSyncStatusBadge');
  const statusText = document.getElementById('cloudSyncStatusText');

  if (!config || !config.apiKey || !config.projectId) {
    updateCloudStatusUI('local', 'Penyimpanan Lokal (Offline)');
    return false;
  }

  try {
    // Memuat Firebase via modular CDN jika belum ada
    if (!window.firebaseModular) {
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js');
      const { 
        getFirestore, 
        collection, 
        onSnapshot, 
        doc, 
        setDoc, 
        deleteDoc, 
        getDocs,
        query,
        orderBy
      } = await import('https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js');
      
      window.firebaseModular = {
        initializeApp,
        getFirestore,
        collection,
        onSnapshot,
        doc,
        setDoc,
        deleteDoc,
        getDocs,
        query,
        orderBy
      };
    }

    const { initializeApp, getFirestore, collection, onSnapshot, doc, setDoc } = window.firebaseModular;

    firebaseApp = initializeApp(config, 'sewa-apartemen-app');
    firestoreDb = getFirestore(firebaseApp);
    isCloudSyncActive = true;

    updateCloudStatusUI('cloud', 'Tersambung Cloud (Firebase)');

    // Listen real-time ke koleksi rentals & expenses
    listenToCloudCollection('rentals', (items) => {
      if (onDataChangedCallback) onDataChangedCallback('rentals', items);
    });

    listenToCloudCollection('expenses', (items) => {
      if (onDataChangedCallback) onDataChangedCallback('expenses', items);
    });

    listenToCloudCollection('units', (items) => {
      if (onDataChangedCallback) onDataChangedCallback('units', items);
    });

    return true;
  } catch (err) {
    console.warn("Gagal inisialisasi Firebase:", err);
    updateCloudStatusUI('error', 'Gagal Sambung Cloud (Mode Lokal)');
    isCloudSyncActive = false;
    return false;
  }
}

function updateCloudStatusUI(type, text) {
  const badge = document.getElementById('cloudSyncStatusBadge');
  const label = document.getElementById('cloudSyncStatusText');
  if (!badge || !label) return;

  label.innerText = text;
  badge.className = 'w-2.5 h-2.5 rounded-full';
  
  if (type === 'cloud') {
    badge.classList.add('bg-emerald-500', 'animate-pulse');
  } else if (type === 'local') {
    badge.classList.add('bg-amber-400');
  } else {
    badge.classList.add('bg-rose-500');
  }
}

// Subscribe real-time
function listenToCloudCollection(collectionName, callback) {
  if (!isCloudSyncActive || !firestoreDb || !window.firebaseModular) return;
  const { collection, onSnapshot } = window.firebaseModular;

  try {
    const unsub = onSnapshot(collection(firestoreDb, collectionName), (snapshot) => {
      const items = [];
      snapshot.forEach(docSnap => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      callback(items);
    }, (error) => {
      console.error(`Error listen to ${collectionName}:`, error);
    });
    unsubscribers.push(unsub);
  } catch (e) {
    console.error("Error setting listener:", e);
  }
}

// Simpan dokumen ke Cloud & Local
async function syncSaveDocument(collectionName, id, data) {
  if (isCloudSyncActive && firestoreDb && window.firebaseModular) {
    try {
      const { doc, setDoc } = window.firebaseModular;
      await setDoc(doc(firestoreDb, collectionName, String(id)), data, { merge: true });
    } catch (e) {
      console.error(`Gagal sync ke cloud (${collectionName}):`, e);
    }
  }
}

// Hapus dokumen di Cloud
async function syncDeleteDocument(collectionName, id) {
  if (isCloudSyncActive && firestoreDb && window.firebaseModular) {
    try {
      const { doc, deleteDoc } = window.firebaseModular;
      await deleteDoc(doc(firestoreDb, collectionName, String(id)));
    } catch (e) {
      console.error(`Gagal delete di cloud (${collectionName}):`, e);
    }
  }
}
