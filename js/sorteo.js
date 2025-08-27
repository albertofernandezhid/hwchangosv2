const { db, auth, isAdminUser } = window._fb;

const params = new URLSearchParams(location.search);
const sorteoId = params.get("id");

const grid = document.getElementById("numeros-grid");
const asignarBtn = document.getElementById("asignar-btn");
const desasignarBtn = document.getElementById("desasignar-btn");
const limpiarBtn = document.getElementById("limpiar-seleccion-btn");
const nombreInput = document.getElementById("nombre-participante");
const adminTools = document.getElementById("admin-tools");
const msgEl = document.getElementById("msg");

let maxNumeros = 100;
let seleccionados = new Set();
let isAdmin = false;
let currentUser = null;
let sorteoData = null;

auth.onAuthStateChanged(async (u) => {
  currentUser = u;
  isAdmin = await isAdminUser();
  adminTools.classList.toggle("hidden", !isAdmin);
});

const sorteoRef = db.collection("sorteos").doc(sorteoId);
const numerosRef = sorteoRef.collection("numeros");

// Carga cabecera sorteo
sorteoRef.onSnapshot(doc => {
  if (!doc.exists) { alert("Sorteo no encontrado"); location.href="index.html"; return; }
  const s = doc.data();
  sorteoData = s;
  document.getElementById("sorteo-titulo").textContent = s.titulo || "Sorteo";
  document.getElementById("sorteo-imagen").src = s.imagen || "assets/default.png";
  document.getElementById("sorteo-descripcion").textContent = s.descripcion || "";
  document.getElementById("sorteo-precio").textContent = s.precio ?? "—";
  const tlfEl = document.getElementById("sorteo-tlf");
  tlfEl.textContent = s.tlf || "—";
  tlfEl.href = phoneLink(s.tlf);

  maxNumeros = s.maxNumeros || 100;
  document.getElementById("sorteo-estado").textContent = humanEstado(s);
  const f = [];
  if (s.inicio) f.push(`Inicio: ${fmtDate(s.inicio)}`);
  if (s.fin)    f.push(`Fin: ${fmtDate(s.fin)}`);
  document.getElementById("sorteo-fechas").textContent = f.join(" · ");

  renderGrid(maxNumeros);
});

// Render básico de la cuadrícula
function renderGrid(max){
  grid.innerHTML = "";
  const cols = Math.min(10, max); // Config base 10 columnas
  grid.style.gridTemplateColumns = `repeat(${Math.min(10, cols)}, 1fr)`;
  for (let i = 0; i < max; i++){
    const num = pad2(i);
    const div = document.createElement("div");
    div.className = "cell";
    div.dataset.num = num;
    div.textContent = num;
    div.addEventListener("click", ()=> onCellClick(num, div));
    grid.appendChild(div);
  }
}

// Escucha en tiempo real del estado de números
numerosRef.onSnapshot((snap) => {
  const nowTime = now();
  snap.docChanges().forEach(ch => {
    const num = ch.doc.id;
    const d = ch.doc.data();
    const el = grid.querySelector(`[data-num="${num}"]`);
    if (!el) return;

    el.classList.remove("asignado","reservado","seleccionado","propio","pagado");
    el.title = "";

    const reservaActiva = d.reservaHasta && d.reservaHasta.toDate() > nowTime;

    if (d.asignadoA) {
      el.classList.add("asignado");
      el.title = d.nombre ? `Asignado a ${d.nombre}` : "Asignado";
      if (d.asignadoA === currentUser?.uid) el.classList.add("propio");
      if (d.pagado) el.classList.add("pagado");
    } else if (reservaActiva) {
      el.classList.add("reservado");
      if (d.reservadoPor === currentUser?.uid) {
        // Tu reserva
        el.classList.add("propio");
        if (seleccionados.has(num)) el.classList.add("seleccionado");
      }
    } else {
      // libre
      if (seleccionados.has(num)) el.classList.add("seleccionado");
    }
  });
});

async function onCellClick(num, el){
  // No se puede interactuar si sorteo no está activo
  if (!isOngoing(sorteoData)) {
    showMsg("Este sorteo no está activo ahora.", true);
    return;
  }
  // Si asignado o reservado por otro, no permitir
  const ref = numerosRef.doc(num);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.exists ? snap.data() : {};
      const nowDate = now();
      const reservaActiva = d.reservaHasta && d.reservaHasta.toDate() > nowDate;

      // Si asignado por cualquiera, bloquear click
      if (d.asignadoA) return;

      // Si reservado por otro y activo, bloquear
      if (reservaActiva && d.reservadoPor !== currentUser.uid) return;

      // Toggle selección local + reserva
      if (seleccionados.has(num)) {
        // Quitar de selección y liberar reserva si era tuya y no asignado
        seleccionados.delete(num);
        tx.set(ref, {
          reservadoPor: null,
          reservaHasta: null,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } else {
        // Añadir a selección y reservar 2 min si libre o tu reserva caducada/propia
        const hasta = new Date(nowDate.getTime() + 2 * 60 * 1000);
        tx.set(ref, {
          reservadoPor: currentUser.uid,
          reservaHasta: firebase.firestore.Timestamp.fromDate(hasta),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        seleccionados.add(num);
      }
    });
  } catch (e) {
    console.error(e);
  }
}

// Refresca reservas propias para que no caduquen mientras editas (opcional)
// Mantiene vivas solo las de tu selección
setInterval(async () => {
  if (seleccionados.size === 0) return;
  if (!isOngoing(sorteoData)) return;

  const nowDate = now();
  const hasta = new Date(nowDate.getTime() + 2*60*1000);
  const batch = db.batch();
  for (const num of seleccionados) {
    const ref = numerosRef.doc(num);
    batch.set(ref, {
      reservadoPor: currentUser?.uid || null,
      reservaHasta: firebase.firestore.Timestamp.fromDate(hasta),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  await batch.commit();
}, 40 * 1000); // cada 40 s

// Botones
asignarBtn.addEventListener("click", async () => {
  const nombre = nombreInput.value.trim();
  if (!nombre) return showMsg("Introduce tu nombre para asignar.", true);
  if (!isOngoing(sorteoData)) return showMsg("El sorteo no está activo.", true);

  const nums = Array.from(seleccionados);
  if (nums.length === 0) return showMsg("No hay números seleccionados.", true);

  // Asignación con validación de reserva propia vigente
  try {
    await db.runTransaction(async (tx) => {
      for (const num of nums) {
        const ref = numerosRef.doc(num);
        const snap = await tx.get(ref);
        const d = snap.data();
        const nowDate = now();
        const reservaActiva = d.reservaHasta && d.reservaHasta.toDate() > nowDate;
        const libre = !d.asignadoA && (!reservaActiva || d.reservadoPor === currentUser.uid);
        if (!libre) continue; // saltar si lo perdió

        tx.set(ref, {
          asignadoA: currentUser.uid,
          nombre,
          pagado: false,
          reservadoPor: null,
          reservaHasta: null,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    });
    seleccionados.clear();
    showMsg("¡Asignado! Recuerda realizar el Bizum al teléfono indicado.");
  } catch (e) {
    console.error(e);
    showMsg("No se pudieron asignar algunos números.", true);
  }
});

desasignarBtn.addEventListener("click", async () => {
  const nums = Array.from(seleccionados);
  if (nums.length === 0) return showMsg("Selecciona números que tengas asignados.", true);

  try {
    await db.runTransaction(async (tx) => {
      for (const num of nums) {
        const ref = numerosRef.doc(num);
        const snap = await tx.get(ref);
        const d = snap.data();
        if (d.asignadoA === currentUser.uid || isAdmin) {
          tx.set(ref, {
            asignadoA: null,
            nombre: null,
            pagado: false,
            reservadoPor: null,
            reservaHasta: null,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
      }
    });
    seleccionados.clear();
    showMsg("Desasignado.");
  } catch (e) {
    console.error(e);
  }
});

limpiarBtn.addEventListener("click", () => {
  seleccionados.clear();
  // Soltar reservas propias de seleccionados (best-effort, no bloqueante)
  // Esto se hará automáticamente por timeout, pero liberamos antes
  // No hacemos batch aquí para no obstaculizar la UI.
  showMsg("Selección limpiada.");
});

grid.addEventListener("dblclick", async (e) => {
  if (!isAdmin) return;
  const el = e.target.closest(".cell");
  if (!el) return;
  const num = el.dataset.num;
  const ref = numerosRef.doc(num);
  const snap = await ref.get();
  if (!snap.exists) return;
  const d = snap.data();
  if (d.asignadoA) {
    await ref.update({ pagado: !d.pagado, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  }
});

function showMsg(t, error=false){
  if (!msgEl) return;
  msgEl.textContent = t;
  msgEl.style.color = error ? "var(--danger)" : "var(--muted)";
  setTimeout(()=>{ msgEl.textContent=""; }, 4000);
}
