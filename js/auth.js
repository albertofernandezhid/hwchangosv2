const { auth, isAdminUser } = window._fb;

// Login page
const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const pass  = document.getElementById("password").value.trim();
    const msgEl = document.getElementById("login-msg");
    msgEl.textContent = "";
    try {
      await auth.signInWithEmailAndPassword(email, pass);
      window.location.href = "admin.html";
    } catch (err) {
      msgEl.textContent = "Error: " + err.message;
    }
  });
}

// Topbar controls shared
const loginLink = document.getElementById("login-link");
const logoutBtn = document.getElementById("logout-btn");
const adminLink = document.getElementById("admin-link");

auth.onAuthStateChanged(async (user) => {
  const admin = await isAdminUser();
  if (loginLink) loginLink.classList.toggle("hidden", !!user && !user.isAnonymous);
  if (logoutBtn) logoutBtn.classList.toggle("hidden", !user || user.isAnonymous);
  if (adminLink) adminLink.classList.toggle("hidden", !admin);

  // Protect admin.html
  if (location.pathname.endsWith("admin.html")) {
    if (!user || user.isAnonymous) {
      location.href = "login.html";
    }
  }
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await auth.signOut();
    location.href = "index.html";
  });
}
