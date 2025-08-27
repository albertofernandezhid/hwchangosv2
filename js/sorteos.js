const { db, auth } = window._fb;

/* ========== INDEX ========== */
const contActivos = document.getElementById("sorteos-activos");
const contFinal   = document.getElementById("sorteos-finalizados");
const finalWrap   = document.getElementById("finalizados-wrapper");
const toggleFinal = document.getElementById("toggle-finalizados");

if (toggleFinal) {
  toggleFinal.addEventListener("change", () => {
    finalWrap.classList.toggle("hidden", !toggleFinal.checked);
  });
}

if (contActivos) {
  db.collection("sorteos")
    .orderBy("creado", "desc")
    .onSnapshot(snap => {
      const activos = [];
      const finalz  = [];
      snap.forEach(doc => {
        const s = { id: doc.id, ...doc.data() };
        const card = renderSorteoCard(s);
        if (isOngoing(s)) activos.push(card);
        else if (s.estado === "finalizado" || (s.fin && new Date(s.fin.toDate ? s.fin.toDate() : s.fin) < now()))
          finalz.push(card);
      });
      contActivos.innerHTML = "";
      activos.forEach(c => contActivos.appendChild(c));
      if (contFinal) {
        contFinal.innerHTML = "";
        finalz.forEach(c => contFinal.appendChild(c));
      }
    });
}

function renderSorteoCard(s) {
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `
    <img src="${s.imagen || 'assets/default.png'}" alt="img" />
    <h3>${s.titulo || 'Sorteo'}</h3>
    <p class="muted">${s.descripcion ? s.descripcion.slice(0,120) : ''}</p>
    <p><span class="badge">${humanEstado(s)}</span></p>
    <a class="btn primary" href="sorteo.html?id=${s.id}">Entrar</a>
  `;
  return el;
}

/* ========== ADMIN ========== */
const crearForm = document.getElementById("crear-sorteo-form");
const adminList = document.getElementById("admin-sorteos");

if (crearForm) {
  crearForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("#sorteoId").value || null;
    const data = {
      titulo: $("#titulo").value.trim(),
      descripcion: $("#descripcion").value.trim(),
      imagen: $("#imagen").value.trim() || "assets/default.png",
      precio: parseFloat($("#precio").value),
      tlf: $("#tlf").value.trim(),
      maxNumeros: Math.max(10, Math.min(100, parseInt($("#maxNumeros").value || "100", 10))),
      inicio: $("#inicio").value ? toTimestamp(fromInputDateTimeLocal($("#inicio").value)) : null,
      fin: $("#fin").value ? toTimestamp(fromInputDateTimeLocal($("#fin").value)) : null,
      estado: $("#estado").value || "activo",
      actualizado: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!id) {
      const user = auth.currentUser;
      data.creado = firebase.firestore.FieldValue.serverTimestamp();
      data.ownerId = user?.uid || null;
      const ref = await db.collection("sorteos").add(data);
      await initNumeros(ref.id, data.maxNumeros);
      alert("Sorteo creado");
      crearForm.reset();
      $("#maxNumeros").value = 100;
    } else {
      await db.collection("sorteos").doc(id).update(data);
      alert("Sorteo actualizado");
    }
  });

  $("#reset-form-btn").addEventListener("click", () => {
    crearForm.reset();
    $("#sorteoId").value = "";
    $("#maxNumeros").value = 100;
  });
}

async function initNumeros(sorteoId, max) {
  const batch = db.batch();
  for (let i = 0; i < max; i++) {
    const num = pad2(i);
    const ref = db.collection("sorteos").doc(sorteoId).collection("numeros").doc(num);
    batch.set(ref, {
      asignadoA: null,
      nombre: null,
      pagado: false,
      reservadoPor: null,
      reservaHasta: null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
  await batch.commit();
}

if (adminList) {
  const user = auth.currentUser;
  db.collection("sorteos")
    .where("ownerId", "==", user?.uid || null)
    .orderBy("creado", "desc")
    .onSnapshot(snap => {
      adminList.innerHTML = "";
      snap.forEach(doc => {
        const s = { id: doc.id, ...doc.data() };
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
          <img src="${s.imagen || 'assets/default.png'}" alt="" />
          <h3>${s.titulo}</h3>
          <p class="muted">${humanEstado(s)} · ${s.maxNumeros} números</p>
          <div class="row" style="gap:8px; margin-top:8px;">
            <a class="btn" href="sorteo.html?id=${s.id}">Abrir</a>
            <button class="btn" data-edit="${s.id}">Editar</button>
            <button class="btn danger" data-del="${s.id}">Borrar</button>
          </div>
        `;
        adminList.appendChild(card);

        card.querySelector(`[data-edit="${s.id}"]`).addEventListener("click", () => loadIntoForm(s));
        card.querySelector(`[data-del="${s.id}"]`).addEventListener("click", async () => {
          if (confirm("¿Borrar sorteo y sus números?")) {
            await deleteSorteoDeep(s.id);
          }
        });
      });
    });
}

function loadIntoForm(s){
  $("#sorteoId").value = s.id;
  $("#titulo").value = s.titulo || "";
  $("#descripcion").value = s.descripcion || "";
  $("#imagen").value = s.imagen || "";
  $("#precio").value = s.precio ?? 0;
  $("#tlf").value = s.tlf || "";
  $("#maxNumeros").value = s.maxNumeros ?? 100;
  $("#inicio").value = s.inicio ? toInputDateTimeLocal(s.inicio.toDate()) : "";
  $("#fin").value = s.fin ? toInputDateTimeLocal(s.fin.toDate()) : "";
  $("#estado").value = s.estado || "activo";
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteSorteoDeep(id){
  // Borrar subcolección numeros por lotes
  const col = db.collection("sorteos").doc(id).collection("numeros");
  const snap = await col.get();
  const batches = [];
  let batch = db.batch();
  let count = 0;
  snap.forEach(doc => {
    batch.delete(doc.ref);
    count++;
    if (count % 400 === 0) { batches.push(batch.commit()); batch = db.batch(); }
  });
  batches.push(batch.commit());
  await Promise.all(batches);
  await db.collection("sorteos").doc(id).delete();
}
