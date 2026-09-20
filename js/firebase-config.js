// ============================================================
//  CONFIGURACIÓN DE FIREBASE
//  ⚠️  Reemplaza los valores con los de tu proyecto Firebase
//  Consulta el README.md para instrucciones detalladas
// ============================================================

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Inicializar Firebase
try {
  firebase.initializeApp(firebaseConfig);
} catch (e) {
  if (e.code !== 'app/duplicate-app') {
    console.error('Error inicializando Firebase:', e);
  }
}

const db = firebase.firestore();
const auth = firebase.auth();

// Advertencia si no está configurado
if (firebaseConfig.apiKey === "YOUR_API_KEY") {
  document.addEventListener('DOMContentLoaded', () => {
    const banner = document.createElement('div');
    banner.id = 'config-banner';
    banner.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
      'background:#f59e0b', 'color:#1a0f00', 'text-align:center',
      'padding:12px 24px', 'font-size:13px', 'font-family:monospace',
      'font-weight:600', 'letter-spacing:0.02em'
    ].join(';');
    banner.innerHTML = `⚠️  Firebase no está configurado. Actualiza <code style="background:rgba(0,0,0,0.15);padding:2px 6px;border-radius:4px">js/firebase-config.js</code> con tu configuración real. Consulta el README.md`;
    document.body.prepend(banner);
    // Adjust sticky nav
    const nav = document.querySelector('nav');
    if (nav) nav.style.top = banner.offsetHeight + 'px';
  });
}
