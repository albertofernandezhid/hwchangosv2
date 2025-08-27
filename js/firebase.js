// Rellena con tu configuración
const firebaseConfig = {
    apiKey: "AIzaSyDCGk5ASSxPJJp02PICpqnm9ne65VjUjbY",
    authDomain: "hwchangos.firebaseapp.com",
    projectId: "hwchangos",
    storageBucket: "hwchangos.firebasestorage.app",
    messagingSenderId: "835516966602",
    appId: "1:835516966602:web:77efd381f23be28fb83633"
  };
  
  // Init
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db   = firebase.firestore();
  
  // Persistencia: importante en páginas estáticas
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  
  // Sesión anónima automática para participantes (si no hay sesión)
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      try {
        await auth.signInAnonymously();
      } catch (e) {
        console.error("Anon auth error:", e);
      }
    }
  });
  
  // Helper: es admin si no es anónimo
  async function isAdminUser() {
    const u = auth.currentUser;
    return !!u && !u.isAnonymous;
  }
  
  // Exponer en window por simplicidad
  window._fb = { auth, db, isAdminUser };
  