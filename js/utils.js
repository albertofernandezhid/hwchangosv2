function $(sel, ctx=document){ return ctx.querySelector(sel); }
function $all(sel, ctx=document){ return Array.from(ctx.querySelectorAll(sel)); }

function fmtDate(ts){
  if (!ts) return "—";
  const d = (ts instanceof Date) ? ts : ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString();
}

function pad2(n){ return n.toString().padStart(2, "0"); }

function now(){ return new Date(); }

function toTimestamp(d){
  return firebase.firestore.Timestamp.fromDate(d);
}

function fromInputDateTimeLocal(inputValue){
  // "YYYY-MM-DDTHH:mm"
  if (!inputValue) return null;
  return new Date(inputValue);
}

function toInputDateTimeLocal(d){
  if (!d) return "";
  const z = (d instanceof Date) ? d : d.toDate();
  const pad = (n)=>n.toString().padStart(2,'0');
  return `${z.getFullYear()}-${pad(z.getMonth()+1)}-${pad(z.getDate())}T${pad(z.getHours())}:${pad(z.getMinutes())}`;
}

function phoneLink(tlf){
  if (!tlf) return "#";
  const cleaned = String(tlf).replace(/\s+/g,"");
  return `https://wa.me/34${cleaned}`;
}

function isOngoing(s){
  const nowMs = now().getTime();
  const ini = s.inicio?.toDate ? s.inicio.toDate().getTime() : (s.inicio ? new Date(s.inicio).getTime() : null);
  const fin = s.fin?.toDate ? s.fin.toDate().getTime() : (s.fin ? new Date(s.fin).getTime() : null);
  if (s.estado === "finalizado") return false;
  if (ini && nowMs < ini) return false;
  if (fin && nowMs > fin) return false;
  return s.estado !== "pausado";
}

function humanEstado(s){
  if (s.estado === "finalizado") return "Finalizado";
  if (!isOngoing(s)){
    const nowMs = now().getTime();
    const ini = s.inicio?.toDate ? s.inicio.toDate().getTime() : (s.inicio ? new Date(s.inicio).getTime() : null);
    const fin = s.fin?.toDate ? s.fin.toDate().getTime() : (s.fin ? new Date(s.fin).getTime() : null);
    if (ini && nowMs < ini) return "Pendiente de inicio";
    if (fin && nowMs > fin) return "Finalizado (por fecha)";
    if (s.estado === "pausado") return "Pausado";
  }
  return "Activo";
}
