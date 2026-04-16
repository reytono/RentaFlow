const { SUPA_URL, SUPA_KEY } = window.RentaFlowConfig;
// Supabase configuration and REST helpers
const supa = {
  h: { "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" },
  async get(t, q="")  { const r=await fetch(`${SUPA_URL}/rest/v1/${t}?${q}`,{headers:this.h}); if(!r.ok){console.error("GET",t,await r.text());return[];} return r.json(); },
  async post(t, b)    { suprimirRealtime(); const r=await fetch(`${SUPA_URL}/rest/v1/${t}`,{method:"POST",headers:this.h,body:JSON.stringify(b)}); const txt=await r.text(); if(!r.ok){console.error("POST",t,txt);return null;} try{const d=JSON.parse(txt);return Array.isArray(d)?d[0]:d;}catch{return null;} },
  async patch(t, id, b){ suprimirRealtime(); const r=await fetch(`${SUPA_URL}/rest/v1/${t}?id=eq.${id}`,{method:"PATCH",headers:this.h,body:JSON.stringify(b)}); const txt=await r.text(); if(!r.ok){console.error("PATCH",t,txt);return null;} try{const d=JSON.parse(txt);return Array.isArray(d)?d[0]:d;}catch{return null;} },
  async del(t, id)    { suprimirRealtime(); const r=await fetch(`${SUPA_URL}/rest/v1/${t}?id=eq.${id}`,{method:"DELETE",headers:this.h}); if(!r.ok)console.error("DEL",t,await r.text()); return r.ok; }
};

// DB row → app object converters
const PAGO_META_TOKEN = "__RF_PAGO_META__";
const USER_COLOR_STORAGE_KEY = "rentaflow_user_colors";
const APTO_ORDER_STORAGE_KEY = "rentaflow_apto_order";
const DEPTO_FILTERS_STORAGE_KEY = "rentaflow_depto_filters";
const GASTO_TYPES_STORAGE_KEY = "rentaflow_gasto_types";
const GASTO_CATEGORY_STORAGE_KEY = "rentaflow_gasto_categories";
const GASTO_CIERRES_STORAGE_KEY = "rentaflow_gasto_cierres";
const RESERVA_COLOR_RULES_STORAGE_KEY = "rentaflow_reserva_color_rules";
const DEFAULT_GASTO_TYPES = ["Limpieza", "Accesorios", "Personal"];
const DEFAULT_GASTO_TYPE_FALLBACK = "Accesorios";
const DEFAULT_HORARIO_ENTRADA = "14:01";
const DEFAULT_HORARIO_SALIDA = "10:59";
const DEPTO_FILTER_SEQUENCE = ["todos", "ocupado", "libre", "checkin_hoy", "checkout_hoy", "checkin_manana", "checkout_manana"];
const DEFAULT_RESERVA_COLOR_RULES = {
  superpuesta: "#e05c5c",
  problematica: "#925fe0",
  conDeuda: "",
  saleHoy: "#e07ba0",
  vencida: "#a53232",
  reservaOtroUsuario: "#4a85be"
};
const RESERVA_COLOR_RULE_LABELS = {
  superpuesta: "Reserva superpuesta",
  problematica: "Ingresado e impago",
  conDeuda: "Hay deuda",
  saleHoy: "Sale hoy",
  vencida: "Salida vencida",
  reservaOtroUsuario: "Reserva de otro encargado"
};
function parseComentarioPago(raw) {
  const base = (raw || "").toString().trim();
  if(base.startsWith(PAGO_META_TOKEN)) {
    try {
      const payload = JSON.parse(decodeURIComponent(base.slice(PAGO_META_TOKEN.length)));
      return {
        comentario: payload.comentario || "",
        hayDeuda: !!payload.hayDeuda,
        deudaMonto: Number(payload.deudaMonto) || 0,
        deudaComentario: payload.deudaComentario || "",
        deudaTipo: payload.deudaTipo || "deuda",
        senaMonto: Number(payload.senaMonto) || 0,
        senaComentario: payload.senaComentario || "",
        estadiaLarga: !!payload.estadiaLarga,
        horarioNotas: payload.horarioNotas || "",
        mostrarHorarios: !!payload.mostrarHorarios,
        extensiones: Array.isArray(payload.extensiones) ? payload.extensiones : []
      };
    } catch(e) {}
  }
  return { comentario: base, hayDeuda: false, deudaMonto: 0, deudaComentario: "", deudaTipo: "deuda", senaMonto: 0, senaComentario: "", estadiaLarga: false, horarioNotas: "", mostrarHorarios: false, extensiones: [] };
}
function buildComentarioPago(meta = {}) {
  const payload = {
    comentario: (meta.comentario || "").toString().trim(),
    hayDeuda: !!meta.hayDeuda,
    deudaMonto: Number(meta.deudaMonto) || 0,
    deudaComentario: (meta.deudaComentario || "").toString().trim(),
    deudaTipo: meta.deudaTipo || "deuda",
    senaMonto: Number(meta.senaMonto) || 0,
    senaComentario: (meta.senaComentario || "").toString().trim(),
    estadiaLarga: !!meta.estadiaLarga,
    horarioNotas: (meta.horarioNotas || "").toString().trim(),
    mostrarHorarios: !!meta.mostrarHorarios,
    extensiones: Array.isArray(meta.extensiones) ? meta.extensiones : []
  };
  const hasMeta = payload.comentario || payload.hayDeuda || payload.deudaMonto || payload.deudaComentario || payload.estadiaLarga || payload.horarioNotas || payload.mostrarHorarios || payload.extensiones.length;
  return hasMeta ? PAGO_META_TOKEN + encodeURIComponent(JSON.stringify(payload)) : "";
}
function normalizeUserNameKey(nombre) {
  return String(nombre || "").trim().toLowerCase();
}
function getDeptosPrefsScope() {
  return normalizeUserNameKey(currentUser) || "__anon__";
}
function getPerUserStoredValue(storageKey, validator) {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    const scope = getDeptosPrefsScope();
    if(parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.prototype.hasOwnProperty.call(parsed, scope)) {
      return validator(parsed[scope]);
    }
    return validator(parsed);
  } catch(e) {
    return validator(null);
  }
}
function setPerUserStoredValue(storageKey, value) {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    const scope = getDeptosPrefsScope();
    const next = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    next[scope] = value;
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch(e) {}
}
function normalizeGastoTypeKey(nombre) {
  return String(nombre || "").trim().toLowerCase();
}
function sanitizeGastoTypes(types = []) {
  const deduped = [];
  const seen = new Set();
  types.forEach(raw => {
    const nombre = String(raw || "").trim();
    const key = normalizeGastoTypeKey(nombre);
    if(!key || seen.has(key)) return;
    seen.add(key);
    deduped.push(nombre);
  });
  if(!deduped.length) {
    return [...DEFAULT_GASTO_TYPES];
  }
  if(!deduped.some(t => normalizeGastoTypeKey(t) === normalizeGastoTypeKey(DEFAULT_GASTO_TYPE_FALLBACK))) {
    deduped.push(DEFAULT_GASTO_TYPE_FALLBACK);
  }
  return deduped.sort((a,b) => a.localeCompare(b, "es"));
}
function resolveGastoTypeName(nombre, fallback = DEFAULT_GASTO_TYPE_FALLBACK) {
  const key = normalizeGastoTypeKey(nombre);
  const match = tiposGasto.find(t => normalizeGastoTypeKey(t) === key);
  return match || fallback;
}
function getStoredUserColors() {
  try {
    const raw = localStorage.getItem(USER_COLOR_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch(e) {
    return {};
  }
}
function getStoredGastoTypes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(GASTO_TYPES_STORAGE_KEY) || "[]");
    const sanitized = sanitizeGastoTypes(Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_GASTO_TYPES);
    setStoredGastoTypes(sanitized);
    return sanitized;
  } catch(e) {
    return sanitizeGastoTypes(DEFAULT_GASTO_TYPES);
  }
}
function setStoredGastoTypes(types) {
  try { localStorage.setItem(GASTO_TYPES_STORAGE_KEY, JSON.stringify(sanitizeGastoTypes(types))); } catch(e) {}
}
function getStoredGastoCategories() {
  try { return JSON.parse(localStorage.getItem(GASTO_CATEGORY_STORAGE_KEY) || "{}"); }
  catch(e) { return {}; }
}
function getStoredGastoClosures() {
  try {
    const parsed = JSON.parse(localStorage.getItem(GASTO_CIERRES_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch(e) {
    return [];
  }
}
function setStoredGastoClosures(list) {
  try { localStorage.setItem(GASTO_CIERRES_STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list : [])); } catch(e) {}
}
function getStoredReservaColorRules() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESERVA_COLOR_RULES_STORAGE_KEY) || "{}");
    const base = parsed && typeof parsed === "object" ? parsed : {};
    // Only keep keys that are valid in the current DEFAULT — discard obsolete keys
    const filtered = {};
    for(const key of Object.keys(DEFAULT_RESERVA_COLOR_RULES)) {
      filtered[key] = key in base ? base[key] : DEFAULT_RESERVA_COLOR_RULES[key];
    }
    return filtered;
  } catch(e) {
    return { ...DEFAULT_RESERVA_COLOR_RULES };
  }
}
function setStoredReservaColorRules(nextRules = {}) {
  // Only persist valid keys
  const merged = {};
  for(const key of Object.keys(DEFAULT_RESERVA_COLOR_RULES)) {
    merged[key] = key in nextRules ? nextRules[key] : DEFAULT_RESERVA_COLOR_RULES[key];
  }
  try { localStorage.setItem(RESERVA_COLOR_RULES_STORAGE_KEY, JSON.stringify(merged)); } catch(e) {}
  return merged;
}
function setStoredGastoCategory(id, categoria) {
  if(!id) return;
  const map = getStoredGastoCategories();
  map[String(id)] = resolveGastoTypeName(categoria, DEFAULT_GASTO_TYPE_FALLBACK);
  try { localStorage.setItem(GASTO_CATEGORY_STORAGE_KEY, JSON.stringify(map)); } catch(e) {}
}
function getGastoFormState() {
  return JSON.stringify({
    id: document.getElementById("g_id")?.value || "",
    fecha: document.getElementById("g_fecha")?.value || "",
    usuario: document.getElementById("g_usuario")?.value || "",
    concepto: document.getElementById("g_concepto")?.value || "",
    monto: document.getElementById("g_monto")?.value || "",
    moneda: document.getElementById("g_moneda")?.value || "",
    categoria: document.getElementById("g_categoria")?.value || "",
    notas: document.getElementById("g_notas")?.value || "",
    pagadoPor: document.getElementById("g_pagadopor")?.value || ""
  });
}
function getAptoFormState() {
  return JSON.stringify({
    id: document.getElementById("a_id")?.value || "",
    nombre: document.getElementById("a_nombre")?.value || "",
    desc: document.getElementById("a_desc")?.value || "",
    encargado: document.getElementById("a_encargado")?.value || "",
    wifiUser: document.getElementById("a_wifiUser")?.value || "",
    wifiPass: document.getElementById("a_wifiPass")?.value || ""
  });
}
function setStoredUserColor(nombre, color) {
  const key = normalizeUserNameKey(nombre);
  if(!key) return;
  const colors = getStoredUserColors();
  colors[key] = color || "#4a85be";
  try {
    localStorage.setItem(USER_COLOR_STORAGE_KEY, JSON.stringify(colors));
  } catch(e) {}
}
function deleteStoredUserColor(nombre) {
  const key = normalizeUserNameKey(nombre);
  if(!key) return;
  const colors = getStoredUserColors();
  delete colors[key];
  try {
    localStorage.setItem(USER_COLOR_STORAGE_KEY, JSON.stringify(colors));
  } catch(e) {}
}
function renameStoredUserColor(prevNombre, nextNombre, color) {
  const prevKey = normalizeUserNameKey(prevNombre);
  const nextKey = normalizeUserNameKey(nextNombre);
  if(prevKey && prevKey !== nextKey) deleteStoredUserColor(prevNombre);
  if(nextKey) setStoredUserColor(nextNombre, color);
}
function getStoredAptoOrder() {
  return getPerUserStoredValue(APTO_ORDER_STORAGE_KEY, parsed =>
    Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : []
  );
}
function getStoredDeptoFilters() {
  return getPerUserStoredValue(DEPTO_FILTERS_STORAGE_KEY, parsed =>
    parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  );
}
function persistDeptoFilters() {
  setPerUserStoredValue(DEPTO_FILTERS_STORAGE_KEY, {
    filter: currentFilter || "todos",
    user: currentUserFilter || "",
    search: document.getElementById("buscarDepto")?.value || ""
  });
}
function applyStoredDeptoFilters() {
  const saved = getStoredDeptoFilters();
  const allowedFilters = new Set(["todos", "ocupado", "libre", "checkin_hoy", "checkout_hoy", "checkin_manana", "checkout_manana"]);
  currentFilter = allowedFilters.has(saved.filter) ? saved.filter : "todos";
  currentUserFilter = saved.user || "";
  const searchEl = document.getElementById("buscarDepto");
  if(searchEl) searchEl.value = saved.search || "";
  syncDeptoFilterControls();
  const lbl = document.getElementById("filtroUsuarioLabel");
  const btn = document.getElementById("btnFiltroUsuario");
  if(lbl && btn) {
    if(currentUserFilter) {
      lbl.textContent = currentUserFilter;
      btn.style.borderColor = "var(--gold)";
      btn.style.color = "var(--gold)";
    } else {
      lbl.textContent = "Filtrar por usuario";
      btn.style.borderColor = "";
      btn.style.color = "";
    }
  }
}
function persistAptoSortOrder() {
  setPerUserStoredValue(APTO_ORDER_STORAGE_KEY, aptoSortOrder);
}
function syncAptoSortOrder() {
  const knownIds = new Set(aptos.map(a => a.id));
  const merged = [];
  getStoredAptoOrder().forEach(id => { if(knownIds.has(id) && !merged.includes(id)) merged.push(id); });
  aptos
    .map(a => a.id)
    .sort((a,b) => {
      const na = aptos.find(x => x.id === a)?.nombre || "";
      const nb = aptos.find(x => x.id === b)?.nombre || "";
      return na.localeCompare(nb, "es", { numeric: true });
    })
    .forEach(id => { if(!merged.includes(id)) merged.push(id); });
  aptoSortOrder = merged;
  persistAptoSortOrder();
}
function getDeptoFilterLabel(filter) {
  return ({ todos: "Todos", ocupado: "Ocupado", libre: "Libre", checkin_hoy: "Check in hoy", checkout_hoy: "Check out hoy", checkin_manana: "Check in mañana", checkout_manana: "Check out mañana" })[filter] || "Todos";
}
function syncStatsBarActive() {
  const tabMap = {
    ocupado: "ftbOcupado",
    libre: "ftbLibre",
    checkin_hoy: "ftbCheckinHoy",
    checkout_hoy: "ftbCheckoutHoy",
    checkin_manana: "ftbCheckinManana",
    checkout_manana: "ftbCheckoutManana"
  };
  Object.values(tabMap).forEach(id => {
    const el = document.getElementById(id);
    if(el) el.classList.remove("stat-filter-active");
  });
  const activeId = tabMap[currentFilter];
  if(activeId) {
    const el = document.getElementById(activeId);
    if(el) el.classList.add("stat-filter-active");
  }
}

function syncDeptoFilterControls(activeBtn = null) {
  syncStatsBarActive();
  const mobileLbl = document.getElementById("filtroMovilLabel");
  const mobileBtn = document.getElementById("btnFiltroMovil");
  if(mobileLbl) mobileLbl.textContent = getDeptoFilterLabel(currentFilter);
  if(mobileBtn) mobileBtn.dataset.filter = currentFilter;
}
function cycleDeptoFilter() {
  const idx = DEPTO_FILTER_SEQUENCE.indexOf(currentFilter);
  currentFilter = DEPTO_FILTER_SEQUENCE[(idx + 1) % DEPTO_FILTER_SEQUENCE.length];
  syncDeptoFilterControls();
  persistDeptoFilters();
  renderGrid();
}
async function saveUsuarioRecord(method, payload, id = null) {
  if(method === "post") {
    const created = await supa.post("usuarios", payload);
    if(created) return { record: created, colorPersisted: true };
    const fallbackPayload = { ...payload };
    delete fallbackPayload.color;
    const fallback = await supa.post("usuarios", fallbackPayload);
    return { record: fallback, colorPersisted: false };
  }
  const updated = await supa.patch("usuarios", id, payload);
  if(updated) return { record: updated, colorPersisted: true };
  const fallbackPayload = { ...payload };
  delete fallbackPayload.color;
  const fallback = await supa.patch("usuarios", id, fallbackPayload);
  return { record: fallback, colorPersisted: false };
}
const dbApto = r => ({ id:r.id, nombre:r.nombre, desc:r.descripcion||"", encargado:r.encargado||"", wifiUser:r.wifi_user||"", wifiPass:r.wifi_pass||"" });
const dbRes  = r => { const pagoInfo = parseComentarioPago(r.comentario_pago); return ({ id:r.id, aptoId:r.apto_id, huesped:r.huesped, contacto:r.contacto||"", desde:r.fecha_desde, hasta:r.fecha_hasta, monto:parseFloat(r.monto)||0, estado:r.estado||"pendiente", pago:r.pago||false, ingreso:r.ingreso||false, cobrador:r.cobrador||"", medioPago:r.medio_pago||"", horarioEntrada:r.horario_entrada||DEFAULT_HORARIO_ENTRADA, horarioSalida:r.horario_salida||DEFAULT_HORARIO_SALIDA, cantHuespedes:r.cant_huespedes||0, notas:r.notas||"", comentarioPago:pagoInfo.comentario, hayDeuda:pagoInfo.hayDeuda, deudaMonto:pagoInfo.deudaMonto, deudaComentario:pagoInfo.deudaComentario, deudaTipo:pagoInfo.deudaTipo||"deuda", senaMonto:pagoInfo.senaMonto||0, senaComentario:pagoInfo.senaComentario||"", estadiaLarga:pagoInfo.estadiaLarga, horarioNotas:pagoInfo.horarioNotas||"", mostrarHorarios:pagoInfo.mostrarHorarios||false, reservaDe:r.reserva_de||"", nacionalidad:r.nacionalidad||"", extensiones:pagoInfo.extensiones||[] }); };
const dbHist = r => { const pagoInfo = parseComentarioPago(r.comentario_pago); return ({ id:r.id, aptoId:r.apto_id, huesped:r.huesped||"", contacto:r.contacto||"", desde:r.fecha_desde, hasta:r.fecha_hasta, monto:parseFloat(r.monto)||0, estado:r.estado||"", pago:r.pago||false, cobrador:r.cobrador||"", medioPago:r.medio_pago||"", horarioEntrada:r.horario_entrada||DEFAULT_HORARIO_ENTRADA, horarioSalida:r.horario_salida||DEFAULT_HORARIO_SALIDA, cantHuespedes:r.cant_huespedes||0, notas:r.notas||"", comentarioPago:pagoInfo.comentario, hayDeuda:pagoInfo.hayDeuda, deudaMonto:pagoInfo.deudaMonto, deudaComentario:pagoInfo.deudaComentario, estadiaLarga:pagoInfo.estadiaLarga, horarioNotas:pagoInfo.horarioNotas||"", mostrarHorarios:pagoInfo.mostrarHorarios||false, comentarioCierre:r.comentario_cierre||"", fechaCierre:r.fecha_cierre||"" }); };
const dbUser = r => {
  const storedColors = getStoredUserColors();
  const storedColor = storedColors[normalizeUserNameKey(r.nombre)];
  return ({ id:r.id, nombre:r.nombre, rol:r.rol||"", email:r.email||"", telefono:r.telefono||"", color:r.color||storedColor||"#4a85be", password:"", participaGastos: r.participa_gastos !== false });
};
const dbNota = r => ({ id:r.id, aptoId:r.apto_id, texto:r.texto||"", sortKey:r.sort_key||"9999-12-31" });
const dbLog  = r => ({ fecha:r.fecha, hora:r.hora, accion:r.accion, detalle:r.detalle||"", usuario:r.usuario||"—" });
const dbGasto = r => {
  const storedCats = getStoredGastoCategories();
  return ({ id:r.id, fecha:r.fecha, usuario:r.usuario||"", concepto:r.concepto||"", monto:parseFloat(r.monto)||0, moneda:r.moneda||"ARS", notas:r.notas||"", pagadoPor:r.pagado_por||"", categoria:resolveGastoTypeName(storedCats[String(r.id)]||r.categoria||DEFAULT_GASTO_TYPE_FALLBACK, DEFAULT_GASTO_TYPE_FALLBACK) });
};

// Roles válidos en la app
const ROLES_VALIDOS = ["Administrador", "Colaborador", "Cobrador"];
function normalizarRol(rol) {
  const r = (rol || "").trim().toLowerCase();
  if(r === "admin" || r === "administrador") return "Administrador";
  if(r === "colab" || r === "colaborador") return "Colaborador";
  if(r === "cobrador" || r === "cobranza") return "Cobrador";
  return (rol || "").trim();
}
function usuariosConRolValido() {
  return usuarios.filter(u => ROLES_VALIDOS.includes(normalizarRol(u.rol)));
}
function pagoMetaFromReserva(r) {
  return {
    comentario: r?.comentarioPago || "",
    hayDeuda: !!r?.hayDeuda,
    deudaMonto: Number(r?.deudaMonto) || 0,
    deudaComentario: r?.deudaComentario || "",
    deudaTipo: r?.deudaTipo || "deuda",
    senaMonto: Number(r?.senaMonto) || 0,
    senaComentario: r?.senaComentario || "",
    estadiaLarga: !!r?.estadiaLarga,
    horarioNotas: r?.horarioNotas || "",
    mostrarHorarios: !!r?.mostrarHorarios
  };
}
function hasCustomHorarios(r) {
  return !!((r?.horarioEntrada && r.horarioEntrada !== DEFAULT_HORARIO_ENTRADA) || (r?.horarioSalida && r.horarioSalida !== DEFAULT_HORARIO_SALIDA) || (r?.horarioNotas || "").trim());
}
function fmtHora24(value, fallback = "—:—") {
  const raw = String(value || "").trim();
  if(!raw) return fallback;
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if(!match) return fallback;
  const hh = Math.max(0, Math.min(23, Number(match[1])));
  const mm = Math.max(0, Math.min(59, Number(match[2])));
  return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
}
function normalizeHoraInputValue(raw, fallback = "") {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 4);
  if(!digits) return fallback;
  let hh = digits.slice(0, Math.min(2, digits.length));
  let mm = digits.length > 2 ? digits.slice(2) : "";
  if(mm.length === 1) mm = `${mm}0`;
  if(mm.length === 0) mm = "00";
  const hNum = Math.max(0, Math.min(23, Number(hh || 0)));
  const mNum = Math.max(0, Math.min(59, Number(mm || 0)));
  return `${String(hNum).padStart(2,"0")}:${String(mNum).padStart(2,"0")}`;
}
function setHoraInputFormatted(input, fallback = "") {
  if(!input) return;
  input.value = normalizeHoraInputValue(input.value, fallback);
}
function toggleFieldGroup(containerId, checked, displayMode = "grid") {
  const el = document.getElementById(containerId);
  if(!el) return;
  el.style.display = checked ? displayMode : "none";
}
function toggleDebtFields(containerId, checked) {
  toggleFieldGroup(containerId, checked, "grid");
}
function hexToRgba(hex, alpha) {
  const safe = (hex || "").replace("#","").trim();
  if(safe.length !== 6) return `rgba(74,133,190,${alpha})`;
  const num = parseInt(safe, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
function getReservaRuleColor(key) {
  const val = reservaColorRules?.[key];
  if(val !== undefined) return val;
  return DEFAULT_RESERVA_COLOR_RULES[key] || "";
}
function getReservaHighlightKey(r, opts = {}) {
  if(opts.vencida) return "vencida";
  if(opts.saleHoy) return "saleHoy";
  if(opts.solapada) return "superpuesta";
  if(opts.problematica) return "problematica";
  if(opts.conDeuda) return "conDeuda";
  if(opts.otroUsuario) return "reservaOtroUsuario";
  if(r?.estado === "cancelada") return "cancelada";
  if(r?.estado === "pendiente") return "pendiente";
  return "confirmada";
}
function getReservaActiveKeys(r, opts = {}) {
  const keys = [];
  if(opts.solapada)     keys.push("superpuesta");
  if(opts.problematica) keys.push("problematica");
  if(opts.conDeuda)     keys.push("conDeuda");
  if(opts.otroUsuario)  keys.push("reservaOtroUsuario");
  return keys;
}
function buildReservaCardStyle(key) {
  const color = getReservaRuleColor(key);
  if(!color) return {
    border: "rgba(255,255,255,0.06)",
    borderWidth: "1px",
    bg: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
    bgHover: "rgba(255,255,255,0.035)",
    inset: "none",
    text: "", note: ""
  };
  return {
    border: color,
    borderWidth: "3px",
    bg: hexToRgba(color, 0.12),
    bgHover: hexToRgba(color, 0.18),
    inset: "none",
    text: key === "vencida" ? "#ffd6d6" : "",
    note: key === "vencida" ? "#ffc4c4" : ""
  };
}
function buildReservaCardInlineStyle(key, extraKeys = [], vencida = false, saleHoy = false) {
  // Vencida/saleHoy = solid background, no border treatment
  if(vencida || saleHoy) {
    const color = getReservaRuleColor(vencida ? "vencida" : "saleHoy");
    if(color) {
      const borderColors = extraKeys.map(k => getReservaRuleColor(k)).filter(Boolean);
      let borderStyle = `border:1px solid rgba(255,255,255,0.06);`;
      let shadowStyle = "";
      if(borderColors.length === 1) {
        borderStyle = `border:3px solid ${borderColors[0]};`;
      } else if(borderColors.length > 1) {
        borderStyle = `border:3px solid ${borderColors[0]};`;
        shadowStyle = `box-shadow:${borderColors.slice(1).map((c,i) => `inset 0 0 0 ${(i+1)*3+3}px ${c}`).join(",")};`;
      }
      const textStyle = vencida ? `--rf-card-text:#ffd6d6;--rf-card-note:#ffc4c4;` : "";
      return `${borderStyle}background:${color};--rf-card-hover:${color};${textStyle}${shadowStyle}`;
    }
  }

  const allKeys = [key, ...extraKeys.filter(k => k !== key)];
  const colors = allKeys.map(k => getReservaRuleColor(k)).filter(Boolean);
  let borderStyle, shadowStyle;
  if(colors.length === 0) {
    borderStyle = `border:1px solid rgba(255,255,255,0.06);`;
    shadowStyle = "";
  } else if(colors.length === 1) {
    borderStyle = `border:3px solid ${colors[0]};`;
    shadowStyle = "";
  } else {
    borderStyle = `border:3px solid ${colors[0]};`;
    shadowStyle = `box-shadow:${colors.slice(1).map((c,i) => `inset 0 0 0 ${(i+1)*3+3}px ${c}`).join(",")};`;
  }
  const bgColor = colors[0] ? hexToRgba(colors[0], 0.12) : "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))";
  const bgHover = colors[0] ? hexToRgba(colors[0], 0.18) : "rgba(255,255,255,0.035)";
  return `${borderStyle}background:${bgColor};--rf-card-hover:${bgHover};${shadowStyle}`;
}
function buildEventRowIncidentStyle(key) {
  const color = getReservaRuleColor(key);
  if(!color) return "";
  return `border-left:3px solid ${color};background:linear-gradient(90deg, ${hexToRgba(color, 0.24)}, ${hexToRgba(color, 0.1)});border-color:${hexToRgba(color, 0.55)};box-shadow:inset 0 0 0 1px ${hexToRgba(color, 0.18)};`;
}
function buildReservaStatusStyle(estado) {
  const color = reservaColor(estado);
  if(!color) return "";
  return `background:${hexToRgba(color, 0.16)};color:${color};border-color:${hexToRgba(color, 0.35)};`;
}
function getUserColor(nombre) {
  if(!nombre) return null;
  const key = normalizeUserNameKey(nombre);
  const u = usuarios.find(x => String(x.nombre || "").trim().toLowerCase() === key);
  return u?.color || null;
}
function getReservaOwnerName(reserva) {
  if(!reserva) return "";
  if(reserva.reservaDe) return String(reserva.reservaDe).trim();
  const apto = aptos.find(a => a.id === reserva.aptoId);
  if(apto?.encargado) return String(apto.encargado).trim();
  if(reserva.cobrador) return String(reserva.cobrador).trim();
  return "";
}
function getReservaUserColor(reserva) {
  return getUserColor(getReservaOwnerName(reserva));
}
let overlapNotices = [];
function overlapsRange(desdeA, hastaA, desdeB, hastaB) {
  return String(desdeA) < String(hastaB) && String(desdeB) < String(hastaA);
}
function getReservaOverlapIds(candidate, ignoreId = null) {
  if(!candidate?.aptoId || !candidate?.desde || !candidate?.hasta || candidate.estado === "cancelada") return [];
  return reservas
    .filter(r => r.id !== ignoreId && r.aptoId === candidate.aptoId && r.estado !== "cancelada")
    .filter(r => overlapsRange(candidate.desde, candidate.hasta, r.desde, r.hasta))
    .map(r => r.id);
}
function getReservaCandidateWithChange(r, campo, valor) {
  const candidate = {
    id: r.id,
    aptoId: r.aptoId,
    desde: r.desde,
    hasta: r.hasta,
    estado: r.estado
  };
  if(campo === "aptoId") candidate.aptoId = valor ? parseInt(valor) || null : null;
  if(campo === "desde") candidate.desde = valor;
  if(campo === "hasta") candidate.hasta = valor;
  if(campo === "estado") candidate.estado = valor;
  return candidate;
}
function getNewOverlapIds(originalCandidate, nextCandidate, ignoreId = null) {
  const beforeIds = new Set(getReservaOverlapIds(originalCandidate, ignoreId));
  return getReservaOverlapIds(nextCandidate, ignoreId).filter(id => !beforeIds.has(id));
}
function describeOverlapConflicts(conflictIds) {
  const unique = [];
  conflictIds.forEach(id => {
    const r = reservas.find(x => x.id === id);
    if(!r) {
      const fallback = `#${id}`;
      if(!unique.includes(fallback)) unique.push(fallback);
      return;
    }
    const apto = aptos.find(a => a.id === r.aptoId)?.nombre || "Sin depto";
    const label = `${r.huesped} (${apto} · ${fmt(r.desde)}→${fmt(r.hasta)})`;
    if(!unique.includes(label)) unique.push(label);
  });
  return unique;
}
function renderOverlapNotices() {
  const stack = document.getElementById("overlapNoticeStack");
  if(!stack) return;
  stack.innerHTML = overlapNotices.map(n => `
    <div class="overlap-notice">
      <div class="overlap-notice-title">
        <span>Superposición aprobada</span>
        <button class="overlap-notice-close" onclick="dismissOverlapNotice('${n.id}')">✕</button>
      </div>
      <div class="overlap-notice-body">${n.body}</div>
    </div>
  `).join("");
}
function dismissOverlapNotice(id) {
  overlapNotices = overlapNotices.filter(n => n.id !== id);
  renderOverlapNotices();
}
function addOverlapNotice(body) {
  overlapNotices.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, body });
  renderOverlapNotices();
}
function buildOverlapNoticeBody(candidate, conflictIds) {
  const apto = aptos.find(a => a.id === candidate.aptoId)?.nombre || "Sin depto";
  const conflictos = describeOverlapConflicts(conflictIds).join("<br>");
  return `<strong>${apto}</strong> quedó con una reserva superpuesta para ${fmt(candidate.desde)}→${fmt(candidate.hasta)}.<br>${conflictos}`;
}
function setReservaSaveButtonsDisabled(disabled) {
  ['btnGuardarReserva','btnGuardarReservaRapido'].forEach(function(id){
    var b = document.getElementById(id);
    if(b) { b.disabled = disabled; b.style.opacity = disabled ? '0.5' : ''; }
  });
}

async function cargarDatos() {
  showOverlay(true);
  try {
    const [a,res,h,u,m,n,cfg,gDB,logDB] = await Promise.all([
      supa.get("aptos","order=id"),
      supa.get("reservas","order=fecha_desde"),
      supa.get("historial","order=fecha_cierre.desc"),
      supa.get("usuarios","order=id"),
      supa.get("medios_pago","order=id"),
      supa.get("notas","order=id"),
      supa.get("config",""),
      supa.get("gastos","order=fecha.desc"),
      supa.get("activity_log","order=created_at.desc&limit=1000"),
    ]);
    aptos=a.map(dbApto); syncAptoSortOrder(); reservas=res.map(dbRes); historial=h.map(dbHist);
    usuarios=u.map(dbUser); mediosPago=m.map(r=>({id:r.id,nombre:r.nombre}));
    notas=n.map(dbNota); activityLog=logDB.map(dbLog);
    gastos=gDB.map(dbGasto);
    nextAptoId    = aptos.length    ? Math.max(...aptos.map(x=>x.id))+1    : 1;
    nextReservaId = reservas.length ? Math.max(...reservas.map(x=>x.id))+1 : 1;
    nextUsuarioId = usuarios.length ? Math.max(...usuarios.map(x=>x.id))+1 : 1;
    nextMedioId   = mediosPago.length ? Math.max(...mediosPago.map(x=>x.id))+1 : 1;
    nextNotaId    = notas.length    ? Math.max(...notas.map(x=>x.id))+1    : 1;
    nextGastoId   = gastos.length   ? Math.max(...gastos.map(x=>x.id))+1   : 1;
    const waCfg = cfg.find(c=>c.key==="mensaje_wa");
    if(waCfg) mensajeWA = waCfg.value;
    render();
    actualizarTempBadge();
    iniciarRealtime();
  } catch(e) {
    console.error("cargarDatos:", e);
    toast("⚠️ Error al conectar con Supabase", false);
    render();
  }
  showOverlay(false);
  abrirLogin();
}

function showOverlay(show) {
  let el = document.getElementById("loadingOverlay");
  if(!el) {
    el = document.createElement("div");
    el.id = "loadingOverlay";
    el.style.cssText = "position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:9999;flex-direction:column;gap:12px";
    el.innerHTML = `<div class="logo" style="font-size:2rem">Renta<span>Flow</span></div>
  <div style="font-size:0.8rem;color:var(--text3);margin-top:8px">Cargando datos...</div>
  <div style="margin-top:16px;display:flex;gap:8px">
    <div style="width:60px;height:6px;background:var(--border2);border-radius:3px;animation:pulse 1.2s ease-in-out infinite"></div>
    <div style="width:40px;height:6px;background:var(--border2);border-radius:3px;animation:pulse 1.2s ease-in-out 0.2s infinite"></div>
    <div style="width:50px;height:6px;background:var(--border2);border-radius:3px;animation:pulse 1.2s ease-in-out 0.4s infinite"></div>
  </div>`;
    document.body.appendChild(el);
  }
  el.style.display = show ? "flex" : "none";
}

// ─── DATA ───────────────────────────────────────────────
let aptos = [];
let reservas = [];
let usuarios = [];
let mediosPago = [];
let nextUsuarioId = 1;
let nextMedioId = 1;
let historial = [];
let activityLog = [];
let notas = [];
let nextNotaId = 1;

let nextAptoId = 1;
let nextReservaId = 1;
let gastos = [];
let nextGastoId = 1;
let clientes = [];
let nextClienteId = 1;
let tiposGasto = getStoredGastoTypes();
let gastoClosures = getStoredGastoClosures();
let reservaColorRules = getStoredReservaColorRules();
// Persist cleaned rules back to remove any obsolete keys from storage
setStoredReservaColorRules(reservaColorRules);
let gastosSort = { campo: "fecha", dir: "desc" };
let editingTipoGasto = "";
let _gastoFormSnapshot = "";
let _aptoFormSnapshot = "";
let _guardandoGasto = false;

let currentFilter = "todos";
let currentUserFilter = ""; // empty = show all
const today = new Date();
today.setHours(0,0,0,0);

// ─── HELPERS ────────────────────────────────────────────
// Formato de montos: < 50000 = USD, >= 50000 = pesos
function fmtMonto(n) {
  if(n === null || n === undefined || isNaN(n)) return "—";
  const valor = Number(n);
  const formato = valor.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return valor >= 10000 ? `$ ${formato}` : `U$D ${formato}`;
}
function esPesos(n) { return Number(n) >= 10000; }
function parseMontoInputValue(raw) {
  const cleaned = String(raw ?? "").trim().replace(/U\$D/gi, "").replace(/U\$S/gi, "").replace(/\$/g, "").replace(/\./g, "").replace(/,/g, ".").replace(/[^\d.\-]/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}
function formatMontoEditableValue(raw) {
  const monto = parseMontoInputValue(raw);
  return monto ? fmtMonto(monto) : "";
}
function setMontoInputFormatted(input) {
  if(!input) return;
  input.value = formatMontoEditableValue(input.value);
}
function setMontoInputRaw(input) {
  if(!input) return;
  const monto = parseMontoInputValue(input.value);
  input.value = monto ? String(monto).replace(/\.0+$/,"") : "";
}
function formatMontoByMoneda(raw, moneda = "ARS") {
  const monto = parseMontoInputValue(raw);
  if(!monto) return "";
  const formato = Number(monto).toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return moneda === "USD" ? `U$D ${formato}` : `$ ${formato}`;
}
function setGastoMontoFormatted(input) {
  if(!input) return;
  const moneda = document.getElementById("g_moneda")?.value || "ARS";
  input.value = formatMontoByMoneda(input.value, moneda);
}
function setGastoMontoRaw(input) {
  if(!input) return;
  const monto = parseMontoInputValue(input.value);
  input.value = monto ? String(monto).replace(/\.0+$/,"") : "";
}
function setGastoSaveState(disabled) {
  const saveBtn = document.getElementById("btnGuardarGasto");
  const cancelBtn = document.getElementById("btnCancelarGasto");
  const closeBtn = document.getElementById("btnCerrarGasto");
  if(saveBtn) {
    saveBtn.disabled = disabled;
    saveBtn.textContent = disabled ? "Guardando..." : "✓ Guardar";
  }
  if(cancelBtn) cancelBtn.disabled = disabled;
  if(closeBtn) closeBtn.disabled = disabled;
}
function normalizeCantHuespedesValue(raw) {
  const value = String(raw ?? "").trim();
  if(!value) return 0;
  if(value === "2S") return 2;
  return parseInt(value, 10) || 0;
}
function fmtTelefono(raw) {
  const value = String(raw || "").trim().replace(/\s+/g, " ");
  if(!value) return "";
  const digits = value.replace(/\D/g, "");
  // Always format with + prefix if we have enough digits
  if(digits.startsWith("54") && digits.length >= 12) {
    const rest = digits.slice(2);
    const area = rest.slice(0, 2);
    const middle = rest.slice(2, 6);
    const end = rest.slice(6, 10);
    if(area && middle && end) return `+54 ${area} ${middle} ${end}`;
  }
  if(digits.length >= 11) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 12)}`.trim();
  }
  if(digits.length === 10) return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
  // If no + and short number, add + anyway
  if(digits.length > 0 && !value.startsWith("+")) return `+${value}`;
  return value;
}
const fmt = d => {
  if(!d) return '—';
  const str = (d instanceof Date) ? d.toISOString().slice(0,10) : String(d).slice(0,10);
  const [y,m,dd] = str.split('-');
  return dd + '/' + m + '/' + y;
};
const fmtShort = d => {
  if(!d) return '—';
  const str = (d instanceof Date) ? d.toISOString().slice(0,10) : String(d).slice(0,10);
  const [,m,dd] = str.split('-');
  return dd + '/' + m;
};
const parseDate = s => {
  if(!s) return new Date();
  if(s instanceof Date) return s;
  const str = String(s).slice(0,10);
  const [y,m,d] = str.split('-').map(Number);
  return new Date(y, m-1, d);
};
const diffDays = (a,b) => Math.round((parseDate(b)-parseDate(a))/(1000*60*60*24));

function aptoStatus(id) {
  const rs = reservas.filter(r => r.aptoId === id && r.estado !== "cancelada");
  for(const r of rs) {
    const d = parseDate(r.desde), h = parseDate(r.hasta);
    if(today >= d && today < h) return "ocupado";
  }
  for(const r of rs) {
    const d = parseDate(r.desde);
    const diff = (d - today)/(1000*60*60*24);
    if(diff > 0 && diff <= 7) return "proximamente";
  }
  return "libre";
}

function aptoStatusBadge(id) {
  const rs = reservas
    .filter(r => r.aptoId === id && r.estado !== "cancelada")
    .sort((a,b) => parseDate(a.desde) - parseDate(b.desde));

  // Currently occupied — find who's in and when they leave
  for(const r of rs) {
    const d = parseDate(r.desde), h = parseDate(r.hasta);
    if(today >= d && today < h) {
      const diasSale = Math.round((h - today) / (1000*60*60*24));
      // Is there a next guest right after?
      const next = rs.find(nr => parseDate(nr.desde) >= h);
      if(next) {
        const diasProx = Math.round((parseDate(next.desde) - today) / (1000*60*60*24));
        return { css: "ocupado", label: diasProx === 0 ? "OUT hoy" : `OUT ${diasSale}d` };
      }
      return { css: "ocupado", label: diasSale === 1 ? "OUT mañana" : `OUT ${diasSale}d` };
    }
  }

  // Find next upcoming reservation
  const next = rs.find(r => parseDate(r.desde) > today);
  if(next) {
    const dias = Math.round((parseDate(next.desde) - today) / (1000*60*60*24));
    if(dias === 0) return { css: "proximamente", label: "Entra hoy" };
    if(dias === 1) return { css: "proximamente", label: "Entra mañana" };
    return { css: "proximamente", label: `Entra en ${dias}d` };
  }

  return { css: "libre", label: "Libre" };
}

function reservaColor(estado) {
  if(estado === "pendiente") return reservaColorRules?.["pendiente"] || "";
  return reservaColorRules?.["confirmada"] || "";
}

function reservasSolapadas(aptoId) {
  // Returns a Set of reservation IDs that overlap with at least one other in the same depto
  const rs = reservas.filter(r => r.aptoId === aptoId && r.estado !== "cancelada");
  const conflictos = new Set();
  for(let i = 0; i < rs.length; i++) {
    for(let j = i + 1; j < rs.length; j++) {
      const aD = parseDate(rs[i].desde), aH = parseDate(rs[i].hasta);
      const bD = parseDate(rs[j].desde), bH = parseDate(rs[j].hasta);
      if(aD < bH && bD < aH) { // overlap condition
        conflictos.add(rs[i].id);
        conflictos.add(rs[j].id);
      }
    }
  }
  return conflictos;
}

// ─── RENDER ─────────────────────────────────────────────
function renderStats() {
  const todayStr = today.toISOString().slice(0,10);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
  const tomorrowStr = tomorrow.toISOString().slice(0,10);

  // Totales globales (siempre sobre todos los aptos)
  const totalOcupados   = aptos.filter(a => aptoStatus(a.id) === "ocupado").length;
  const totalLibres     = aptos.filter(a => aptoStatus(a.id) !== "ocupado").length;
  const totalCheckinHoy    = new Set(reservas.filter(r => r.estado !== "cancelada" && r.desde === todayStr).map(r => r.aptoId)).size;
  const totalCheckoutHoy   = new Set(reservas.filter(r => r.estado !== "cancelada" && r.hasta === todayStr).map(r => r.aptoId)).size;
  const totalCheckinManana = new Set(reservas.filter(r => r.estado !== "cancelada" && r.desde === tomorrowStr).map(r => r.aptoId)).size;
  const totalCheckoutManana = new Set(reservas.filter(r => r.estado !== "cancelada" && r.hasta === tomorrowStr).map(r => r.aptoId)).size;

  // Si hay filtro de usuario, calcular también los del usuario
  let labelOcupados = String(totalOcupados);
  let labelLibres   = String(totalLibres);
  let labelCheckin  = String(totalCheckinHoy);
  let labelCheckoutHoy = String(totalCheckoutHoy);
  let labelCheckinManana = String(totalCheckinManana);
  let labelCheckout = String(totalCheckoutManana);

  if(currentUserFilter) {
    const aptosUser = aptos.filter(a => a.encargado === currentUserFilter);
    const userIds   = new Set(aptosUser.map(a => a.id));
    const uOcupados  = aptosUser.filter(a => aptoStatus(a.id) === "ocupado").length;
    const uLibres    = aptosUser.filter(a => aptoStatus(a.id) !== "ocupado").length;
    const uCheckin   = new Set(reservas.filter(r => r.estado !== "cancelada" && r.desde === todayStr && userIds.has(r.aptoId)).map(r => r.aptoId)).size;
    const uCheckoutHoy = new Set(reservas.filter(r => r.estado !== "cancelada" && r.hasta === todayStr && userIds.has(r.aptoId)).map(r => r.aptoId)).size;
    const uCheckinManana = new Set(reservas.filter(r => r.estado !== "cancelada" && r.desde === tomorrowStr && userIds.has(r.aptoId)).map(r => r.aptoId)).size;
    const uCheckout  = new Set(reservas.filter(r => r.estado !== "cancelada" && r.hasta === tomorrowStr && userIds.has(r.aptoId)).map(r => r.aptoId)).size;
    labelOcupados = `${uOcupados}<span style="font-size:0.65rem;color:var(--text3);font-weight:400"> / ${totalOcupados}</span>`;
    labelLibres   = `${uLibres}<span style="font-size:0.65rem;color:var(--text3);font-weight:400"> / ${totalLibres}</span>`;
    labelCheckin  = `${uCheckin}<span style="font-size:0.65rem;color:var(--text3);font-weight:400"> / ${totalCheckinHoy}</span>`;
    labelCheckoutHoy = `${uCheckoutHoy}<span style="font-size:0.65rem;color:var(--text3);font-weight:400"> / ${totalCheckoutHoy}</span>`;
    labelCheckinManana = `${uCheckinManana}<span style="font-size:0.65rem;color:var(--text3);font-weight:400"> / ${totalCheckinManana}</span>`;
    labelCheckout = `${uCheckout}<span style="font-size:0.65rem;color:var(--text3);font-weight:400"> / ${totalCheckoutManana}</span>`;
  }

  document.getElementById("statsBar").innerHTML = `
    <button class="stat-item stat-filter-btn" id="ftbOcupado" onclick="filterApts('ocupado',this)" title="Ver solo ocupados">
      <div class="stat-icon" style="background:var(--red-dim);color:var(--red)">🔴</div>
      <div class="stat-info"><div class="stat-val">${labelOcupados}</div><div class="stat-label">Ocupados</div></div>
    </button>
    <button class="stat-item stat-filter-btn" id="ftbLibre" onclick="filterApts('libre',this)" title="Ver solo libres">
      <div class="stat-icon" style="background:var(--green-dim);color:var(--green)">🟢</div>
      <div class="stat-info"><div class="stat-val">${labelLibres}</div><div class="stat-label">Libres</div></div>
    </button>
    <button class="stat-item stat-filter-btn" id="ftbCheckinHoy" onclick="filterApts('checkin_hoy',this)" title="Ver check-in hoy">
      <div class="stat-icon" style="background:var(--blue-dim);color:var(--blue)">📥</div>
      <div class="stat-info"><div class="stat-val">${labelCheckin}</div><div class="stat-label">Check-in hoy</div></div>
    </button>
    <button class="stat-item stat-filter-btn" id="ftbCheckoutHoy" onclick="filterApts('checkout_hoy',this)" title="Ver check-out hoy">
      <div class="stat-icon" style="background:var(--red-dim);color:var(--red)">📤</div>
      <div class="stat-info"><div class="stat-val">${labelCheckoutHoy}</div><div class="stat-label">Check-out hoy</div></div>
    </button>
    <button class="stat-item stat-filter-btn" id="ftbCheckinManana" onclick="filterApts('checkin_manana',this)" title="Ver check-in mañana">
      <div class="stat-icon" style="background:var(--blue-dim);color:var(--blue)">📥</div>
      <div class="stat-info"><div class="stat-val">${labelCheckinManana}</div><div class="stat-label">Check-in mañana</div></div>
    </button>
    <button class="stat-item stat-filter-btn" id="ftbCheckoutManana" onclick="filterApts('checkout_manana',this)" title="Ver check-out mañana">
      <div class="stat-icon" style="background:var(--orange-dim);color:var(--orange)">📤</div>
      <div class="stat-info"><div class="stat-val">${labelCheckout}</div><div class="stat-label">Check-out mañana</div></div>
    </button>
  `;
  syncStatsBarActive();
}

// ─── DRAG HELPER (for popovers and floating panels) ──────
function hacerArrastrable(el, handle) {
  handle = handle || el;
  let startX, startY, origLeft, origTop;
  handle.addEventListener("mousedown", e => {
    if(e.target.tagName === "SELECT" || e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    startX   = e.clientX;
    startY   = e.clientY;
    origLeft = rect.left;
    origTop  = rect.top + window.scrollY;
    el.style.position = "fixed";
    el.style.left = rect.left + "px";
    el.style.top  = rect.top  + "px";
    handle.style.cursor = "grabbing";

    const onMove = ev => {
      el.style.left = Math.max(0, Math.min(origLeft + ev.clientX - startX, window.innerWidth  - el.offsetWidth))  + "px";
      el.style.top  = Math.max(0, Math.min(origTop  + ev.clientY - startY, window.innerHeight - el.offsetHeight)) + "px";
    };
    const onUp = () => {
      handle.style.cursor = "grab";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  });

  // Touch support
  handle.addEventListener("touchstart", e => {
    const touch = e.touches[0];
    const rect = el.getBoundingClientRect();
    startX   = touch.clientX; startY   = touch.clientY;
    origLeft = rect.left;     origTop  = rect.top;
    el.style.position = "fixed";
  }, { passive: true });
  handle.addEventListener("touchmove", e => {
    const touch = e.touches[0];
    el.style.left = Math.max(0, origLeft + touch.clientX - startX) + "px";
    el.style.top  = Math.max(0, origTop  + touch.clientY - startY) + "px";
  }, { passive: true });
}

// Orden personalizado — IDs en el orden que el usuario define
let aptoSortOrder = [];

function getSortedAptos(list) {
  if(aptoSortOrder.length) {
    const result = [];
    aptoSortOrder.forEach(id => { const a = list.find(x => x.id === id); if(a) result.push(a); });
    // Agregar los que no están en el orden aún, alfabéticamente
    list.filter(a => !aptoSortOrder.includes(a.id))
      .sort((a,b) => a.nombre.localeCompare(b.nombre, 'es', {numeric:true}))
      .forEach(a => result.push(a));
    return result;
  }
  return [...list].sort((a,b) => a.nombre.localeCompare(b.nombre, 'es', {numeric:true}));
}

let _zoomMode = false;

function syncMobileZoomButtonsLayout() {
  const wrap = document.getElementById("mobileZoomBtns");
  const btnNormal = document.getElementById("mzBtnNormal");
  const btnMini = document.getElementById("mzBtnMini");
  const onDeptos = document.getElementById("pageDeptos")?.classList.contains("active");
  const isMobile = window.innerWidth <= 700;
  if(!wrap || !btnNormal || !btnMini) return;
  if(!isMobile || !onDeptos) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "inline-flex";
  wrap.style.position = "static";
  wrap.style.zIndex = "";
  wrap.style.flexDirection = "row";
  wrap.style.alignItems = "center";
  wrap.style.gap = "8px";
  wrap.style.padding = "0";
  wrap.style.borderRadius = "0";
  wrap.style.background = "transparent";
  wrap.style.border = "0";
  wrap.style.boxShadow = "none";
  [btnNormal, btnMini].forEach(btn => {
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.width = "34px";
    btn.style.height = "34px";
    btn.style.borderRadius = "12px";
    btn.style.opacity = "1";
    btn.style.visibility = "visible";
  });
}

function setMobileZoom(mode) {
  const grid = document.getElementById("aptsGrid");
  const btnN = document.getElementById("mzBtnNormal");
  const btnM = document.getElementById("mzBtnMini");
  if(!grid) return;
  if(mode === "mini") {
    grid.classList.add("mini-zoom");
    grid.classList.remove("zoom-mode");
    if(btnM) { btnM.style.background = "var(--gold)"; btnM.style.color = "#000"; }
    if(btnN) { btnN.style.background = "var(--bg2)"; btnN.style.color = "var(--text)"; }
  } else {
    grid.classList.remove("mini-zoom");
    if(btnN) { btnN.style.background = "var(--gold)"; btnN.style.color = "#000"; }
    if(btnM) { btnM.style.background = "var(--bg2)"; btnM.style.color = "var(--text)"; }
  }
  syncMobileZoomButtonsLayout();
}

function toggleZoomMode() {
  _zoomMode = !_zoomMode;
  const grid = document.getElementById("aptsGrid");
  const btn  = document.getElementById("zoomToggleBtn");
  if(!grid || !btn) return;
  if(_zoomMode) {
    grid.classList.add("zoom-mode");
    btn.textContent = "−";
    btn.classList.add("active");
    btn.title = "Volver al formato original";
  } else {
    grid.classList.remove("zoom-mode");
    btn.textContent = "+";
    btn.classList.remove("active");
    btn.title = "Ampliar vista";
  }
}

function scrollGrid(dir) {
  const scroller = document.getElementById("aptsViewport") || document.getElementById("aptsGrid");
  const grid = document.getElementById("aptsGrid");
  if(!scroller || !grid) return;
  const cardWidth = grid.querySelector(".apt-card")?.offsetWidth || 320;
  const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  const next = Math.max(0, Math.min(maxScroll, scroller.scrollLeft + dir * (cardWidth + 10)));
  scroller.scrollTo({ left: next, behavior: "auto" });
  setTimeout(syncDeptosScrollDock, 80);
}

// ── SCROLL EDGE BUTTON VISIBILITY ────────────────────────
(function() {
  function updateEdgeBtns() {
    const onDeptos = document.getElementById("pageDeptos")?.classList.contains("active");
    const btnL = document.getElementById("scrollEdgeLeft");
    const btnR = document.getElementById("scrollEdgeRight");
    const dock = document.getElementById("deptosScrollDock");
    if(!btnL || !btnR) return;
    if(onDeptos) {
      btnL.classList.add("visible");
      btnR.classList.add("visible");
      dock?.classList.add("visible");
    } else {
      btnL.classList.remove("visible");
      btnR.classList.remove("visible");
      dock?.classList.remove("visible");
    }
    syncDeptosScrollDock();
  }
  // Check on page switch
  document.addEventListener("click", () => setTimeout(updateEdgeBtns, 50));
  window.addEventListener("resize", () => setTimeout(() => { syncDeptosScrollDock(); syncMobileZoomButtonsLayout(); }, 60));
  setTimeout(updateEdgeBtns, 500);
})();

function syncDeptosScrollDock() {
  const scroller = document.getElementById("aptsViewport") || document.getElementById("aptsGrid");
  const range = document.getElementById("deptosScrollRange");
  const dock = document.getElementById("deptosScrollDock");
  if(!scroller || !range || !dock) return;
  const onDeptos = document.getElementById("pageDeptos")?.classList.contains("active");
  const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  const active = onDeptos && maxScroll > 4;
  dock.classList.toggle("is-active", active);
  if(!active) {
    range.value = "0";
    return;
  }
  const ratio = maxScroll ? scroller.scrollLeft / maxScroll : 0;
  range.value = String(Math.round(ratio * 1000));
}

let _dragCardId = null;
let _dragFromHandle = false;

function cardDragStart(e) {
  if(!_dragFromHandle) { e.preventDefault(); return; }
  _dragCardId = parseInt(e.currentTarget.dataset.aptoId);
  e.currentTarget.classList.add("card-dragging");
  e.dataTransfer.effectAllowed = "move";
}
function cardDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("card-drag-over");
}
function cardDragLeave(e) { e.currentTarget.classList.remove("card-drag-over"); }
function cardDragEnd(e) {
  _dragFromHandle = false;
  e.currentTarget.classList.remove("card-dragging");
  document.querySelectorAll(".card-drag-over").forEach(el => el.classList.remove("card-drag-over"));
}
function cardDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("card-drag-over");
  const targetId = parseInt(e.currentTarget.dataset.aptoId);
  if(!_dragCardId || _dragCardId === targetId) return;
  const sorted = getSortedAptos(aptos).map(a => a.id);
  const from = sorted.indexOf(_dragCardId);
  const to   = sorted.indexOf(targetId);
  sorted.splice(from, 1);
  sorted.splice(to, 0, _dragCardId);
  aptoSortOrder = sorted;
  persistAptoSortOrder();
  _dragCardId = null;
  renderGrid();
}

let expandedView = false;
let expandedPage = 0;

function toggleExpandView() {
  expandedView = !expandedView;
  expandedPage = 0;
  document.getElementById("btnExpandView").textContent = expandedView ? "−" : "+";
  renderGrid();
}

function renderGrid() {
  const grid = document.getElementById("aptsGrid");
  const todayStr = today.toISOString().slice(0,10);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
  const tomorrowStr = tomorrow.toISOString().slice(0,10);

  let filtered;
  if(currentFilter === "checkin_hoy") {
    const aptoIds = new Set(reservas.filter(r => r.estado !== "cancelada" && r.desde === todayStr).map(r => r.aptoId));
    filtered = aptos.filter(a => aptoIds.has(a.id));
  } else if(currentFilter === "checkout_hoy") {
    const aptoIds = new Set(reservas.filter(r => r.estado !== "cancelada" && r.hasta === todayStr).map(r => r.aptoId));
    filtered = aptos.filter(a => aptoIds.has(a.id));
  } else if(currentFilter === "checkin_manana") {
    const aptoIds = new Set(reservas.filter(r => r.estado !== "cancelada" && r.desde === tomorrowStr).map(r => r.aptoId));
    filtered = aptos.filter(a => aptoIds.has(a.id));
  } else if(currentFilter === "checkout_manana") {
    const aptoIds = new Set(reservas.filter(r => r.estado !== "cancelada" && r.hasta === tomorrowStr).map(r => r.aptoId));
    filtered = aptos.filter(a => aptoIds.has(a.id));
  } else if(currentFilter === "todos") {
    filtered = aptos;
  } else if(currentFilter === "libre") {
    filtered = aptos.filter(a => aptoStatus(a.id) !== "ocupado");
  } else {
    filtered = aptos.filter(a => aptoStatus(a.id) === currentFilter);
  }

  // Apply user filter
  if(currentUserFilter) {
    filtered = filtered.filter(a => a.encargado === currentUserFilter);
  }

  // Apply search filter
  const q = document.getElementById("buscarDepto")?.value.trim().toLowerCase();
  if(q) {
    filtered = filtered.filter(a => {
      const reservasApto = reservas.filter(r => r.aptoId === a.id);
      const texto = [
        a.nombre,
        a.desc || "",
        a.encargado || "",
        a.wifiUser || "",
        ...reservasApto.map(r => [
          r.huesped,
          r.contacto,
          r.notas,
          r.cobrador,
          r.medioPago,
          r.reservaDe,
          r.nacionalidad,
          r.estado,
          r.desde || "",
          r.hasta || "",
          r.desde ? fmtShort(r.desde) : "",
          r.hasta ? fmtShort(r.hasta) : ""
        ].join(" "))
      ].join(" ").toLowerCase();
      return texto.includes(q);
    });
  }

  if(filtered.length === 0) {
    grid.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text3)">No hay departamentos en este estado</div>`;
    return;
  }

  const sorted = getSortedAptos(filtered);

  if(expandedView) {
    // 2 cards per page
    const perPage = 2;
    const totalPages = Math.ceil(sorted.length / perPage);
    expandedPage = Math.max(0, Math.min(expandedPage, totalPages - 1));
    const pageItems = sorted.slice(expandedPage * perPage, expandedPage * perPage + perPage);

    grid.style.flexDirection = "column";
    grid.style.overflowX = "hidden";

    grid.innerHTML = `
      <div style="display:flex;gap:16px;width:100%">
        ${pageItems.map(a => `<div style="flex:1;min-width:0">${aptCard(a, true)}</div>`).join("")}
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-top:16px;padding:4px 0">
        <button onclick="expandedPage=Math.max(0,expandedPage-1);renderGrid()" ${expandedPage===0?"disabled":""} style="padding:8px 20px;border-radius:8px;border:1px solid var(--border2);background:var(--bg2);color:${expandedPage===0?"var(--text3)":"var(--text)"};cursor:${expandedPage===0?"not-allowed":"pointer"};font-family:'DM Sans',sans-serif;font-size:0.88rem;font-weight:600;transition:all 0.15s">‹ Anterior</button>
        <span style="font-size:0.8rem;color:var(--text3)">${expandedPage+1} / ${totalPages}</span>
        <button onclick="expandedPage=Math.min(${totalPages-1},expandedPage+1);renderGrid()" ${expandedPage===totalPages-1?"disabled":""} style="padding:8px 20px;border-radius:8px;border:1px solid var(--border2);background:var(--bg2);color:${expandedPage===totalPages-1?"var(--text3)":"var(--text)"};cursor:${expandedPage===totalPages-1?"not-allowed":"pointer"};font-family:'DM Sans',sans-serif;font-size:0.88rem;font-weight:600;transition:all 0.15s">Siguiente ›</button>
      </div>`;
  } else {
    grid.style.flexDirection = "";
    grid.style.overflowX = "";
    grid.innerHTML = sorted.map(a => aptCard(a)).join("") + `<div class="grid-end-spacer" aria-hidden="true"></div>`;
  }

  // Attach drag listeners
  grid.querySelectorAll(".apt-card[draggable]").forEach(card => {
    card.addEventListener("dragstart", cardDragStart);
    card.addEventListener("dragover",  cardDragOver);
    card.addEventListener("dragleave", cardDragLeave);
    card.addEventListener("drop",      cardDrop);
    card.addEventListener("dragend",   cardDragEnd);
  });
  const scroller = document.getElementById("aptsViewport") || grid;
  if(scroller && !scroller.dataset.scrollSyncBound) {
    scroller.addEventListener("scroll", syncDeptosScrollDock, { passive: true });
    scroller.dataset.scrollSyncBound = "1";
  }
  const range = document.getElementById("deptosScrollRange");
  if(range && !range.dataset.bound) {
    range.addEventListener("input", function() {
      const scroller = document.getElementById("aptsViewport") || document.getElementById("aptsGrid");
      if(!scroller) return;
      const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      scroller.scrollLeft = (Number(this.value || 0) / 1000) * maxScroll;
    });
    range.dataset.bound = "1";
  }
  if(window.innerWidth <= 700) {
    setMobileZoom(grid.classList.contains("mini-zoom") ? "mini" : "normal");
  }
  syncMobileZoomButtonsLayout();
  syncDeptosScrollDock();
}

function aptCard(a) {
  const status  = aptoStatus(a.id);
  const mixed   = getMixedList(a.id);
  const rsOnly  = mixed.filter(x => x._type === "reserva");
  const conflictos = reservasSolapadas(a.id);

  const itemsHTML = mixed.length === 0
    ? (status === 'libre'
        ? `<div style="margin:4px 0 6px;padding:8px 10px;background:var(--green-dim);border:1.5px solid var(--green);border-radius:8px;text-align:center;font-family:'Fraunces',serif;font-size:0.9rem;font-weight:900;color:var(--green);letter-spacing:0.1em">✓ VACÍO</div>`
        : `<div class="reservas-empty">Sin reservas próximas</div>`)
    : mixed.map((item, i) => {
        if(item._type === "nota") {
          return `<div class="nota-inline"
            draggable="true"
            data-nota-id="${item.id}"
            data-apto-id="${a.id}"
            data-index="${i}"
            ondragstart="notaDragStart(event)"
            ondragover="notaDragOver(event)"
            ondragleave="notaDragLeave(event)"
            ondrop="notaDrop(event,${a.id})"
            ondragend="this.classList.remove('dragging');_notaDragFromHandle=false">
            <div class="nota-drag-handle"
              title="Arrastrar"
              onmousedown="event.stopPropagation();_notaDragFromHandle=true;_dragFromHandle=false"
              ontouchstart="event.stopPropagation();_notaDragFromHandle=true;_dragFromHandle=false">⠿</div>
            <div class="nota-inline-bar"></div>
            <div class="nota-inline-body">
              <div class="nota-inline-text"
                contenteditable="true"
                onclick="event.stopPropagation()"
                onmousedown="event.stopPropagation()"
                onblur="actualizarNota(${item.id}, this.innerText)"
                onkeydown="if(event.key==='Escape')this.blur()"
                title="Clic para editar">${item.texto}</div>
            </div>
            <div class="nota-inline-actions">
              <button class="nota-move-btn" style="color:var(--red)" onclick="event.stopPropagation();eliminarNota(${item.id})" title="Eliminar">✕</button>
            </div>
          </div>`;
        }

        // reserva
        const r      = item;
        const isFirstReserva = rsOnly.indexOf(r) === 0;
        const libreHoy = isFirstReserva && status === "proximamente";
        const problematica = !!(r.ingreso && !r.pago);
        const conDeuda = !!r.hayDeuda;
        const prev   = rsOnly[rsOnly.indexOf(r) - 1];
        const noches = diffDays(r.desde, r.hasta);
        const estadiaLargaAuto = noches > 14;
        const gapDias = prev ? diffDays(prev.hasta, r.desde) : 0;
        const solapada = conflictos.has(r.id);
        const vencida = !!(r.hasta && parseDate(r.hasta) < today);

        const libreHTML = libreHoy
          ? `<div style="margin-bottom:6px;padding:4px 10px;background:var(--green-dim);border:1px solid var(--green);border-radius:6px;text-align:center;font-size:0.65rem;font-weight:800;color:var(--green);letter-spacing:0.08em;text-transform:uppercase">✓ LIBRE</div>`
          : "";

        const gapHTML = (prev && gapDias > 0)
          ? `<div class="gap-badge"><div class="gap-line"></div><span class="gap-label">Libre ${fmtShort(prev.hasta)} al ${fmtShort(r.desde)} · ${gapDias} día${gapDias!==1?'s':''}</span><div class="gap-line"></div></div>`
          : (prev && gapDias < 0)
          ? `<div class="gap-badge"><div class="gap-line" style="background:${getReservaRuleColor("superpuesta")}"></div><span class="gap-label" style="color:${getReservaRuleColor("superpuesta")};border-color:${hexToRgba(getReservaRuleColor("superpuesta"), 0.3)};background:${hexToRgba(getReservaRuleColor("superpuesta"), 0.12)}">⚠ ${Math.abs(gapDias)}d superpuestos</span><div class="gap-line" style="background:${getReservaRuleColor("superpuesta")}"></div></div>`
          : "";
        const otroUsuario = !!(r.reservaDe && a.encargado && r.reservaDe !== a.encargado);
        const todayStr = today.toISOString().slice(0,10);
        const saleHoy = !!(r.hasta === todayStr && !vencida);
        const colorKey = getReservaHighlightKey(r, { solapada, problematica, conDeuda, vencida, saleHoy, otroUsuario });
        const activeKeys = getReservaActiveKeys(r, { solapada, problematica, conDeuda, vencida, otroUsuario });
        const cardInlineStyle = buildReservaCardInlineStyle(colorKey, activeKeys, vencida, saleHoy);
        const stripeColorRaw = solapada ? getReservaRuleColor("superpuesta")
          : vencida ? getReservaRuleColor("vencida")
          : r.ingreso ? "var(--green)"
          : reservaColor(r.estado);
        const stripeColor = stripeColorRaw || "var(--border2)";
        const otroUsuarioBar = otroUsuario
          ? `<div style="background:var(--orange-dim);border-top:1px solid var(--orange);padding:3px 10px 3px 14px;font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--orange);border-radius:0 0 11px 11px;margin:4px -1px -1px -1px">RESERVA DE ${r.reservaDe}</div>`
          : "";

        return `
        ${libreHTML}
        ${gapHTML}
        <div class="reserva-item${solapada ? ' solapada' : ''}${problematica ? ' problematica' : ''}${conDeuda ? ' con-deuda' : ''}${vencida ? ' vencida' : ''}"
          style="${cardInlineStyle}"
          draggable="true"
          data-index="${i}"
          data-apto-id="${a.id}"
          data-reserva-id="${r.id}"
          ondragstart="reservaItemDragStart(event)"
          ondragover="notaDragOver(event)"
          ondragleave="notaDragLeave(event)"
          ondrop="notaDrop(event,${a.id})"
          ondragend="this.classList.remove('dragging');_reservaDragFromHandle=false"
          onclick="verDetalle(${r.id})">
          <div class="reserva-color" style="background:${stripeColor}"></div>
          <div class="reserva-drag-handle" title="Arrastrar para reordenar"
            onmousedown="event.stopPropagation();_reservaDragFromHandle=true;_dragFromHandle=false"
            ontouchstart="event.stopPropagation();_reservaDragFromHandle=true;_dragFromHandle=false"
            style="position:absolute;left:0;top:0;bottom:0;width:18px;display:flex;align-items:center;justify-content:center;cursor:grab;color:var(--border2);font-size:0.7rem;z-index:1;opacity:0.5">⠿</div>
          <div class="reserva-info">
            <!-- IN: fecha destacada -->
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="font-size:0.58rem;font-weight:800;padding:2px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:0.05em;background:${r.ingreso ? 'rgba(61,158,106,0.18)' : 'rgba(74,133,190,0.16)'};color:${r.ingreso ? 'var(--green)' : '#7ab0eb'};border:1px solid ${r.ingreso ? 'rgba(61,158,106,0.3)' : 'rgba(74,133,190,0.25)'}">IN</span>
              <span style="font-size:0.88rem;font-weight:700;color:var(--text2)">${fmtShort(r.desde)}</span>
              <span style="font-size:0.72rem;color:var(--text3)">${r.horarioEntrada || DEFAULT_HORARIO_ENTRADA}</span>
            </div>
            <!-- Nombre + chip personas -->
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
              <span style="font-size:0.9rem;font-weight:700;color:var(--text);line-height:1.2;flex:1;min-width:0">${r.huesped}</span>
              ${r.cantHuespedes ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.76rem;font-weight:700;color:var(--text);background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.11);border-radius:4px;padding:0 5px;flex-shrink:0"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${r.cantHuespedes}</span>` : ""}
            </div>
            ${otroUsuario ? `<div style="font-size:0.68rem;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--orange);border-left:2px solid var(--orange);padding-left:6px;margin-top:1px;margin-bottom:2px">Reserva de ${r.reservaDe}</div>` : ""}
            <!-- OUT: fecha destacada -->
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;margin-top:1px">
              <span style="font-size:0.58rem;font-weight:800;padding:2px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:0.05em;background:rgba(232,168,76,0.13);color:var(--gold);border:1px solid rgba(232,168,76,0.25)">OUT</span>
              <span style="font-size:0.88rem;font-weight:700;color:var(--text2)">${fmtShort(r.hasta)}</span>
              <span style="font-size:0.72rem;color:var(--text3)">${r.horarioSalida || DEFAULT_HORARIO_SALIDA} · ${noches}n</span>
            </div>
            <!-- Monto + cobrador + seña inline -->
            <div class="reserva-finance-row" style="flex-wrap:wrap;gap:4px 8px">
              <div class="reserva-monto${conDeuda ? ' con-deuda' : ''}">${fmtMonto(r.monto)}</div>
              ${r._salio ? `<span style="font-size:0.68rem;color:var(--green);font-weight:700">✓ Salió ${r._salio}</span>` : ""}
              ${r.pago && r.cobrador ? `<span style="font-size:0.75rem;color:var(--text3)">· ${r.cobrador}</span>` : ""}
              ${conDeuda && r.deudaTipo === 'sena' ? `<span style="font-size:0.68rem;font-weight:700;color:#b07ee8;background:rgba(146,95,224,0.12);border:1px solid rgba(146,95,224,0.25);border-radius:4px;padding:1px 6px;margin-left:2px">Seña ${fmtMonto(r.senaMonto||0)}</span>` : ""}
              ${conDeuda && r.deudaTipo === 'deuda' ? `<span style="font-size:0.68rem;font-weight:700;color:var(--red);background:rgba(165,50,50,0.12);border:1px solid rgba(165,50,50,0.25);border-radius:4px;padding:1px 6px;margin-left:2px">Deuda ${fmtMonto(r.deudaMonto||0)}</span>` : ""}
            </div>
            ${conDeuda && (r.deudaTipo === 'sena' ? r.senaComentario : r.deudaComentario) ? `<div class="reserva-deuda-note">${r.deudaTipo === 'sena' ? r.senaComentario : r.deudaComentario}</div>` : ""}
          </div>
          <div class="reserva-right">
            ${r.contacto ? `<div style="display:flex;align-items:center;gap:3px;max-width:100%">
              <button onclick="event.stopPropagation();abrirWADirecto('${r.contacto.replace(/'/g,"\\'")}')" title="WhatsApp" style="background:none;border:none;cursor:pointer;padding:0;display:flex;align-items:center;flex-shrink:0"><svg width="12" height="12" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.524 5.855L0 24l6.29-1.507A11.946 11.946 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.369l-.36-.213-3.733.894.944-3.643-.235-.374A9.818 9.818 0 1 1 12 21.818z"/></svg></button>
              <span onclick="event.stopPropagation();abrirWADirecto('${r.contacto.replace(/'/g,"\\'")}')" style="font-size:0.58rem;color:var(--text3);cursor:pointer;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${fmtTelefono(r.contacto)}</span>
            </div>` : ""}
            ${r.estado === 'pendiente'
              ? `<button class="reserva-pill pill-pending" style="${buildReservaStatusStyle('pendiente')}" onclick="event.stopPropagation();updateReserva(${r.id},'estado','confirmada');render()" title="Confirmar reserva">Pendiente</button>`
              : `<span class="reserva-pill pill-${r.estado}" style="${buildReservaStatusStyle(r.estado)}">${r.estado}</span>`}
            <button class="ingreso-btn ${r.ingreso ? 'ingreso' : 'falta'}${problematica ? ' problem' : ''}" style="font-size:0.55rem;padding:2px 4px" onclick="event.stopPropagation();toggleIngreso(${r.id},this)">${r.ingreso ? '↓ IN' : 'Falta IN'}</button>
            <button class="pago-btn ${r.pago ? 'pago' : 'impago'}${problematica ? ' problem' : ''}" style="font-size:0.55rem;padding:2px 4px" onclick="event.stopPropagation();togglePago(${r.id},this)">${r.pago ? '✓ Pago' : 'Impago'}</button>
            ${r._salio
              ? `<button class="ingreso-btn ingreso" style="font-size:0.55rem;padding:2px 4px;background:var(--green-dim);color:var(--green);border-color:rgba(61,158,106,0.4)" onclick="event.stopPropagation();abrirPopoverRetiro(${r.id},this)" title="Confirmar retiro">✓ OUT</button>`
              : `<button class="ingreso-btn falta" style="font-size:0.55rem;padding:2px 4px;background:var(--gold-dim);color:var(--gold);border-color:rgba(212,175,55,0.3)" onclick="event.stopPropagation();marcarSalio(${r.id},this)" title="Marcar salida">↑ OUT</button>`
            }
          </div>
          ${r.notas ? `<div style="grid-column:1/-1;padding:4px 10px 2px 14px;font-size:0.78rem;color:var(--text2);line-height:1.4">📝 ${r.notas}</div>` : ""}
        </div>`;
      }).join("");

  const badge = aptoStatusBadge(a.id);
  const encargadoHTML = a.encargado ? `<span style="color:var(--text3)">·</span> ${a.encargado}` : "";
  const wifiHTML = "";

  return `
  <div class="apt-card" draggable="true" data-apto-id="${a.id}" style="animation-delay:${aptos.indexOf(a)*0.03}s"
    ondragover="tempDragOver(event,${a.id})"
    ondragleave="tempDragLeaveCard(event)"
    ondrop="dropTempOnApto(event,${a.id})">
    <div class="apt-header">
      <div class="apt-drag-handle" title="Arrastrar para reordenar"
        onmousedown="_dragFromHandle=true"
        onmouseup="_dragFromHandle=false"
        ontouchstart="_dragFromHandle=true">⠿</div>
      <div class="apt-name-wrap">
        <div style="display:flex;align-items:baseline;gap:6px">
          <div class="apt-number">${a.nombre}</div>
          <div class="apt-desc">${encargadoHTML}</div>
          <button class="btn btn-gold btn-sm" onclick="event.stopPropagation();nuevaReservaParaApto(${a.id})" style="font-size:0.72rem;padding:2px 8px;line-height:1.4;height:auto">+</button>
        </div>
        ${wifiHTML}
      </div>
      <div class="apt-status ${badge.css}">
        <div class="status-dot"></div>${badge.label}
      </div>
    </div>
    <div class="reservas-section">
      <div class="reservas-label">Reservas</div>
      ${itemsHTML}
    </div>
    <div class="apt-footer">
      <div class="apt-actions">
        <button class="btn btn-ghost btn-sm" onclick="editApto(${a.id})">Editar</button>
        <button class="btn btn-gold btn-sm" onclick="nuevaReservaParaApto(${a.id})">+ Reserva</button>
      </div>
    </div>
  </div>`;
}

function buildTimeline(aptoId) {
  const inicio = new Date(today);
  const fin = new Date(today);
  fin.setDate(fin.getDate() + 30);

  const rs = reservas.filter(r => r.aptoId === aptoId && r.estado !== "cancelada");
  const totalDias = 30;

  let segments = [];
  let cursor = new Date(today);

  const events = [];
  for(const r of rs) {
    const d = parseDate(r.desde), h = parseDate(r.hasta);
    if(h > today && d < fin) {
      events.push({ desde: d < today ? today : d, hasta: h > fin ? fin : h, estado: r.estado });
    }
  }
  events.sort((a,b) => a.desde - b.desde);

  for(const ev of events) {
    if(ev.desde > cursor) {
      const days = Math.round((ev.desde - cursor)/(1000*60*60*24));
      if(days > 0) segments.push({ days, color: "var(--bg3)", w: days });
    }
    const days = Math.round((ev.hasta - ev.desde)/(1000*60*60*24));
    segments.push({ days, color: reservaColor(ev.estado), w: days });
    cursor = ev.hasta;
  }
  if(cursor < fin) {
    const days = Math.round((fin - cursor)/(1000*60*60*24));
    if(days > 0) segments.push({ days, color: "var(--bg3)", w: days });
  }

  const html = segments.map(s => {
    const pct = (s.w / totalDias * 100).toFixed(1);
    return `<div class="tl-segment" style="background:${s.color};flex:${s.w}"></div>`;
  }).join("");

  return `<div class="mini-timeline" title="Próximos 30 días">${html}</div>`;
}

// ─── MODALS ─────────────────────────────────────────────
function openModal(id) {
  if(id === "modalReserva") {
    const shouldResetReserva = !document.getElementById("r_id").value
      && !document.getElementById("r_huesped").value
      && !document.getElementById("r_desde").value
      && !document.getElementById("r_hasta").value;
    if(shouldResetReserva) {
      document.getElementById("r_id").value = "";
      document.getElementById("modalReservaTitulo").textContent = "Nueva Reserva";
      document.getElementById("btnGuardarReserva").textContent = "Guardar Reserva";
      document.getElementById("r_horarioEntrada").value = "";
      document.getElementById("r_horarioSalida").value = "";
      document.getElementById("r_horarioNotas").value = "";
      populateReservaSelects();
    }
    setTimeout(function(){ var b=document.getElementById("r_apto_search")||document.getElementById("r_apto_display"); if(b) b.focus(); }, 150);
  }
  if(id === "modalApto") {
    // only reset if opening fresh (not from editApto which sets a_id first)
    if(!document.getElementById("a_id").value) {
      document.getElementById("modalAptoTitulo").textContent = "Nuevo Departamento";
      document.getElementById("btnGuardarApto").textContent  = "Agregar Departamento";
      document.getElementById("btnEliminarApto").style.display = "none";
      poblarEncargadoSelect();
    }
  }
  document.getElementById(id).classList.add("open");
  if(id === "modalApto") setTimeout(() => { _aptoFormSnapshot = getAptoFormState(); }, 0);
  if(id === "modalGasto") setTimeout(() => { _gastoFormSnapshot = getGastoFormState(); }, 0);
  setTimeout(() => upgradeSelectsInModal(id), 0);
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open");
  if(id === "modalDetalle") {
    document.getElementById(id).dataset.reservaId = "";
  }
  if(id === "modalApto") {
    document.getElementById("a_id").value = "";
    document.getElementById("modalAptoTitulo").textContent = "Nuevo Departamento";
    document.getElementById("btnGuardarApto").textContent  = "Agregar Departamento";
    _aptoFormSnapshot = "";
  }
  if(id === "modalGasto") _gastoFormSnapshot = "";
}

// Track if mousedown started inside a modal — prevents closing on text selection drag
let _mousedownInsideModal = false;
document.addEventListener("mousedown", e => {
  _mousedownInsideModal = !!e.target.closest(".modal");
});

document.querySelectorAll(".modal-overlay").forEach(m => {
  m.addEventListener("mousedown", e => {
    if(e.target !== m) return;
    if(m.id === "modalLogin") return;

    e.preventDefault(); // prevent blur on focused inputs before we ask

    if(m.id === "modalReserva") { intentarCerrarReserva(); return; }
    if(m.id === "modalGasto")   { intentarCerrarGasto();   return; }
    if(m.id === "modalDetalle") { intentarCerrarDetalle(); return; }
    if(m.id === "modalApto")    { intentarCerrarApto();    return; }

    m.classList.remove("open");
  });
});

function validarTodosLosCampos() {
  let ok = true;
  const aptoEl = document.getElementById("r_apto");
  const aptoVal = parseInt(aptoEl?.value) || 0;
  if(aptoVal !== 0) ok = validarCampo(aptoEl, "Seleccioná un departamento") && ok;
  ok = validarCampo(document.getElementById("r_huesped"),       "Ingresá el nombre del huésped") && ok;
  ok = validarCampo(document.getElementById("r_contacto"),      "Ingresá el teléfono")           && ok;
  ok = validarCampo(document.getElementById("r_cantHuespedes"), "Seleccioná la cantidad de huéspedes") && ok;
  ok = validarCampo(document.getElementById("r_desde"),         "Ingresá la fecha de check-in")  && ok;
  ok = validarCampo(document.getElementById("r_hasta"),         "Ingresá la fecha de check-out") && ok;
  ok = validarCampo(document.getElementById("r_monto"),         "Ingresá el monto")              && ok;
  validarFechas();
  return ok;
}

function intentarCerrarGasto() {
  if(!_gastoFormSnapshot || getGastoFormState() === _gastoFormSnapshot) {
    closeModal("modalGasto");
    return;
  }
  mostrarDialogoSalida(
    "¿Guardar cambios?",
    "Hay cambios sin guardar en este gasto. ¿Querés guardarlos antes de cerrar?",
    [
      { label: "Descartar", action: () => closeModal("modalGasto") },
      { label: "Guardar", action: () => guardarGasto() }
    ]
  );
}

function intentarCerrarApto() {
  if(!_aptoFormSnapshot || getAptoFormState() === _aptoFormSnapshot) {
    closeModal("modalApto");
    return;
  }
  mostrarDialogoSalida(
    "¿Guardar cambios?",
    "Hay cambios sin guardar en este departamento. ¿Querés guardarlos antes de cerrar?",
    [
      { label: "Descartar", action: () => closeModal("modalApto") },
      { label: "Guardar", action: () => guardarApto() }
    ]
  );
}

function intentarCerrarDetalle() {
  const modal = document.getElementById("modalDetalle");
  const rid = parseInt(modal?.dataset?.reservaId || "", 10);
  if(!rid) { closeModal("modalDetalle"); return; }
  const r = reservas.find(x => x.id === rid);
  if(!r) { closeModal("modalDetalle"); return; }

  // Check overlap — only warn, then close
  const overlapIds = [...new Set(getReservaOverlapIds({
    aptoId: r.aptoId, desde: r.desde, hasta: r.hasta, estado: r.estado
  }, rid))];
  if(overlapIds.length) {
    addOverlapNotice(buildOverlapNoticeBody({ aptoId: r.aptoId, desde: r.desde, hasta: r.hasta, estado: r.estado }, overlapIds));
  }
  _detalleSnapshot = null;
  closeModal("modalDetalle");
}

function intentarCerrarReserva() {
  const huesped  = document.getElementById("r_huesped")?.value.trim();
  const aptoId   = document.getElementById("r_apto")?.value;
  const contacto = document.getElementById("r_contacto")?.value.trim();
  const monto    = document.getElementById("r_monto")?.value.trim();
  const cant     = document.getElementById("r_cantHuespedes")?.value;
  const desde    = document.getElementById("r_desde")?.value;
  const hasta    = document.getElementById("r_hasta")?.value;

  // Detect if user touched anything meaningful
  // "Reserva de" auto-fills so don't count it
  // Dates auto-fill with today so don't count them
  // Huéspedes defaults to 2 so don't count it
  // Only count what the user explicitly typed/selected
  const hayDatos = huesped || contacto || (monto && monto !== "0");

  // Nothing entered at all → close silently
  if(!hayDatos) {
    limpiarErrores();
    closeModal("modalReserva"); return;
  }

  const faltanCampos = !aptoId || !huesped || !contacto || !monto || !cant || !desde || !hasta;

  if(faltanCampos) {
    mostrarDialogoSalida(
      "¿Salir sin guardar?",
      "Hay campos obligatorios sin completar. ¿Querés cancelar la carga o completar los datos?",
      [
        { label: "Cancelar carga", action: () => { limpiarErrores(); closeModal("modalReserva"); } },
        { label: "Completar datos", action: () => { validarTodosLosCampos(); } }
      ]
    );
  } else {
    guardarReserva();
  }
}

function mostrarDialogoSalida(titulo, mensaje, botones, options = {}) {
  // Remove existing
  document.getElementById("dialogoSalida")?.remove();
  const maxWidth = options.maxWidth || 340;
  const width = options.width || "90%";
  const maxHeight = options.maxHeight || "86vh";
  const bodyStyle = options.bodyStyle || "";
  const buttonJustify = options.buttonJustify || "flex-end";

  const dlg = document.createElement("div");
  dlg.id = "dialogoSalida";
  dlg.style.cssText = `position:fixed;inset:0;z-index:3000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6)`;
  dlg.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:14px;padding:20px 22px;max-width:${typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth};width:${width};max-height:${maxHeight};overflow:auto;box-shadow:0 8px 32px rgba(0,0,0,0.5)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-family:'Fraunces',serif;font-size:1rem;font-weight:600;color:var(--text)">${titulo}</div>
        <button onclick="document.getElementById('dialogoSalida').remove()" style="background:none;border:none;color:var(--text3);font-size:1.1rem;cursor:pointer;padding:2px 6px;border-radius:6px;line-height:1" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='var(--text3)'">✕</button>
      </div>
      <div style="font-size:0.82rem;color:var(--text2);line-height:1.5;margin-bottom:18px;${bodyStyle}">${mensaje}</div>
      <div style="display:flex;gap:8px;justify-content:${buttonJustify};flex-wrap:wrap">
        ${botones.map((b,i) => `<button id="dlgBtn${i}" style="padding:8px 14px;border-radius:8px;border:1px solid var(--border2);background:${i===0?'var(--bg3)':'var(--gold)'};color:${i===0?'var(--text2)':'#000'};font-family:DM Sans,sans-serif;font-size:0.82rem;font-weight:600;cursor:pointer">${b.label}</button>`).join("")}
      </div>
    </div>`;
  document.body.appendChild(dlg);

  botones.forEach((b,i) => {
    document.getElementById(`dlgBtn${i}`).onclick = () => {
      dlg.querySelectorAll("button").forEach(btn => btn.disabled = true);
      // Capturar valores de inputs/selects ANTES de cerrar el diálogo
      const dlgData = {};
      dlg.querySelectorAll('input,select,textarea').forEach(el => {
        if(el.id) dlgData[el.id] = el.value;
      });
      window._dlgData = dlgData;
      dlg.remove();
      b.action();
    };
  });
  dlg.addEventListener("click", e => { if(e.target === dlg) dlg.remove(); });
}

function populateAptoSelect(selectId, selectedId) {
  if(selectId === undefined) selectId = "r_apto";
  if(selectedId === undefined) selectedId = null;

  // Custom dropdown
  if(selectId === "r_apto") {
    var hidden = document.getElementById("r_apto");
    var disp = document.getElementById("r_apto_display");
    var search = document.getElementById("r_apto_search");
    if(!hidden || !disp) return;
    var selVal = (selectedId === null || selectedId === undefined) ? "0" : String(selectedId);
    hidden.value = selVal;
    var label, color;
    if(selVal === "0" || selVal === "") {
      label = "⭐ Sin asignar (Temporal)"; color = "#c97d3a";
    } else {
      var apto = aptos.find(function(a){ return String(a.id) === selVal; });
      label = apto ? (apto.nombre + (apto.desc ? " — "+apto.desc : "")) : "Seleccioná un departamento";
      color = "";
    }
    // Set label text (keep search input as child)
    disp.childNodes[0].textContent = label + " ";
    disp.style.color = color;
    if(search) search.value = "";
    return;
  }

  // Select nativo (para otros usos)
  var sel = document.getElementById(selectId);
  if(!sel) return;
  sel.innerHTML =
    '<option value="">Seleccioná un departamento</option>' +
    '<option value="0"' + (selectedId === 0 || selectedId === null ? ' selected' : '') + ' style="color:#c97d3a;font-weight:700">⭐ Sin asignar (Temporal)</option>' +
    aptos.map(function(a){ return '<option value="'+a.id+'"'+(a.id == selectedId?' selected':'')+'>'+a.nombre+(a.desc?' — '+a.desc:'')+'</option>'; }).join('');
}


function selectAptoOption(val, label, el) {
  document.getElementById("r_apto").value = val;
  document.getElementById("r_apto_display").value = val === "" ? "" : label;
  document.getElementById("r_apto_list").style.display = "none";
  if(val && val !== "0") {
    const display = document.getElementById("r_apto_display");
    validarCampo(display, "Seleccioná un departamento");
  }
}

function abrirDetalleAptoDropdown(reservaId, btn) {
  var existing = document.getElementById("apto_portal");
  if(existing) { existing.remove(); return; }

  var rect = btn.getBoundingClientRect();
  var currentVal = String(reservas.find(function(x){ return x.id===reservaId; })?.aptoId || "");

  var items = [{ v:"0", t:"⭐ Sin asignar (Temporal)", color:"#c97d3a" }]
    .concat(aptos.map(function(a){ return { v:String(a.id), t:a.nombre+(a.desc?" — "+a.desc:""), color:"" }; }));

  var portal = document.createElement("div");
  portal.id = "apto_portal";
  var spaceBelow = window.innerHeight - rect.bottom - 8;
  var spaceAbove = rect.top - 8;
  var useAbove = spaceAbove > spaceBelow && spaceBelow < 200;
  var maxH = Math.min(280, useAbove ? spaceAbove : spaceBelow);
  portal.style.cssText = "position:fixed;width:"+rect.width+"px;left:"+rect.left+"px;max-height:"+maxH+"px;overflow-y:auto;background:#141210;border:1px solid #38342e;border-radius:8px;z-index:99999;box-shadow:0 12px 40px rgba(0,0,0,0.9)";
  if(useAbove) { portal.style.bottom=(window.innerHeight-rect.top+2)+"px"; portal.style.top="auto"; }
  else { portal.style.top=(rect.bottom+2)+"px"; portal.style.bottom="auto"; }

  items.forEach(function(item) {
    var div = document.createElement("div");
    div.style.cssText = "padding:9px 14px;cursor:pointer;font-size:0.84rem;border-bottom:1px solid #272420;"
      + (item.color?"color:"+item.color+";font-weight:700;":"color:#ede8df;")
      + (item.v===currentVal?"background:#1c1a16;":"");
    div.textContent = item.t;
    div.addEventListener("mouseenter", function(){ this.style.background="#1c1a16"; });
    div.addEventListener("mouseleave", function(){ this.style.background=item.v===currentVal?"#1c1a16":""; });
    div.addEventListener("mousedown", function(e) {
      e.preventDefault();
      e.stopPropagation();
      var newAptoId = parseInt(item.v) || 0;
      btn.textContent = item.t;
      btn.style.color = item.color || "";
      updateReserva(reservaId, "aptoId", newAptoId);
      portal.remove();
    });
    portal.appendChild(div);
  });

  document.body.appendChild(portal);

  var selEl = portal.children[Math.max(0, items.findIndex(function(x){ return x.v===currentVal; }))];
  if(selEl) setTimeout(function(){ selEl.scrollIntoView({block:"nearest"}); }, 0);

  function onOutside(e) {
    var p = document.getElementById("apto_portal");
    if(p && !p.contains(e.target) && e.target !== btn) { p.remove(); }
    document.removeEventListener("mousedown", onOutside);
  }
  setTimeout(function(){ document.addEventListener("mousedown", onOutside); }, 50);
}

function aptoSearchFilter(val) {
  if(!val) { var p=document.getElementById("apto_portal"); if(p) p.remove(); return; }
  // Open/refresh the dropdown with filter
  var existing = document.getElementById("apto_portal");
  if(existing) existing.remove();

  var disp = document.getElementById("r_apto_display");
  var hidden = document.getElementById("r_apto");
  if(!disp) return;

  var allItems = [{ v:"0", t:"⭐ Sin asignar (Temporal)", color:"#c97d3a" }]
    .concat(aptos.map(function(a){ return { v:String(a.id), t:a.nombre+(a.desc?" — "+a.desc:""), color:"" }; }));
  var filtered = allItems.filter(function(item){ return item.t.toLowerCase().includes(val.toLowerCase()); });
  if(filtered.length === 0) return;

  var rect = disp.getBoundingClientRect();
  var portal = document.createElement("div");
  portal.id = "apto_portal";
  portal.style.cssText = "position:fixed;left:"+rect.left+"px;top:"+(rect.bottom+2)+"px;width:"+rect.width+"px;max-height:220px;overflow-y:auto;background:#141210;border:1px solid #38342e;border-radius:8px;z-index:99999;box-shadow:0 12px 40px rgba(0,0,0,0.9)";

  filtered.forEach(function(item, idx) {
    var div = document.createElement("div");
    div.dataset.idx = idx;
    div.style.cssText = "padding:9px 14px;cursor:pointer;font-size:0.84rem;border-bottom:1px solid #272420;"+(item.color?"color:"+item.color+";font-weight:700;":"color:#ede8df;");
    div.textContent = item.t;
    div.addEventListener("mouseenter", function(){ _aptoHL(portal, parseInt(this.dataset.idx)); });
    div.addEventListener("mousedown", function(e){ e.preventDefault(); _aptoSelect(item); });
    portal.appendChild(div);
  });
  portal.dataset.filtered = JSON.stringify(filtered);
  portal.dataset.selected = "0";
  _aptoHL(portal, 0);
  document.body.appendChild(portal);

  setTimeout(function(){
    var pr=portal.getBoundingClientRect();
    if(pr.bottom>window.innerHeight-8) portal.style.top=(rect.top-portal.offsetHeight-2)+"px";
  },0);
}

function aptoSearchKeydown(e) {
  var portal = document.getElementById("apto_portal");
  if(e.key==="Escape"){ if(portal) portal.remove(); e.preventDefault(); return; }
  if(!portal) return;
  var items = JSON.parse(portal.dataset.filtered||"[]");
  var sel = parseInt(portal.dataset.selected??"0");
  if(e.key==="ArrowDown"){ e.preventDefault(); sel=Math.min(sel+1,items.length-1); _aptoHL(portal,sel); portal.dataset.selected=sel; }
  else if(e.key==="ArrowUp"){ e.preventDefault(); sel=Math.max(sel-1,0); _aptoHL(portal,sel); portal.dataset.selected=sel; }
  else if(e.key==="Enter"||e.key==="Tab"){ e.preventDefault(); if(items[sel]) _aptoSelect(items[sel]); }
}

function _aptoHL(portal, idx) {
  portal.dataset.selected = idx;
  Array.from(portal.children).forEach(function(d,i){ d.style.background=i===idx?"#1c1a16":""; });
  var el = portal.children[idx]; if(el) el.scrollIntoView({block:"nearest"});
}

function _aptoSelect(item) {
  var hidden=document.getElementById("r_apto");
  var disp=document.getElementById("r_apto_display");
  var search=document.getElementById("r_apto_search");
  if(!hidden||!disp) return;
  hidden.value=item.v;
  if(disp.childNodes[0]) disp.childNodes[0].textContent=item.t+" ";
  disp.style.color=item.color||"";
  if(search) search.value="";
  var portal=document.getElementById("apto_portal");
  if(portal) portal.remove();
}

function toggleAptoDropdown() {
  var existing = document.getElementById("apto_portal");
  if(existing) { existing.remove(); return; }

  var btn = document.getElementById("r_apto_display");
  var hidden = document.getElementById("r_apto");
  if(!btn) return;

  var rect = btn.getBoundingClientRect();
  var currentVal = hidden ? hidden.value : "";

  var allItems = [{ v:"0", t:"⭐ Sin asignar (Temporal)", color:"#c97d3a" }]
    .concat(aptos.map(function(a){ return { v:String(a.id), t:a.nombre+(a.desc?" — "+a.desc:""), color:"" }; }));

  var portal = document.createElement("div");
  portal.id = "apto_portal";
  portal.style.cssText = "position:fixed;left:"+rect.left+"px;top:"+(rect.bottom+2)+"px;width:"+Math.max(rect.width,220)+"px;background:#141210;border:1px solid #38342e;border-radius:8px;z-index:99999;box-shadow:0 12px 40px rgba(0,0,0,0.9);overflow:hidden";

  // Search input
  var searchWrap = document.createElement("div");
  searchWrap.style.cssText = "padding:8px 10px;border-bottom:1px solid #272420;position:relative";
  var searchIcon = document.createElement("span");
  searchIcon.style.cssText = "position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#5e5850;font-size:0.8rem;pointer-events:none";
  searchIcon.textContent = "🔍";
  var searchInput = document.createElement("input");
  searchInput.placeholder = "Buscar depto...";
  searchInput.style.cssText = "width:100%;background:#1c1a16;border:1px solid #38342e;border-radius:6px;color:#ede8df;font-family:DM Sans,sans-serif;font-size:0.83rem;padding:6px 10px 6px 28px;outline:none;box-sizing:border-box";
  searchWrap.appendChild(searchIcon);
  searchWrap.appendChild(searchInput);
  portal.appendChild(searchWrap);

  // List container
  var listEl = document.createElement("div");
  listEl.style.cssText = "max-height:220px;overflow-y:auto";
  portal.appendChild(listEl);

  function renderItems(filter) {
    listEl.innerHTML = "";
    var filtered = allItems.filter(function(item) {
      return !filter || item.t.toLowerCase().includes(filter.toLowerCase());
    });
    if(filtered.length === 0) {
      var empty = document.createElement("div");
      empty.style.cssText = "padding:10px 14px;font-size:0.82rem;color:#5e5850";
      empty.textContent = "Sin resultados";
      listEl.appendChild(empty);
      return;
    }
    filtered.forEach(function(item) {
      var div = document.createElement("div");
      div.style.cssText = "padding:9px 14px;cursor:pointer;font-size:0.84rem;border-bottom:1px solid #272420;"
        + (item.color ? "color:"+item.color+";font-weight:700;" : "color:#ede8df;")
        + (item.v === currentVal ? "background:#1c1a16;" : "");
      div.textContent = item.t;
      div.addEventListener("mouseenter", function(){ this.style.background="#1c1a16"; });
      div.addEventListener("mouseleave", function(){ this.style.background = item.v===currentVal?"#1c1a16":""; });
      div.addEventListener("mousedown", function(e) {
        e.preventDefault();
        e.stopPropagation();
        hidden.value = item.v;
        btn.textContent = item.t;
        btn.style.color = item.color || "";
        portal.remove();
      });
      listEl.appendChild(div);
    });
  }

  renderItems("");

  searchInput.addEventListener("input", function() { renderItems(this.value); });
  searchInput.addEventListener("keydown", function(e) {
    if(e.key === "Escape") { portal.remove(); btn.focus(); }
    if(e.key === "Enter") {
      var first = listEl.querySelector("div");
      if(first) first.dispatchEvent(new MouseEvent("mousedown", {bubbles:true}));
    }
  });

  document.body.appendChild(portal);

  // Ajustar si se sale por abajo
  setTimeout(function() {
    var pr = portal.getBoundingClientRect();
    if(pr.bottom > window.innerHeight - 8) {
      var newTop = rect.top - portal.offsetHeight - 2;
      if(newTop > 8) { portal.style.top = newTop+"px"; }
      else { listEl.style.maxHeight = (window.innerHeight - rect.bottom - 60)+"px"; }
    }
    searchInput.focus();
  }, 0);

  function onOutside(e) {
    var p = document.getElementById("apto_portal");
    if(p && !p.contains(e.target) && e.target !== btn) { p.remove(); }
    document.removeEventListener("mousedown", onOutside);
  }
  setTimeout(function(){ document.addEventListener("mousedown", onOutside); }, 50);
}

function populateReservaSelects(r = null) {
  populateAptoSelect("r_apto", r ? r.aptoId : null);
  const selCobrador = document.getElementById("r_cobrador");
  selCobrador.innerHTML = `<option value="">Sin especificar</option>` +
    usuarios.map(u => `<option value="${u.nombre}" ${r && r.cobrador === u.nombre ? "selected":""}>${u.nombre}${u.rol ? " — "+u.rol : ""}</option>`).join("");
  const selMedio = document.getElementById("r_medioPago");
  selMedio.innerHTML = `<option value="">Sin especificar</option>` +
    mediosPago.map(m => `<option value="${m.nombre}" ${r && r.medioPago === m.nombre ? "selected":""}>${m.nombre}</option>`).join("");
  const selReservaDe = document.getElementById("r_reservaDe");
  selReservaDe.innerHTML = `<option value="">Sin asignar</option>` +
    usuarios.map(u => `<option value="${u.nombre}" ${r && r.reservaDe === u.nombre ? "selected":""}>${u.nombre}${u.rol ? " — "+u.rol : ""}</option>`).join("");
}

// ─── GUARDAR RESERVA ───────────────────────────────────
function nuevaReservaParaApto(id, temporal = false) {
  document.getElementById("r_id").value = "";
  document.getElementById("r_temporal").value = temporal ? "1" : "";
  document.getElementById("modalReservaTitulo").textContent = temporal ? "Nueva Reserva Temporal" : "Nueva Reserva";
  document.getElementById("btnGuardarReserva").textContent = temporal ? "Guardar como Temporal" : "Guardar Reserva";
  populateReservaSelects();
  populateAptoSelect("r_apto", temporal ? 0 : id);
  ["r_huesped","r_contacto","r_monto","r_horarioNotas","r_deudaMonto"].forEach(fid => document.getElementById(fid).value = "");
  document.getElementById("r_hayDeuda").checked = false;
  document.getElementById("r_haySena").checked = false;
  toggleDebtFields("r_deudaCampos", false);
  toggleDebtFields("r_senaCampos", false);
  document.getElementById("r_deudaComentario").value = "";
  document.getElementById("r_horarioEntrada").value = "";
  document.getElementById("r_horarioSalida").value = "";
  document.getElementById("r_horarioNotas").value = "";
  toggleDebtFields("r_deudaCampos", false);
  document.getElementById("r_nacionalidad").value = "Argentina";
  document.getElementById("r_cantHuespedes").value = "2";
  const _hoy = new Date(); const _pad = n => String(n).padStart(2,'0');
  const _hoyStr = _hoy.getFullYear()+'-'+_pad(_hoy.getMonth()+1)+'-'+_pad(_hoy.getDate());
  document.getElementById("r_desde").value = _hoyStr;
  document.getElementById("r_hasta").value = _hoyStr;
  document.getElementById("r_estado").value = "pendiente";
  document.getElementById("r_pago").value = "false";
  document.getElementById("r_ingreso").value = "false";
  // Pre-fill Reserva de
  const selRD = document.getElementById("r_reservaDe");
  if(selRD) {
    const aptoSeleccionado = aptos.find(a => a.id === id);
    const encargadoDefault = aptoSeleccionado?.encargado || currentUser || "";
    selRD.value = encargadoDefault;
  }
  document.getElementById("modalReserva").classList.add("open");
  limpiarErrores();
  setTimeout(function(){ var b=document.getElementById("r_apto_search")||document.getElementById("r_apto_display"); if(b) b.focus(); }, 150);
}

function editarReserva(id) {
  const r = reservas.find(x => x.id === id);
  if(!r) return;
  document.getElementById("r_id").value = r.id;
  document.getElementById("modalReservaTitulo").textContent = "Editar Reserva";
  document.getElementById("btnGuardarReserva").textContent = "Guardar cambios";
  populateReservaSelects(r);
  document.getElementById("r_huesped").value   = r.huesped;
  document.getElementById("r_contacto").value  = r.contacto;
  document.getElementById("r_cantHuespedes").value = r.cantHuespedes || "";
  document.getElementById("r_desde").value     = r.desde;
  document.getElementById("r_hasta").value     = r.hasta;
  document.getElementById("r_monto").value     = fmtMonto(r.monto);
  document.getElementById("r_hayDeuda").checked = !!r.hayDeuda && r.deudaTipo !== 'sena';
  document.getElementById("r_haySena").checked  = !!r.hayDeuda && r.deudaTipo === 'sena';
  document.getElementById("r_deudaMonto").value = r.deudaMonto ? fmtMonto(r.deudaMonto) : "";
  document.getElementById("r_deudaComentario").value = r.deudaComentario || "";
  document.getElementById("r_senaMonto").value = r.senaMonto ? fmtMonto(r.senaMonto) : "";
  document.getElementById("r_senaComentario").value = r.senaComentario || "";
  document.getElementById("r_horarioEntrada").value = (r.horarioEntrada && r.horarioEntrada !== DEFAULT_HORARIO_ENTRADA) ? r.horarioEntrada : "";
  document.getElementById("r_horarioSalida").value  = (r.horarioSalida  && r.horarioSalida  !== DEFAULT_HORARIO_SALIDA)  ? r.horarioSalida  : "";
  document.getElementById("r_horarioNotas").value = r.notas || r.horarioNotas || "";
  toggleDebtFields("r_deudaCampos", !!r.hayDeuda && r.deudaTipo !== "sena");
  toggleDebtFields("r_senaCampos",  !!r.hayDeuda && r.deudaTipo === "sena");
  document.getElementById("r_estado").value    = r.estado;
  document.getElementById("r_pago").value      = r.pago ? "true" : "false";
  document.getElementById("r_ingreso").value   = r.ingreso ? "true" : "false";
  document.getElementById("r_horarioNotas").value = r.notas || "";
  document.getElementById("r_nacionalidad").value = r.nacionalidad || "";
  closeModal("modalDetalle");
  openModal("modalReserva");
  setTimeout(function(){ var b=document.getElementById("r_apto_search")||document.getElementById("r_apto_display"); if(b) b.focus(); }, 150);
}

// ─── FORM VALIDATION ──────────────────────────────────────
function validarCampo(el, msg) {
  // Remove existing error on this element
  const nextEl = el.nextElementSibling;
  if(nextEl && nextEl.classList.contains("field-error")) nextEl.remove();
  el.classList.remove("input-error");

  const val = (el.value ?? "").toString().trim();
  if(!val) {
    el.classList.add("input-error");
    const err = document.createElement("div");
    err.className = "field-error";
    err.innerHTML = `⚠ ${msg}`;
    el.insertAdjacentElement("afterend", err);
    return false;
  }
  return true;
}

function validarFechas() {
  const desde   = document.getElementById("r_desde")?.value;
  const hasta   = document.getElementById("r_hasta")?.value;
  const hastaEl = document.getElementById("r_hasta");
  if(!hastaEl) return;
  const nextEl = hastaEl.nextElementSibling;
  if(nextEl && nextEl.classList.contains("field-error")) nextEl.remove();
  hastaEl.classList.remove("input-error");
  if(desde && hasta && parseDate(hasta) <= parseDate(desde)) {
    hastaEl.classList.add("input-error");
    const err = document.createElement("div");
    err.className = "field-error";
    err.innerHTML = "⚠ El check-out debe ser posterior al check-in";
    hastaEl.insertAdjacentElement("afterend", err);
  }
}

function limpiarErrores() {
  document.querySelectorAll(".field-error").forEach(e => e.remove());
  document.querySelectorAll(".input-error").forEach(e => e.classList.remove("input-error"));
}

async function guardarReserva() {
  if(window._guardandoReserva) return;
  window._guardandoReserva = true;
  // Disable both save buttons immediately
  setReservaSaveButtonsDisabled(true);
  const rid=document.getElementById("r_id").value;
  const aptoIdRaw=parseInt(document.getElementById("r_apto")?.value)||0;
  const temporal = document.getElementById("r_temporal").value === "1";
  const aptoId = aptoIdRaw || 0;
  const huesped=document.getElementById("r_huesped").value.trim();
  const contacto=document.getElementById("r_contacto").value.trim();
  const cantHuespedesRaw=document.getElementById("r_cantHuespedes").value||"2";
  const cantHuespedes=normalizeCantHuespedesValue(cantHuespedesRaw);
  const desde=document.getElementById("r_desde").value;
  const hasta=document.getElementById("r_hasta").value;
  const monto=parseMontoInputValue(document.getElementById("r_monto").value);
  const hayDeuda=document.getElementById("r_hayDeuda").checked || document.getElementById("r_haySena").checked;
  const deudaTipo=document.getElementById("r_haySena").checked ? "sena" : "deuda";
  const deudaMonto=parseMontoInputValue(document.getElementById("r_deudaMonto").value);
  const deudaComentario=document.getElementById("r_deudaComentario").value.trim();
  const senaMonto=parseMontoInputValue(document.getElementById("r_senaMonto").value);
  const senaComentario=document.getElementById("r_senaComentario").value.trim();
  const horarioEntrada=normalizeHoraInputValue(document.getElementById("r_horarioEntrada").value, DEFAULT_HORARIO_ENTRADA);
  const horarioSalida=normalizeHoraInputValue(document.getElementById("r_horarioSalida").value, DEFAULT_HORARIO_SALIDA);
  const horarioNotas=document.getElementById("r_horarioNotas").value.trim();
  const estadiaLarga = desde && hasta ? diffDays(desde, hasta) > 14 : false;
  const estado=document.getElementById("r_estado").value;
  const cobrador=document.getElementById("r_cobrador").value;
  const medioPago=document.getElementById("r_medioPago").value;
  const reservaDe=document.getElementById("r_reservaDe").value;
  const nacionalidad=document.getElementById("r_nacionalidad").value.trim();
  const pago=document.getElementById("r_pago").value==="true";
  const ingreso=document.getElementById("r_ingreso").value==="true";
  const notas=document.getElementById("r_horarioNotas").value.trim();
  const reservaActual = rid ? reservas.find(x => x.id === parseInt(rid)) : null;
  const comentarioPago = buildComentarioPago({
    comentario: reservaActual?.comentarioPago || "",
    hayDeuda,
    deudaMonto,
    deudaComentario,
    deudaTipo,
    senaMonto,
    senaComentario,
    estadiaLarga,
    horarioNotas,
    mostrarHorarios: true
  });

  // For temporal, only validate huesped and dates
  function _unlockBtns() {
    window._guardandoReserva = false;
    setReservaSaveButtonsDisabled(false);
  }
  if(temporal && aptoId === 0) {
    if(!huesped) { toast("⚠️ Ingresá el nombre del huésped", false); _unlockBtns(); return; }
    if(!desde || !hasta) { toast("⚠️ Ingresá las fechas", false); _unlockBtns(); return; }
  } else {
    if(!validarTodosLosCampos()) { _unlockBtns(); return; }
    if(parseDate(hasta)<=parseDate(desde)){ validarFechas(); _unlockBtns(); return; }
  }
  if(hayDeuda && !deudaMonto) { toast("⚠️ Indicá cuánto se debe", false); _unlockBtns(); return; }

  const row={apto_id:aptoId||null,huesped,contacto,fecha_desde:desde,fecha_hasta:hasta,monto,estado,cobrador,medio_pago:medioPago,reserva_de:reservaDe,nacionalidad,pago,ingreso,notas,comentario_pago:comentarioPago,horario_entrada:horarioEntrada,horario_salida:horarioSalida,cant_huespedes:cantHuespedes};
  const candidate = { aptoId, desde, hasta, estado };
  const originalCandidate = rid ? (() => {
    const original = reservas.find(x => x.id === parseInt(rid));
    return original ? { aptoId: original.aptoId, desde: original.desde, hasta: original.hasta, estado: original.estado } : null;
  })() : null;
  const overlapIds = [...new Set(getNewOverlapIds(originalCandidate, candidate, rid ? parseInt(rid) : null))];

  const proceedSave = async (approvedOverlap = false) => {
    if(rid) {
      const upd=await supa.patch("reservas",rid,row);
      if(!upd) {
        toast("✗ No se pudo guardar la reserva", false);
        _unlockBtns();
        document.getElementById("modalReserva")?.classList.add("open");
        return;
      }
      const i=reservas.findIndex(x=>x.id===parseInt(rid));if(i!==-1)reservas[i]=dbRes(upd);
      toast("✓ Reserva actualizada");
      logAccion("Reserva editada",`${huesped}·${aptos.find(x=>x.id===aptoId)?.nombre||"TEMPORAL"}·${desde}→${hasta}`);
    } else {
      const cr=await supa.post("reservas",row);
      if(!cr) {
        toast("✗ No se pudo guardar la reserva", false);
        _unlockBtns();
        document.getElementById("modalReserva")?.classList.add("open");
        return;
      }
      const nueva = dbRes(cr);
      if(temporal && aptoId === 0) nueva._temp = true;
      reservas.push(nueva);
      if(temporal && aptoId === 0) {
        toast("⭐ Reserva temporal guardada");
        logAccion("Reserva temporal creada",`${huesped}·${desde}→${hasta}`);
      } else {
        toast("✓ Reserva guardada");
        logAccion("Reserva creada",`${huesped}·${aptos.find(x=>x.id===aptoId)?.nombre||""}·${desde}→${hasta}`);
      }
    }
    if(approvedOverlap && overlapIds.length) {
      addOverlapNotice(buildOverlapNoticeBody(candidate, overlapIds));
    }
    window._guardandoReserva = false;
    setReservaSaveButtonsDisabled(false);
    closeModal("modalReserva");
    actualizarTempBadge();
    if(temporal && aptoId === 0) {
      const navTemp = document.getElementById("navTemp");
      if(navTemp) switchPage("temp", navTemp);
    } else {
      render(aptoId || null);
    }
  };

  if(overlapIds.length) {
    _unlockBtns();
    mostrarDialogoSalida(
      "Hay una reserva superpuesta",
      `Esta reserva se superpone con:<br><br>${describeOverlapConflicts(overlapIds).join("<br>")}<br><br>¿Querés guardar igual?`,
      [
        { label: "Volver a editar", action: () => {
          document.getElementById("modalReserva").classList.add("open");
        }},
        { label: "Guardar igual", action: () => {
          window._guardandoReserva = true;
          setReservaSaveButtonsDisabled(true);
          closeModal("modalReserva");
          proceedSave(true);
        }}
      ]
    );
    return;
  }

  await proceedSave(false);
}

// ─── GUARDAR APTO ──────────────────────────────────────
async function guardarApto() {
  const aid      = document.getElementById("a_id").value;
  const nombre   = document.getElementById("a_nombre").value.trim();
  const desc     = document.getElementById("a_desc").value.trim();
  const encargado= document.getElementById("a_encargado").value;
  const wifiUser = document.getElementById("a_wifiUser").value.trim();
  const wifiPass = document.getElementById("a_wifiPass").value.trim();

  if(!nombre) { toast("⚠️ Ingresá el nombre del departamento", false); return; }
  if(!encargado) {
    toast("⚠️ El departamento debe tener un encargado", false);
    document.getElementById("a_encargado").style.borderColor = "var(--red)";
    return;
  }
  document.getElementById("a_encargado").style.borderColor = "";

  const row = { nombre, descripcion: desc, encargado, wifi_user: wifiUser, wifi_pass: wifiPass };

  if(aid) {
    const upd = await supa.patch("aptos", aid, row);
    if(upd) { const i=aptos.findIndex(x=>x.id===parseInt(aid)); if(i!==-1) aptos[i]=dbApto(upd); }
    toast("✓ Departamento actualizado");
    logAccion("Departamento editado", nombre);
  } else {
    const cr = await supa.post("aptos", row);
    if(cr) aptos.push(dbApto(cr));
    syncAptoSortOrder();
    toast("✓ Departamento agregado");
    logAccion("Departamento creado", nombre);
  }

  ["a_id","a_nombre","a_desc","a_wifiUser","a_wifiPass"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("a_encargado").value = "";
  closeModal("modalApto");
  render();
}

// ─── EDITAR APTO ───────────────────────────────────────
async function eliminarApto() {
  const id = parseInt(document.getElementById("btnEliminarApto").dataset.id);
  const apto = aptos.find(x => x.id === id);
  if(!apto) return;
  const reservasDelApto = reservas.filter(r => r.aptoId === id && r.estado !== "cancelada");
  if(reservasDelApto.length > 0) {
    toast(`⚠️ ${apto.nombre} tiene ${reservasDelApto.length} reserva(s) activa(s). Cancelalas primero.`, false);
    return;
  }
  mostrarDialogoSalida(
    `¿Eliminar ${apto.nombre}?`,
    "Esta acción no se puede deshacer. El departamento será eliminado permanentemente.",
    [
      { label: "Cancelar", action: () => {} },
      { label: "Sí, eliminar", action: async () => {
        await supa.del("aptos", id);
        aptos = aptos.filter(x => x.id !== id);
        syncAptoSortOrder();
        closeModal("modalApto");
        renderGrid();
        renderStats();
        toast(`✓ ${apto.nombre} eliminado`);
        logAccion("Departamento eliminado", apto.nombre);
      }}
    ]
  );
}

function editApto(id) {
  const a = aptos.find(x => x.id === id);
  if(!a) return;
  document.getElementById("modalAptoTitulo").textContent = "Editar Departamento";
  document.getElementById("btnGuardarApto").textContent  = "Guardar cambios";
  const btnEl = document.getElementById("btnEliminarApto");
  if(btnEl) { btnEl.style.display = "inline-flex"; btnEl.dataset.id = id; }
  document.getElementById("a_id").value       = a.id;
  document.getElementById("a_nombre").value   = a.nombre;
  document.getElementById("a_desc").value     = a.desc || "";
  document.getElementById("a_wifiUser").value = a.wifiUser || "";
  document.getElementById("a_wifiPass").value = a.wifiPass || "";
  // Populate encargado select then set value
  poblarEncargadoSelect(a.encargado);
  openModal("modalApto");
}

function poblarEncargadoSelect(selected = "") {
  const sel = document.getElementById("a_encargado");
  sel.innerHTML = `<option value="">— Seleccioná encargado —</option>` +
    usuarios.map(u => `<option value="${u.nombre}" ${u.nombre === selected ? "selected":""}>${u.nombre}</option>`).join("");
  // If no selection and users exist, don't auto-select — force user to choose
}

// ─── VER DETALLE RESERVA — inline editable, autosave ───
let _detalleSnapshot = null; // snapshot of reserva when detalle opened

function verDetalle(id) {
  const r = reservas.find(x => x.id === id);
  if(!r) return;
  // Save snapshot to detect changes
  _detalleSnapshot = JSON.stringify(r);
  const a = aptos.find(x => x.id === r.aptoId);

  const aptoNombreActual = aptos.find(x=>x.id===r.aptoId)?.nombre || "Sin asignar";
  const cobradorOpts = `<option value="">—</option>` + usuarios.map(u =>
    `<option value="${u.nombre}" ${r.cobrador === u.nombre ? "selected":""}>${u.nombre}</option>`).join("");
  const medioOpts = `<option value="">—</option>` + mediosPago.map(m =>
    `<option value="${m.nombre}" ${r.medioPago === m.nombre ? "selected":""}>${m.nombre}</option>`).join("");
  const reservaDeOpts = `<option value="">—</option>` + usuarios.map(u =>
    `<option value="${u.nombre}" ${r.reservaDe === u.nombre ? "selected":""}>${u.nombre}</option>`).join("");

  document.getElementById("detalleContent").innerHTML = `
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
      <div>
        <div class="modal-title" style="font-size:1.15rem">Editar Reserva</div>
        <div class="modal-sub" style="margin-top:2px;margin-bottom:0">cambios guardados automáticamente</div>
      </div>
      <button class="close-btn" tabindex="-1" onclick="intentarCerrarDetalle()">✕</button>
    </div>

    <!-- BLOQUE 1: Depto + Huésped -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Departamento <span style="color:#e05c5c;font-size:0.62rem;font-weight:700">OBL</span></label>
        <div style="position:relative" id="de_apto_wrap_${r.id}">
          <button type="button" id="de_apto_btn_${r.id}" class="form-input"
            onclick="event.preventDefault();abrirDetalleAptoDropdown(${r.id},this)"
            style="width:100%;text-align:left;cursor:pointer;padding-right:32px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${aptoNombreActual}
          </button>
          <svg style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--text3)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Huésped <span style="color:#e05c5c;font-size:0.62rem;font-weight:700">OBL</span></label>
        <input class="form-input" type="text" value="${r.huesped}" onblur="updateReserva(${r.id},'huesped',this.value)">
      </div>
    </div>

    <!-- BLOQUE 2: Fechas + Monto -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Check-in <span style="color:#e05c5c;font-size:0.62rem;font-weight:700">OBL</span></label>
        <input class="form-input" type="date" value="${r.desde}" onchange="updateReserva(${r.id},'desde',this.value)">
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Check-out <span style="color:#e05c5c;font-size:0.62rem;font-weight:700">OBL</span></label>
        <input class="form-input" type="date" value="${r.hasta}" onchange="updateReserva(${r.id},'hasta',this.value)">
      </div>
        <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Monto</label>
        <div style="display:flex;align-items:center;gap:6px">
          <input class="form-input" type="text" inputmode="decimal" value="${fmtMonto(r.monto)}"
            onfocus="setMontoInputRaw(this)"
            onblur="setMontoInputFormatted(this);updateReserva(${r.id},'monto',parseMontoInputValue(this.value))"
            onkeydown="if(event.key==='Tab'&&!event.shiftKey){event.preventDefault();(document.getElementById('de_hayDeuda_${r.id}').checked?document.getElementById('de_deudaMonto_${r.id}'):document.querySelector('#modalDetalle input[type=tel]')).focus();}">
          <button onclick="event.preventDefault();toggleExtPanel(${r.id})" title="Extensiones de estadía" style="width:24px;height:24px;border-radius:6px;border:1px solid rgba(61,158,106,0.35);background:rgba(61,158,106,0.1);color:#4caf7d;font-size:1rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1">+</button>
        </div>
        <div id="de_deudaCampos_${r.id}" class="deuda-fields" style="display:${r.hayDeuda && r.deudaTipo !== 'sena' ? "flex" : "none"}">
          <input class="form-input" type="text" inputmode="decimal" id="de_deudaMonto_${r.id}" value="${r.deudaMonto ? fmtMonto(r.deudaMonto) : ""}" placeholder="Monto deuda"
            onfocus="setMontoInputRaw(this)"
            onblur="setMontoInputFormatted(this);updateReserva(${r.id},'deudaMonto',parseMontoInputValue(this.value))"
            style="font-size:1rem;padding:10px 14px">
          <input class="form-input" type="text" id="de_deudaComentario_${r.id}" value="${(r.deudaComentario||'').replace(/"/g,'&quot;')}" placeholder="Comentario deuda"
            onblur="updateReserva(${r.id},'deudaComentario',this.value)"
            style="font-size:0.92rem;padding:10px 14px">
        </div>
        <div id="de_senaCampos_${r.id}" class="deuda-fields" style="display:${r.hayDeuda && r.deudaTipo === 'sena' ? "flex" : "none"}">
          <input class="form-input" type="text" inputmode="decimal" value="${r.senaMonto ? fmtMonto(r.senaMonto) : ""}" placeholder="Monto seña"
            onfocus="setMontoInputRaw(this)"
            onblur="setMontoInputFormatted(this);updateReserva(${r.id},'senaMonto',parseMontoInputValue(this.value))"
            style="font-size:1rem;padding:10px 14px">
          <input class="form-input" type="text" value="${(r.senaComentario||'').replace(/"/g,'&quot;')}" placeholder="Comentario seña"
            onblur="updateReserva(${r.id},'senaComentario',this.value)"
            style="font-size:0.92rem;padding:10px 14px">
        </div>
      </div>
    </div>

    <!-- PANEL EXTENSIONES: full width, fuera del grid -->
    ${(() => {
      const exts = r.extensiones || [];
      const montoBase = r.monto - exts.reduce((s,e)=>s+(e.monto||0),0);
      return `<div id="extPanel_${r.id}" style="display:${exts.length?'block':'none'};margin-bottom:10px;background:var(--bg3);border:1px solid rgba(61,158,106,0.25);border-radius:10px;padding:10px 12px">
        <div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#4caf7d;margin-bottom:8px">Extensiones de estadía</div>
        ${exts.length ? `
          <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:10px;padding-left:8px;border-left:2px solid rgba(61,158,106,0.3)">
            <div style="font-size:0.65rem;color:var(--text3)">Base: <b>${fmtMonto(montoBase)}</b></div>
            ${exts.map((e,i)=>`<div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:0.72rem;background:rgba(61,158,106,0.12);border:1px solid rgba(61,158,106,0.25);border-radius:4px;padding:2px 7px;color:#4caf7d;white-space:nowrap">hasta ${fmtShort(e.hasta)}</span>
              <span style="font-size:0.78rem;font-weight:700;color:#4caf7d">+ ${fmtMonto(e.monto)}</span>
              <span style="font-size:0.65rem;color:var(--text3);flex:1">${e.usuario||''}</span>
              <button onclick="event.preventDefault();eliminarExtension(${r.id},${i})" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:0.72rem;padding:2px 5px" title="Eliminar">✕</button>
            </div>`).join('')}
            <div style="font-size:0.75rem;font-weight:700;color:var(--gold);padding-top:6px;border-top:1px solid var(--border)">Total: ${fmtMonto(r.monto)}</div>
          </div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:flex-end">
          <div>
            <label style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3);display:block;margin-bottom:3px">Nueva salida</label>
            <input id="extFecha_${r.id}" class="form-input" type="date" style="padding:6px 10px;font-size:0.82rem">
          </div>
          <div>
            <label style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3);display:block;margin-bottom:3px">Monto adicional</label>
            <input id="extMonto_${r.id}" class="form-input" type="text" placeholder="U$D / $" style="padding:6px 10px;font-size:0.82rem">
          </div>
          <div>
            <label style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3);display:block;margin-bottom:3px">Quién cobró</label>
            <select id="extCobrador_${r.id}" class="form-input" style="padding:6px 10px;font-size:0.82rem">
              <option value="">—</option>
              ${usuarios.map(u=>`<option value="${u.nombre}" ${currentUser===u.nombre?'selected':''}>${u.nombre}</option>`).join('')}
            </select>
          </div>
          <button onclick="event.preventDefault();agregarExtension(${r.id})" class="btn btn-ghost btn-sm" style="color:#4caf7d;border-color:rgba(61,158,106,0.3);padding:7px 14px;font-size:0.78rem;white-space:nowrap">✓ Agregar</button>
        </div>
      </div>`;
    })()}

    <!-- BLOQUE 3: Teléfono + Nacionalidad + Huéspedes -->
    <div style="display:grid;grid-template-columns:2fr 1.5fr 1fr;gap:10px;margin-bottom:10px">
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Teléfono</label>
        <input class="form-input" type="tel" value="${r.contacto||''}" placeholder="+54 11 1234-5678"
          oninput="this.value=this.value.replace(/[^0-9+\s\-()]/g,'')" onblur="updateReserva(${r.id},'contacto',this.value)">
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Nacionalidad</label>
        <input class="form-input" type="text" value="${r.nacionalidad||''}" placeholder="País de origen"
          onblur="updateReserva(${r.id},'nacionalidad',this.value)"
          list="paises_list" autocomplete="off"
          onkeydown="nacAutocompletarTab(event,this)">
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Huéspedes</label>
        <select class="form-input" onchange="updateReserva(${r.id},'cantHuespedes',this.value)"
          onkeydown="if(event.key==='Tab'&&!event.shiftKey){event.preventDefault();document.getElementById('de_hayDeuda_${r.id}').focus();}">
          <option value="">—</option>
          <option value="1" ${r.cantHuespedes==='1'||r.cantHuespedes===1?'selected':''}>1</option>
          <option value="2" ${r.cantHuespedes==='2'||r.cantHuespedes===2?'selected':''}>2</option>
          <option value="2S" ${r.cantHuespedes==='2S'?'selected':''}>2 sep.</option>
          <option value="3" ${r.cantHuespedes==='3'||r.cantHuespedes===3?'selected':''}>3</option>
          <option value="4" ${r.cantHuespedes==='4'||r.cantHuespedes===4?'selected':''}>4</option>
          <option value="5" ${r.cantHuespedes==='5'||r.cantHuespedes===5?'selected':''}>5</option>
        </select>
      </div>
    </div>

    <!-- Botón guardar rápido -->
    <div style="display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <label class="deuda-toggle deuda-toggle-deuda" for="de_hayDeuda_${r.id}" title="Hay una deuda pendiente">
        <input type="checkbox" id="de_hayDeuda_${r.id}" ${r.hayDeuda && r.deudaTipo !== 'sena' ? "checked" : ""}
          onchange="toggleDebtFields('de_deudaCampos_${r.id}', this.checked);updateReserva(${r.id},'hayDeuda',this.checked);updateReserva(${r.id},'deudaTipo','deuda');if(this.checked){document.getElementById('de_haySena_${r.id}').checked=false;toggleDebtFields('de_senaCampos_${r.id}',false)}">
        <span>Deuda</span>
      </label>
      <label class="deuda-toggle deuda-toggle-sena" for="de_haySena_${r.id}" title="Se recibió una seña">
        <input type="checkbox" id="de_haySena_${r.id}" ${r.hayDeuda && r.deudaTipo === 'sena' ? "checked" : ""}
          onchange="toggleDebtFields('de_senaCampos_${r.id}', this.checked);updateReserva(${r.id},'hayDeuda',this.checked);updateReserva(${r.id},'deudaTipo','sena');if(this.checked){document.getElementById('de_hayDeuda_${r.id}').checked=false;toggleDebtFields('de_deudaCampos_${r.id}',false)}">
        <span>Seña</span>
      </label>
      <div style="display:flex;gap:6px;align-items:flex-end;flex:1;min-width:0">
        <div style="display:flex;flex-direction:column;gap:2px">
          <label class="form-label" style="font-size:0.6rem;margin:0">Entrada</label>
          <input class="form-input" type="text" inputmode="numeric"
            value="${r.horarioEntrada && r.horarioEntrada !== DEFAULT_HORARIO_ENTRADA ? fmtHora24(r.horarioEntrada, '') : ''}"
            placeholder="14:00" maxlength="5" style="width:72px;padding:6px 8px;font-size:0.82rem"
            onblur="setHoraInputFormatted(this,'');updateReserva(${r.id},'horarioEntrada',this.value)">
        </div>
        <div style="display:flex;flex-direction:column;gap:2px">
          <label class="form-label" style="font-size:0.6rem;margin:0">Salida</label>
          <input class="form-input" type="text" inputmode="numeric"
            value="${r.horarioSalida && r.horarioSalida !== DEFAULT_HORARIO_SALIDA ? fmtHora24(r.horarioSalida, '') : ''}"
            placeholder="11:00" maxlength="5" style="width:72px;padding:6px 8px;font-size:0.82rem"
            onblur="setHoraInputFormatted(this,'');updateReserva(${r.id},'horarioSalida',this.value)">
        </div>
      </div>
      <button id="de_btn_guardar_${r.id}" class="btn btn-gold" onclick="intentarCerrarDetalle()" style="min-width:140px">✓ Guardar reserva</button>
    </div>

    <div id="de_horarioCampos_${r.id}" style="margin-bottom:14px">
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Notas</label>
        <textarea class="form-input" rows="2" placeholder="Ej: entrada por self check-in, salida flexible..."
          onblur="updateReserva(${r.id},'notas',this.value);updateReserva(${r.id},'horarioNotas',this.value)"
          style="resize:vertical;line-height:1.45">${(r.notas||r.horarioNotas||"").replace(/</g,"&lt;")}</textarea>
      </div>
    </div>

    <!-- Divisor -->
    <div style="border-top:1px solid var(--border);margin:0 0 12px;position:relative">
      <span style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:var(--card);padding:0 10px;font-size:0.62rem;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;white-space:nowrap">Campos opcionales</span>
    </div>

    <!-- BLOQUE 4: Estado + Reserva de + Pago + Ingreso -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:10px">
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Estado</label>
        <select class="form-input" onchange="updateReserva(${r.id},'estado',this.value)">
          <option value="confirmada" ${r.estado==='confirmada'?'selected':''}>Confirmada</option>
          <option value="pendiente"  ${r.estado==='pendiente'?'selected':''}>Pendiente</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Reserva de</label>
        <select class="form-input" onchange="updateReserva(${r.id},'reservaDe',this.value)">${reservaDeOpts}</select>
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Pago</label>
        <select class="form-input" onchange="updateReserva(${r.id},'pago',this.value==='true')">
          <option value="false" ${!r.pago?'selected':''}>Impago</option>
          <option value="true"  ${r.pago?'selected':''}>Pagado</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Ingreso</label>
        <select class="form-input" onchange="updateReserva(${r.id},'ingreso',this.value==='true')">
          <option value="false" ${!r.ingreso?'selected':''}>Sin ingresar</option>
          <option value="true"  ${r.ingreso?'selected':''}>Ingresó</option>
        </select>
      </div>
    </div>

    <!-- BLOQUE 5: Cobrador + Medio de pago -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Quién cobró</label>
        <select class="form-input" onchange="updateReserva(${r.id},'cobrador',this.value)">${cobradorOpts}</select>
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Medio de pago</label>
        <select class="form-input" onchange="updateReserva(${r.id},'medioPago',this.value)">${medioOpts}</select>
      </div>
    </div>

    <!-- Notas privadas -->
    <div style="margin-bottom:16px;padding:10px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:10px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <label class="form-label" style="margin:0;font-size:0.62rem;color:var(--text3)">Nota privada (solo vos la ves)</label>
      </div>
      <textarea class="form-input" rows="2" placeholder="Solo visible para ${currentUser || 'vos'}…"
        style="resize:vertical;line-height:1.45;font-size:0.82rem;background:var(--bg2)"
        onblur="guardarNotaPrivada(${r.id}, this.value)"
        onfocus="this.value=cargarNotaPrivada(${r.id})"
      >${cargarNotaPrivada(r.id)}</textarea>
    </div>

    <!-- Footer -->
    <div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid var(--border);gap:8px;flex-wrap:wrap">
      <div style="display:flex;gap:8px;align-items:center">
        ${r.contacto ? `<button class="wa-btn" style="padding:6px 12px;font-size:0.78rem" onclick="enviarWhatsapp('${r.contacto.replace(/'/g,"\'")}','${r.huesped.replace(/'/g,"\'")}','${r.desde}','${r.hasta}','${r.aptoId}','${r.monto}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.556 4.118 1.528 5.845L.057 23.885a.5.5 0 0 0 .612.612l6.04-1.471A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.659-.523-5.168-1.427l-.369-.22-3.827.931.949-3.722-.242-.383A9.955 9.955 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
          WhatsApp
        </button>` : ""}
        <button class="btn btn-gold btn-sm" onclick="toggleIngreso(${r.id},this)">✓ Confirmar retiro</button>
      </div>
      <button class="btn btn-ghost btn-sm" style="color:var(--red);border-color:var(--red-dim)" onclick="eliminarReserva(${r.id})">Eliminar reserva</button>
    </div>
  `;
  document.getElementById("modalDetalle").dataset.reservaId = String(r.id);
  openModal("modalDetalle");
  setTimeout(function(){ var b=document.getElementById("de_apto_btn_"+r.id); if(b) b.focus(); }, 150);
  openModal("modalDetalle");
}

function _notaPrivadaKey(reservaId) {
  const user = (currentUser || "anonimo").toLowerCase().replace(/\s+/g,"_");
  return `rfnp_${user}_${reservaId}`;
}
function guardarNotaPrivada(reservaId, texto) {
  try { localStorage.setItem(_notaPrivadaKey(reservaId), texto || ""); } catch(e) {}
}
function cargarNotaPrivada(reservaId) {
  try { return (localStorage.getItem(_notaPrivadaKey(reservaId)) || "").replace(/</g,"&lt;"); } catch(e) { return ""; }
}

function toggleExtPanel(id) {
  const p = document.getElementById(`extPanel_${id}`);
  if(p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

async function agregarExtension(id) {
  const r = reservas.find(x => x.id === id);
  if(!r) return;
  const fechaEl    = document.getElementById(`extFecha_${id}`);
  const montoEl    = document.getElementById(`extMonto_${id}`);
  const cobradorEl = document.getElementById(`extCobrador_${id}`);
  const fecha    = fechaEl?.value;
  const monto    = parseMontoInputValue(montoEl?.value || "");
  const cobrador = cobradorEl?.value || currentUser || "—";
  if(!fecha) { toast("⚠️ Ingresá la nueva fecha de salida", false); return; }
  if(!monto) { toast("⚠️ Ingresá el monto adicional", false); return; }
  if(fecha <= r.hasta) { toast("⚠️ La nueva salida debe ser posterior a la actual", false); return; }

  const hoy = new Date();
  const pad = n => String(n).padStart(2,'0');
  const fechaHoy = `${pad(hoy.getDate())}/${pad(hoy.getMonth()+1)}/${hoy.getFullYear()}`;
  const notaExt = `Extensión el ${fechaHoy} ${fmtMonto(monto)} hasta ${fmtShort(fecha)}`;
  const notasActual = r.notas ? r.notas + "\n" + notaExt : notaExt;

  const exts = [...(r.extensiones || []), { hasta: fecha, monto, usuario: cobrador }];
  const nuevoMonto = r.monto + monto;
  const pagoMeta = parseComentarioPago(buildComentarioPagoFromReserva(r));
  pagoMeta.extensiones = exts;
  const comentarioPago = buildComentarioPago(pagoMeta);

  await supa.patch("reservas", id, { fecha_hasta: fecha, monto: nuevoMonto, comentario_pago: comentarioPago, notas: notasActual });
  r.hasta = fecha; r.monto = nuevoMonto; r.extensiones = exts; r.notas = notasActual;
  const res = reservas.find(x => x.id === id);
  if(res) { res.hasta = fecha; res.monto = nuevoMonto; res.extensiones = exts; res.notas = notasActual; }
  logAccion("Extensión de estadía", `${r.huesped} → ${fmtShort(fecha)} · +${fmtMonto(monto)} · ${cobrador}`);
  toast(`✓ Estadía extendida hasta ${fmtShort(fecha)}`);
  verDetalle(id);
}

async function eliminarExtension(id, idx) {
  const r = reservas.find(x => x.id === id);
  if(!r) return;
  const exts = [...(r.extensiones || [])];
  const ext = exts[idx];
  if(!ext) return;
  exts.splice(idx, 1);
  const nuevoMonto = r.monto - ext.monto;
  // Recalculate hasta: use latest remaining extension or original hasta
  const nuevaHasta = exts.length > 0 ? exts[exts.length-1].hasta : (exts.length === 0 ? r.desde : ext.hasta);
  const pagoMeta = parseComentarioPago(buildComentarioPagoFromReserva(r));
  pagoMeta.extensiones = exts;
  const comentarioPago = buildComentarioPago(pagoMeta);
  await supa.patch("reservas", id, { fecha_hasta: nuevaHasta, monto: nuevoMonto, comentario_pago: comentarioPago });
  r.hasta = nuevaHasta; r.monto = nuevoMonto; r.extensiones = exts;
  const res = reservas.find(x => x.id === id);
  if(res) { res.hasta = nuevaHasta; res.monto = nuevoMonto; res.extensiones = exts; }
  toast("✓ Extensión eliminada");
  verDetalle(id);
}

function buildComentarioPagoFromReserva(r) {
  return buildComentarioPago({
    comentario: r.comentarioPago || "",
    hayDeuda: r.hayDeuda,
    deudaMonto: r.deudaMonto,
    deudaComentario: r.deudaComentario,
    deudaTipo: r.deudaTipo,
    senaMonto: r.senaMonto,
    senaComentario: r.senaComentario,
    estadiaLarga: r.estadiaLarga,
    horarioNotas: r.horarioNotas,
    mostrarHorarios: r.mostrarHorarios,
    extensiones: r.extensiones || []
  });
}

// Debounce map
const _updateTimers = {};
const _ut = {};
// Debounce para updates desde inputs de grilla
const _updateDebounce = {};
function updateReservaDebounced(id, campo, valor) {
  const key = id + '_' + campo;
  clearTimeout(_updateDebounce[key]);
  _updateDebounce[key] = setTimeout(() => updateReserva(id, campo, valor), 600);
}

function updateReserva(id, campo, valor) {
  const r = reservas.find(x => x.id === id);
  if(!r) return;

  // Intercept cancelada — ask for confirmation first
  if(campo === "estado" && valor === "cancelada") {
    mostrarDialogoSalida(
      "¿Cancelar esta reserva?",
      `Se marcará como cancelada la reserva de <strong>${r.huesped}</strong>. Podés reactivarla después cambiando el estado.`,
      [
        { label: "No, volver", action: () => {
          // Revert the select back to previous value
          document.querySelectorAll(".de-input").forEach(el => {
            if(el.tagName === "SELECT" && el.onchange?.toString().includes(`'estado'`)) {
              el.value = r.estado;
            }
          });
        }},
        { label: "Sí, cancelar", action: () => {
          _doUpdateReserva(id, campo, valor);
        }}
      ]
    );
    return;
  }

  _doUpdateReserva(id, campo, valor);
}

function _doUpdateReserva(id, campo, valor) {
  const r = reservas.find(x => x.id === id);
  if(!r) return;
  if(campo === "cantHuespedes") valor = normalizeCantHuespedesValue(valor);
  if(campo === "horarioEntrada") valor = normalizeHoraInputValue(valor, DEFAULT_HORARIO_ENTRADA);
  if(campo === "horarioSalida") valor = normalizeHoraInputValue(valor, DEFAULT_HORARIO_SALIDA);
  const valorAnterior = campo === "hayDeuda" ? !!r.hayDeuda : r[campo];
  r[campo] = valor;

  // Si desasignan el depto, guardar null en Supabase
  if(campo === "aptoId" && (valor === 0 || valor === "0" || !valor)) {
    r.aptoId = null;
    supa.patch("reservas", id, { apto_id: null }).then(async () => {
      const res = await supa.get("reservas","order=fecha_desde");
      reservas = res.map(dbRes);
      actualizarTempBadge();
      renderTemp();
      render();
      toastSilent("✓ Movido a temporales");
    });
    return;
  }
  const colMap = { aptoId:"apto_id", desde:"fecha_desde", hasta:"fecha_hasta", medioPago:"medio_pago", horarioEntrada:"horario_entrada", horarioSalida:"horario_salida", cantHuespedes:"cant_huespedes", comentarioPago:"comentario_pago", reservaDe:"reserva_de", nacionalidad:"nacionalidad", notas:"notas", huesped:"huesped", contacto:"contacto", monto:"monto", estado:"estado", cobrador:"cobrador", ingreso:"ingreso", pago:"pago" };
  if(campo === "hayDeuda" || campo === "deudaMonto" || campo === "deudaComentario" || campo === "deudaTipo" || campo === "senaMonto" || campo === "senaComentario" || campo === "estadiaLarga" || campo === "horarioNotas" || campo === "mostrarHorarios") {
    if(campo === "hayDeuda") r.hayDeuda = !!valor;
    if(campo === "deudaMonto") r.deudaMonto = Number(valor) || 0;
    if(campo === "deudaComentario") r.deudaComentario = (valor || "").toString();
    if(campo === "deudaTipo") r.deudaTipo = valor || "deuda";
    if(campo === "senaMonto") r.senaMonto = Number(valor) || 0;
    if(campo === "senaComentario") r.senaComentario = (valor || "").toString();
    if(campo === "estadiaLarga") r.estadiaLarga = !!valor;
    if(campo === "horarioNotas") r.horarioNotas = (valor || "").toString();
    if(campo === "mostrarHorarios") r.mostrarHorarios = !!valor;
    campo = "comentarioPago";
    valor = buildComentarioPago(pagoMetaFromReserva(r));
    r.comentarioPago = parseComentarioPago(valor).comentario;
  }
  const dbCol = colMap[campo] || campo;
  clearTimeout(_ut[id]);
  _ut[id] = setTimeout(() => {
    supa.patch("reservas", id, { [dbCol]: valor });
    toastSilent("✓ Guardado");
  }, 600);

  const labels = { huesped:"Huésped", contacto:"Teléfono", desde:"Check-in", hasta:"Check-out", monto:"Monto", estado:"Estado", cobrador:"Cobrador", medioPago:"Medio de pago", pago:"Pago", ingreso:"Ingreso", horarioEntrada:"Horario entrada", horarioSalida:"Horario salida", horarioNotas:"Notas horario", mostrarHorarios:"Mostrar horarios", cantHuespedes:"Cant. huéspedes", notas:"Notas", aptoId:"Departamento", reservaDe:"Reserva de", comentarioPago:"Deuda", deudaMonto:"Monto adeudado", deudaComentario:"Comentario deuda", estadiaLarga:"Estadía larga" };
  if(labels[campo] && String(valorAnterior) !== String(valor)) {
    const depto = aptos.find(x=>x.id===r.aptoId)?.nombre || "?";
    let antes, despues;
    if(campo==="desde"||campo==="hasta"){ antes=valorAnterior?fmt(valorAnterior):"—"; despues=valor?fmt(valor):"—"; }
    else if(campo==="pago"||campo==="ingreso"){ antes=valorAnterior?"Sí":"No"; despues=valor?"Sí":"No"; }
    else if(campo==="comentarioPago" && labels[campo]==="Deuda"){ antes=valorAnterior?"Sí":"No"; despues=r.hayDeuda?"Sí":"No"; }
    else if(campo==="deudaMonto"){ antes=valorAnterior?fmtMonto(valorAnterior):"—"; despues=valor?fmtMonto(valor):"—"; }
    else if(campo==="aptoId"){ antes=aptos.find(x=>x.id===valorAnterior)?.nombre||String(valorAnterior); despues=aptos.find(x=>x.id===valor)?.nombre||String(valor); }
    else { antes=valorAnterior!==undefined&&valorAnterior!==""?String(valorAnterior):"—"; despues=valor!==undefined&&valor!==""?String(valor):"—"; }
    logAccion(`${labels[campo]}: ${antes} → ${despues}`, `${r.huesped} · ${depto}`);
  }
  render(r.aptoId); // only re-render the affected card
  try { renderAgenda(); } catch(e) {}
}

async function eliminarReserva(id) {
  if(!confirm("¿Eliminar esta reserva?")) return;
  const ok = await supa.del("reservas", id);
  console.log("[eliminar] id:", id, "ok:", ok);
  if(!ok) { toast("✗ No se pudo eliminar de Supabase", false); return; }
  reservas = reservas.filter(r => r.id !== id);
  closeModal("modalDetalle");
  logAccion("Reserva eliminada", `ID ${id}`);
  render();
  toast("✓ Reserva eliminada");
}

// ─── FILTER ────────────────────────────────────────────
function toggleFiltroUsuario() {
  const menu = document.getElementById("filtroUsuarioMenu");
  if(menu.style.display === "block") { menu.style.display = "none"; return; }

  const items = [
    { label: "Todos los deptos", value: "" },
    ...usuarios.map(u => ({ label: u.nombre + (u.rol ? ` — ${u.rol}` : ""), value: u.nombre }))
  ];

  menu.innerHTML = items.map(item => `
    <button onclick="setFiltroUsuario('${item.value.replace(/'/g,"\\'")}', '${item.label.replace(/'/g,"\\'")}');document.getElementById('filtroUsuarioMenu').style.display='none'"
      style="display:block;width:100%;padding:8px 12px;background:${currentUserFilter===item.value?'var(--gold-dim)':'transparent'};
        border:none;color:${currentUserFilter===item.value?'var(--gold)':'var(--text)'};
        font-family:'DM Sans',sans-serif;font-size:0.82rem;text-align:left;
        cursor:pointer;border-radius:7px;transition:background 0.12s"
      onmouseover="if('${item.value}'!==currentUserFilter)this.style.background='var(--bg3)'"
      onmouseout="if('${item.value}'!==currentUserFilter)this.style.background='transparent'">
      ${item.label}
    </button>`).join("");

  menu.style.display = "block";
  setTimeout(() => {
    document.addEventListener("click", function h(e) {
      if(!menu.contains(e.target) && !document.getElementById("btnFiltroUsuario").contains(e.target)) {
        menu.style.display = "none";
        document.removeEventListener("click", h);
      }
    });
  }, 10);
}

function setFiltroUsuario(valor, label) {
  currentUserFilter = valor;
  const lbl = document.getElementById("filtroUsuarioLabel");
  const btn = document.getElementById("btnFiltroUsuario");
  if(valor) {
    lbl.textContent = valor;
    btn.style.borderColor = "var(--gold)";
    btn.style.color = "var(--gold)";
  } else {
    lbl.textContent = "Filtrar por usuario";
    btn.style.borderColor = "";
    btn.style.color = "";
  }
  persistDeptoFilters();
  render();
}

function filterApts(filter, btn) {
  // Toggle: si ya está activo, volver a todos
  if(currentFilter === filter) {
    currentFilter = "todos";
  } else {
    currentFilter = filter;
  }
  syncDeptoFilterControls(null);
  persistDeptoFilters();
  renderGrid();
}

// ─── TOAST ─────────────────────────────────────────────
function toastSilent(msg) {
  const t = document.getElementById("toast");
  if(!t) return;
  t.textContent = msg;
  t.style.background = "var(--bg3)";
  t.style.color = "var(--text3)";
  t.style.border = "1px solid var(--border)";
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 1200);
}

function toast(msg, ok = true) {
  const t = document.getElementById("toast");
  if(!t) return;
  const msgEl = document.getElementById("toastMsg");
  if(msgEl) msgEl.textContent = msg;
  else t.textContent = msg;
  t.style.borderColor = ok ? "var(--green)" : "var(--orange)";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}

// ─── PAGE SWITCHING ──────────────────────────────────────
function switchPage(page, btn) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
  document.getElementById("page" + page.charAt(0).toUpperCase() + page.slice(1)).classList.add("active");
  btn.classList.add("active");
  if(page === "deptos")      { applyStoredDeptoFilters(); renderStats(); renderGrid(); }
  if(page === "agenda")      renderAgenda();
  if(page === "control")     { if(!activityLog.length) supa.get("activity_log","order=created_at.desc&limit=500").then(l=>{ activityLog=l.map(dbLog); renderControl(); }); else renderControl(); const ta = document.getElementById("wa_mensaje"); if(ta) { ta.value = mensajeWA; actualizarPreviewWA(); } }
  if(page === "estadistica") {
    renderEstadistica(); renderAgendaClientes();
    if(!activityLog.length) {
      supa.get("activity_log","order=created_at.desc&limit=500").then(l => {
        activityLog = l.map(dbLog);
        renderLogSeccion();
      });
    } else {
      renderLogSeccion();
    }
  }
  if(page === "gastos")      renderGastos();
  if(page === "temp")        renderTemp();
  const zBtn = document.getElementById("zoomToggleBtn");
  if(zBtn) zBtn.style.display = page === "deptos" ? "flex" : "none";
  syncMobileZoomButtonsLayout();
  // Show scroll nav buttons only on deptos
  document.getElementById("scrollEdgeLeft")?.[page==="deptos"?"classList":"classList"][page==="deptos"?"add":"remove"]("visible");
  document.getElementById("scrollEdgeRight")?.[page==="deptos"?"classList":"classList"][page==="deptos"?"add":"remove"]("visible");
}

// ─── CONTROL ─────────────────────────────────────────────
function renderControl() {
  // Usuarios
  const ul = document.getElementById("usuariosList");
  ul.innerHTML = usuarios.length === 0
    ? `<div class="control-empty">No hay usuarios cargados</div>`
    : usuarios.map(u => `
        <div class="control-item">
          <div class="control-item-left">
            ${(_editingUsuarioId === u.id) ? `
              <div class="control-user-editor">
                <div class="control-user-editor-grid">
                  <div class="control-field">
                    <label class="form-label">Nombre</label>
                    <input class="form-input" type="text" id="eu_nombre" value="${(u.nombre||"").replace(/"/g,'&quot;')}">
                  </div>
                  <div class="control-field">
                    <label class="form-label">Rol</label>
                    <select class="form-input" id="eu_rol">
                      <option value="Administrador" ${normalizarRol(u.rol)==="Administrador"?"selected":""}>Administrador</option>
                      <option value="Colaborador" ${normalizarRol(u.rol)==="Colaborador"?"selected":""}>Colaborador</option>
                      <option value="Cobrador" ${normalizarRol(u.rol)==="Cobrador"?"selected":""}>Cobrador</option>
                    </select>
                  </div>
                  <div class="control-field">
                    <label class="form-label">Email</label>
                    <input class="form-input" type="email" id="eu_email" value="${(u.email||"").replace(/"/g,'&quot;')}">
                  </div>
                  <div class="control-field">
                    <label class="form-label">Teléfono</label>
                    <input class="form-input" type="text" id="eu_telefono" value="${(u.telefono||"").replace(/"/g,'&quot;')}">
                  </div>
                </div>
                <div class="control-user-editor-footer">
                  <div class="control-color-card">
                    <label class="form-label">Color</label>
                    <div class="control-color-row">
                      <input class="control-color-input" type="color" id="eu_color" value="${u.color || "#4a85be"}" oninput="this.nextElementSibling.style.background=this.value">
                      <div class="control-color-swatch" style="background:${u.color || "#4a85be"}"></div>
                    </div>
                  </div>
                  <div class="control-item-actions control-item-actions-edit">
                    <button onclick="toggleParticipaGastos(${u.id})"
                      class="control-pill-btn ${u.participaGastos!==false ? "is-active" : ""}">
                      ${u.participaGastos!==false?'✓ Gastos':'✗ Gastos'}
                    </button>
                    <button class="btn btn-gold btn-sm" onclick="guardarEdicionUsuario(${u.id})">Guardar</button>
                    <button class="btn btn-ghost btn-sm" onclick="cancelarEditarUsuario()">Cancelar</button>
                  </div>
                </div>
              </div>
            ` : `
              <div class="control-item-name"><span class="control-user-dot" style="--user-color:${u.color || "#4a85be"}"></span>${u.nombre}${u.rol ? ` <span class="control-role-label">— ${u.rol}</span>` : ""}</div>
              ${u.email ? `<div class="control-item-sub">✉ ${u.email}</div>` : `<div class="control-item-sub control-item-sub-missing">Sin email</div>`}
              ${u.telefono ? `<div class="control-item-sub">📱 ${u.telefono}</div>` : ""}
            `}
          </div>
          ${(_editingUsuarioId === u.id) ? `` : `
          <div class="control-item-actions">
            <button onclick="toggleParticipaGastos(${u.id})"
              class="control-pill-btn ${u.participaGastos!==false ? "is-active" : ""}">
              ${u.participaGastos!==false?'✓ Gastos':'✗ Gastos'}
            </button>
            <button class="btn btn-ghost btn-sm" onclick="abrirEditarUsuario(${u.id})" title="Editar">Editar</button>
            <button class="btn-icon danger" onclick="eliminarUsuario(${u.id})" title="Eliminar">✕</button>
          </div>`}
        </div>`).join("");

  // Medios
  const ml = document.getElementById("mediosList");
  ml.innerHTML = mediosPago.length === 0
    ? `<div class="control-empty">No hay medios de pago cargados</div>`
    : mediosPago.map(m => `
        <div class="control-item">
          <div class="control-item-left">
            <div class="control-item-name">${m.nombre}</div>
          </div>
          <div class="control-item-actions">
            <button class="btn-icon danger" onclick="eliminarMedio(${m.id})" title="Eliminar">✕</button>
          </div>
        </div>`).join("");

  const tiposEl = document.getElementById("tiposGastoList");
  if(tiposEl) {
    tiposEl.innerHTML = tiposGasto.length === 0
      ? `<div class="control-empty">No hay tipos de gasto cargados</div>`
      : tiposGasto.map(t => `
          <div class="control-item">
            <div class="control-item-left">
              ${editingTipoGasto === t
                ? `<div style="display:flex;gap:8px;align-items:center;width:100%">
                    <input class="form-input" type="text" id="editTipoGastoInput" value="${t.replace(/"/g,'&quot;')}" style="max-width:260px">
                    <button class="btn btn-gold btn-sm" onclick="guardarEdicionTipoGasto('${t.replace(/'/g,"\\'")}')">Guardar</button>
                    <button class="btn btn-ghost btn-sm" onclick="cancelarEdicionTipoGasto()">Cancelar</button>
                  </div>`
                : `<div class="control-item-name">${t}</div>`}
            </div>
            <div class="control-item-actions">
              ${editingTipoGasto === t ? "" : `<button class="btn btn-ghost btn-sm" onclick="editarTipoGasto('${t.replace(/'/g,"\\'")}')">Editar</button>`}
              <button class="btn btn-ghost btn-sm" onclick="eliminarTipoGasto('${t.replace(/'/g,"\\'")}')" style="color:var(--red);border-color:var(--red-dim)">Eliminar</button>
            </div>
          </div>`).join("");
  }

  const coloresEl = document.getElementById("reservaColoresList");
  if(coloresEl) {
    coloresEl.innerHTML = Object.entries(RESERVA_COLOR_RULE_LABELS).map(([key, label]) => `
      <div class="control-item control-color-rule-item">
        <div class="control-item-left">
          <div class="control-item-name">${label}</div>
          <div class="control-item-sub">Color usado para esta incidencia en las reservas</div>
        </div>
          <div class="control-item-actions">
            <div class="control-color-row">
              <input class="control-color-input" type="color" value="${getReservaRuleColor(key)}"
              onchange="actualizarColorIncidenciaReserva('${key}', this.value)">
            <div class="control-color-swatch" style="background:${getReservaRuleColor(key)}"></div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="restablecerColorIncidenciaReserva('${key}')">Default</button>
        </div>
      </div>`).join("");
  }
}
function actualizarColorIncidenciaReserva(key, color) {
  reservaColorRules = setStoredReservaColorRules({ ...reservaColorRules, [key]: color });
  renderControl();
  render();
  renderAgenda();
  toast("✓ Color actualizado");
}
function restablecerColorIncidenciaReserva(key) {
  reservaColorRules = setStoredReservaColorRules({ ...reservaColorRules, [key]: DEFAULT_RESERVA_COLOR_RULES[key] });
  renderControl();
  render();
  renderAgenda();
  toast("✓ Color restablecido");
}

function abrirAddUsuario() {
  document.getElementById("addUsuarioForm").style.display = "block";
  document.getElementById("nu_nombre").focus();
}
function cancelarAddUsuario() {
  document.getElementById("addUsuarioForm").style.display = "none";
  document.getElementById("nu_nombre").value = "";
  document.getElementById("nu_rol").value = "";
  document.getElementById("nu_email").value = "";
  document.getElementById("nu_telefono").value = "";
  document.getElementById("nu_color").value = "#4a85be";
}
async function guardarUsuario() {
  const nombre   = document.getElementById("nu_nombre").value.trim();
  const rol      = normalizarRol(document.getElementById("nu_rol").value);
  const email    = document.getElementById("nu_email").value.trim();
  const telefono = document.getElementById("nu_telefono").value.trim();
  const color    = document.getElementById("nu_color").value || "#4a85be";
  if(!nombre) { toast("⚠️ Ingresá un nombre", false); return; }
  if(!ROLES_VALIDOS.includes(rol)) { toast("⚠️ Elegí un rol válido", false); return; }
  setStoredUserColor(nombre, color);
  const { record, colorPersisted } = await saveUsuarioRecord("post", { nombre, rol, email, telefono, color });
  if(record) {
    usuarios.push(dbUser(record));
    const nuevo = usuarios[usuarios.length - 1];
    nuevo.color = color;
    cancelarAddUsuario();
    renderControl();
    toast(colorPersisted ? "✓ Usuario agregado" : "✓ Usuario agregado. El color quedó guardado localmente");
    return;
  }
  deleteStoredUserColor(nombre);
  toast("⚠️ No se pudo guardar el usuario", false);
}
async function eliminarUsuario(id) {
  const user = usuarios.find(u => u.id === id);
  await supa.del("usuarios", id);
  usuarios = usuarios.filter(u => u.id !== id);
  if(user) deleteStoredUserColor(user.nombre);
  renderControl(); toast("✓ Usuario eliminado");
}

let _editingUsuarioId = null;
function abrirEditarUsuario(id) {
  _editingUsuarioId = id;
  renderControl();
  setTimeout(() => document.getElementById("eu_nombre")?.focus(), 50);
}
function cancelarEditarUsuario() {
  _editingUsuarioId = null;
  renderControl();
}
async function guardarEdicionUsuario(id) {
  const u = usuarios.find(x => x.id === id);
  if(!u) return;
  const oldNombre = u.nombre;
  const nombre = document.getElementById("eu_nombre")?.value.trim() || "";
  const rol = normalizarRol(document.getElementById("eu_rol")?.value || "");
  const email = document.getElementById("eu_email")?.value.trim() || "";
  const telefono = document.getElementById("eu_telefono")?.value.trim() || "";
  const color = document.getElementById("eu_color")?.value || "#4a85be";
  if(!nombre) { toast("⚠️ Ingresá un nombre", false); return; }
  if(!ROLES_VALIDOS.includes(rol)) { toast("⚠️ Elegí un rol válido", false); return; }
  renameStoredUserColor(oldNombre, nombre, color);
  const { record, colorPersisted } = await saveUsuarioRecord("patch", { nombre, rol, email, telefono, color }, id);
  if(!record) {
    renameStoredUserColor(nombre, oldNombre, u.color || "#4a85be");
    toast("⚠️ No se pudo actualizar el usuario", false);
    return;
  }
  u.nombre = nombre;
  u.rol = rol;
  u.email = email;
  u.telefono = telefono;
  u.color = color;
  _editingUsuarioId = null;
  renderControl();
  toast(colorPersisted ? "✓ Usuario actualizado" : "✓ Usuario actualizado. El color quedó guardado localmente");
}

function irAUsuarios() {
  const btn = document.getElementById("navControl");
  if(btn) switchPage("control", btn);
  setTimeout(() => {
    document.getElementById("usuariosSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 50);
}

function toggleParticipaGastos(id) {
  const u = usuarios.find(x => x.id === id);
  if(!u) return;
  u.participaGastos = u.participaGastos === false ? true : false;
  // Persist to Supabase if column exists, otherwise just in memory
  supa.patch("usuarios", id, { participa_gastos: u.participaGastos }).catch(()=>{});
  renderControl();
  toast(`${u.nombre} ${u.participaGastos ? "participa" : "no participa"} en gastos`);
}

function abrirAddMedio() {
  document.getElementById("addMedioForm").style.display = "block";
  document.getElementById("nm_nombre").focus();
}
function cancelarAddMedio() {
  document.getElementById("addMedioForm").style.display = "none";
  document.getElementById("nm_nombre").value = "";
}
async function guardarMedio() {
  const nombre = document.getElementById("nm_nombre").value.trim();
  if(!nombre) { toast("⚠️ Ingresá un nombre", false); return; }
  const cr = await supa.post("medios_pago", { nombre });
  if(cr) mediosPago.push({ id: cr.id, nombre });
  cancelarAddMedio(); renderControl(); toast("✓ Medio de pago agregado");
}
async function eliminarMedio(id) {
  await supa.del("medios_pago", id);
  mediosPago = mediosPago.filter(m => m.id !== id);
  renderControl(); toast("✓ Medio de pago eliminado");
}

function abrirAddTipoGasto() {
  const form = document.getElementById("addTipoGastoForm");
  if(form) form.style.display = "block";
  document.getElementById("ntg_nombre")?.focus();
}
function cancelarAddTipoGasto() {
  const form = document.getElementById("addTipoGastoForm");
  if(form) form.style.display = "none";
  const input = document.getElementById("ntg_nombre");
  if(input) input.value = "";
}
function guardarTipoGasto() {
  const input = document.getElementById("ntg_nombre");
  const nombre = input?.value.trim();
  if(!nombre) { toast("⚠️ Ingresá un tipo de gasto", false); return; }
  const key = normalizeGastoTypeKey(nombre);
  if(tiposGasto.some(t => normalizeGastoTypeKey(t) === key)) {
    toast("⚠️ Esa categoría ya existe", false);
    return;
  }
  tiposGasto = sanitizeGastoTypes([...tiposGasto, nombre]);
  setStoredGastoTypes(tiposGasto);
  cancelarAddTipoGasto();
  renderControl();
  toast("✓ Tipo de gasto agregado");
}
function editarTipoGasto(nombre) {
  editingTipoGasto = nombre;
  renderControl();
}
function cancelarEdicionTipoGasto() {
  editingTipoGasto = "";
  renderControl();
}
function guardarEdicionTipoGasto(nombreActual) {
  const input = document.getElementById("editTipoGastoInput");
  const nuevo = input?.value.trim();
  if(!nuevo) { toast("⚠️ Ingresá un nombre", false); return; }
  const actualKey = normalizeGastoTypeKey(nombreActual);
  const nuevoKey = normalizeGastoTypeKey(nuevo);
  const yaExiste = tiposGasto.some(t => normalizeGastoTypeKey(t) === nuevoKey && normalizeGastoTypeKey(t) !== actualKey);
  if(yaExiste) {
    toast("⚠️ Ya existe una categoría con ese nombre", false);
    return;
  }
  tiposGasto = sanitizeGastoTypes(tiposGasto.map(t => normalizeGastoTypeKey(t) === actualKey ? nuevo : t));
  setStoredGastoTypes(tiposGasto);
  const categoriaFinal = resolveGastoTypeName(nuevo, nuevo);
  const catMap = getStoredGastoCategories();
  gastos.forEach(g => {
    if(normalizeGastoTypeKey(g.categoria) === actualKey) {
      g.categoria = categoriaFinal;
      if(g.id) catMap[String(g.id)] = categoriaFinal;
    }
  });
  Object.keys(catMap).forEach(id => {
    if(normalizeGastoTypeKey(catMap[id]) === actualKey) catMap[id] = categoriaFinal;
  });
  try { localStorage.setItem(GASTO_CATEGORY_STORAGE_KEY, JSON.stringify(catMap)); } catch(e) {}
  editingTipoGasto = "";
  renderControl();
  renderGastos();
  toast("✓ Tipo de gasto actualizado");
}
function eliminarTipoGasto(nombre) {
  const key = normalizeGastoTypeKey(nombre);
  tiposGasto = sanitizeGastoTypes(tiposGasto.filter(t => normalizeGastoTypeKey(t) !== key));
  setStoredGastoTypes(tiposGasto);
  const catMap = getStoredGastoCategories();
  gastos.forEach(g => {
    if(normalizeGastoTypeKey(g.categoria) === key) {
      g.categoria = DEFAULT_GASTO_TYPE_FALLBACK;
      if(g.id) catMap[String(g.id)] = DEFAULT_GASTO_TYPE_FALLBACK;
    }
  });
  Object.keys(catMap).forEach(id => {
    if(normalizeGastoTypeKey(catMap[id]) === key) catMap[id] = DEFAULT_GASTO_TYPE_FALLBACK;
  });
  try { localStorage.setItem(GASTO_CATEGORY_STORAGE_KEY, JSON.stringify(catMap)); } catch(e) {}
  editingTipoGasto = "";
  renderControl();
  renderGastos();
  toast("✓ Tipo de gasto eliminado");
}
function poblarCategoriasGasto(selected = DEFAULT_GASTO_TYPE_FALLBACK) {
  const sel = document.getElementById("g_categoria");
  if(!sel) return;
  if(!tiposGasto.length) tiposGasto = getStoredGastoTypes();
  tiposGasto = sanitizeGastoTypes(tiposGasto);
  const selectedNombre = resolveGastoTypeName(selected, DEFAULT_GASTO_TYPE_FALLBACK);
  sel.innerHTML = tiposGasto.map(t => `<option value="${t}" ${t===selectedNombre?"selected":""}>${t}</option>`).join("");
}
function sortGastos(campo) {
  if(gastosSort.campo === campo) gastosSort.dir = gastosSort.dir === "asc" ? "desc" : "asc";
  else { gastosSort.campo = campo; gastosSort.dir = campo === "fecha" ? "desc" : "asc"; }
  renderGastos();
}

// ─── HOJA DEL DÍA ────────────────────────────────────────
let hojaDiaMode = "limpiezas";

function abrirHojaDia() {
  hojaDiaMode = "limpiezas";
  // Default: tomorrow
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const pad = n => String(n).padStart(2,'0');
  const tomorrowKey = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth()+1)}-${pad(tomorrow.getDate())}`;
  const fechaEl = document.getElementById("hojaDiaFecha");
  if(fechaEl) fechaEl.value = tomorrowKey;
  renderHojaDiaParaFecha(tomorrowKey);
  openModal("modalHojaDia");
}

function renderHojaDiaParaFecha(dateKey) {
  if(!dateKey) return;
  const DIAS_ES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const [y,m,d] = dateKey.split('-').map(Number);
  const dateObj = new Date(y, m-1, d);
  const titulo = `${DIAS_ES[dateObj.getDay()]} ${d} de ${MESES[m-1]} ${y}`;
  document.getElementById("hojaDiaTitulo").textContent = `Limpiezas — ${titulo}`;

  const entradas = reservas.filter(r => r.estado !== "cancelada" && r.desde === dateKey);
  const salidas  = reservas.filter(r => r.estado !== "cancelada" && r.hasta === dateKey);

  const sortPorHorario = (arr, campo) =>
    [...arr].sort((a,b) => (a[campo]||"99:99").localeCompare(b[campo]||"99:99"));

  const renderFila = (r, tipo) => {
    const a        = aptos.find(x => x.id === r.aptoId);
    const esEntrada = tipo === "entrada";
    const horarioEntrada = fmtHora24(r.horarioEntrada, fmtHora24(DEFAULT_HORARIO_ENTRADA));
    const horarioSalida = fmtHora24(r.horarioSalida, fmtHora24(DEFAULT_HORARIO_SALIDA));
    const horarioNotas = (r.horarioNotas || "").trim();
    const color    = esEntrada ? "var(--green)" : "var(--red)";
    const bg       = esEntrada ? "var(--green-dim)" : "var(--red-dim)";

    let proxInfo = "";
    let dejarListoTag = "";
    if(!esEntrada) {
      const proxReserva = reservas
        .filter(rx => rx.aptoId === r.aptoId && rx.estado !== "cancelada" && rx.desde > dateKey)
        .sort((a,b) => a.desde.localeCompare(b.desde))[0];
      if(proxReserva) {
        const cantHuespedes = proxReserva.cantHuespedes || "—";
        const diasHasta = diffDays(dateKey, proxReserva.desde);
        const cantStr = cantHuespedes !== "—" ? `${cantHuespedes} huésped${cantHuespedes!==1?"es":""}` : "? huéspedes";
        dejarListoTag = `<span style="background:var(--orange-dim);color:var(--orange);font-size:0.62rem;font-weight:700;padding:2px 7px;border-radius:6px;border:1px solid rgba(232,144,80,0.3);text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap">Dejar listo para ${cantStr}</span>`;
        proxInfo = `<div class="hoja-prox">Próx. reserva: <strong>${proxReserva.huesped}</strong> · ${diasHasta === 0 ? "hoy" : `en ${diasHasta}d (${fmt(proxReserva.desde)})`} · ${cantStr}</div>`;
      } else {
        proxInfo = `<div class="hoja-prox" style="color:var(--green)">Sin próxima reserva</div>`;
      }
    }

    const _hc = getAdminColor(getReservaOwnerName(r));
    const _hdot = _hc?`<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${_hc.dot};flex-shrink:0"></span>`:"";
    return `<div class="hoja-row" style="flex-direction:column;align-items:flex-start;gap:6px;${_hc?`border-left:3px solid ${_hc.dot};padding-left:10px;`:""}">
      <div style="display:flex;align-items:center;gap:12px;width:100%;flex-wrap:wrap">
        <div class="hoja-horario" style="color:${color}">E ${horarioEntrada} · S ${horarioSalida}</div>
        <div class="hoja-badge" style="background:${bg};color:${color}">${esEntrada ? "↓ Entrada" : "↑ Salida"}</div>
        <div class="hoja-depto">${a ? a.nombre : "—"}</div>
        <div style="display:flex;align-items:center;gap:5px">${_hdot}<div class="hoja-huesped">${r.huesped}</div></div>
        ${dejarListoTag}
      </div>
      ${horarioNotas ? `<div class="hoja-prox" style="margin-top:0"><strong>Horario:</strong> ${horarioNotas}</div>` : ""}
      ${proxInfo}
    </div>`;
  };

  let html = "";
  if(entradas.length === 0 && salidas.length === 0) {
    html = `<div class="agenda-empty">No hay entradas ni salidas para este día.</div>`;
  } else {
    if(salidas.length) {
      html += `<div class="hoja-section"><div class="hoja-section-title" style="color:var(--red)">↑ Salidas (${salidas.length})</div>${sortPorHorario(salidas, "horarioSalida").map(r => renderFila(r, "salida")).join("")}</div>`;
    }
    if(entradas.length) {
      html += `<div class="hoja-section"><div class="hoja-section-title" style="color:var(--green)">↓ Entradas (${entradas.length})</div>${sortPorHorario(entradas, "horarioEntrada").map(r => renderFila(r, "entrada")).join("")}</div>`;
    }
  }
  document.getElementById("hojaDiaContent").innerHTML = html;
}

function abrirHojaImpagos() {
  hojaDiaMode = "impagos";
  const DIAS_ES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const titulo  = `${DIAS_ES[today.getDay()]} ${today.getDate()} de ${MESES[today.getMonth()]} ${today.getFullYear()}`;
  document.getElementById("hojaDiaTitulo").textContent = `Impagos ingresados — ${titulo}`;

  const impagos = reservas
    .filter(r => r.estado !== "cancelada" && !!r.ingreso && !r.pago)
    .sort((a,b) => {
      const aptoA = aptos.find(x => x.id === a.aptoId)?.nombre || "";
      const aptoB = aptos.find(x => x.id === b.aptoId)?.nombre || "";
      return aptoA.localeCompare(aptoB, "es", { numeric: true }) || (rSortName(a).localeCompare(rSortName(b), "es"));
    });

  let html = "";
  if(impagos.length === 0) {
    html = `<div class="agenda-empty">No hay reservas ingresadas e impagas.</div>`;
  } else {
    html = `<div class="hoja-section">
      <div class="hoja-section-title" style="color:var(--orange)">Pendientes de cobro (${impagos.length})</div>
      ${impagos.map(renderFilaImpagoHoja).join("")}
    </div>`;
  }

  document.getElementById("hojaDiaContent").innerHTML = html;
  openModal("modalHojaDia");
}

function rSortName(r) {
  return `${r.huesped || ""} ${r.reservaDe || ""}`.trim();
}

function safeText(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderFilaImpagoHoja(r) {
  const a = aptos.find(x => x.id === r.aptoId);
  const owner = r.reservaDe || "Sin asignar";
  const monto = fmtMonto(r.monto);
  const _hc = getAdminColor(getReservaOwnerName(r));
  const _dot = _hc ? `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${_hc.dot};flex-shrink:0"></span>` : "";
  const comentarioPago = r.comentarioPago ? `<div class="hoja-prox" style="margin-top:2px">Nota: <strong>${safeText(r.comentarioPago)}</strong></div>` : "";
  return `<div class="hoja-row" style="flex-direction:column;align-items:flex-start;gap:6px;${_hc?`border-left:3px solid ${_hc.dot};padding-left:10px;`:""}">
    <div style="display:flex;align-items:center;gap:12px;width:100%;flex-wrap:wrap">
      <div class="hoja-badge" style="background:var(--orange-dim);color:var(--orange)">Impago</div>
      <div class="hoja-depto">${a ? a.nombre : "—"}</div>
      <div style="display:flex;align-items:center;gap:5px">${_dot}<div class="hoja-huesped">${r.huesped || "Sin huésped"}</div></div>
      <div class="hoja-prox" style="width:auto;padding:5px 10px"><strong>Reserva de:</strong> ${safeText(owner)}</div>
      <div class="hoja-horario" style="color:var(--gold);margin-left:auto">${monto}</div>
    </div>
    ${comentarioPago}
  </div>`;
}

function toggleWaUserMenu() {
  const menu = document.getElementById("waUserMenu");
  if(menu.style.display === "block") { menu.style.display = "none"; return; }

  const conTel = usuarios.filter(u => u.email || u.nombre); // show all users
  if(conTel.length === 0) {
    menu.innerHTML = `<div style="padding:8px 10px;font-size:0.78rem;color:var(--text3)">No hay usuarios cargados</div>`;
  } else {
    const waAction = hojaDiaMode === "impagos" ? "enviarHojaImpagosPorWA" : "enviarHojaDiaPorWA";
    menu.innerHTML = conTel.map(u => `
      <button onclick="${waAction}('${u.nombre.replace(/'/g,"\\'")}');document.getElementById('waUserMenu').style.display='none'"
        style="display:block;width:100%;padding:8px 12px;background:transparent;border:none;
          color:var(--text);font-family:'DM Sans',sans-serif;font-size:0.82rem;
          text-align:left;cursor:pointer;border-radius:7px;transition:background 0.12s"
        onmouseover="this.style.background='var(--bg3)'"
        onmouseout="this.style.background='transparent'">
        ${u.nombre}${u.rol ? ` <span style="color:var(--text3);font-size:0.72rem">— ${u.rol}</span>` : ""}
      </button>`).join("");
  }
  menu.style.display = "block";

  // Close on outside click
  setTimeout(() => {
    document.addEventListener("click", function handler(e) {
      if(!menu.contains(e.target)) { menu.style.display = "none"; document.removeEventListener("click", handler); }
    });
  }, 10);
}

function enviarHojaDiaPorWA(nombreUsuario) {
  const u = usuarios.find(x => x.nombre === nombreUsuario);
  // Build plain-text report from current hojaDiaContent DOM
  const DIAS_ES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const titulo  = `${DIAS_ES[today.getDay()]} ${today.getDate()} de ${MESES[today.getMonth()]} ${today.getFullYear()}`;
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const salidas  = reservas.filter(r => r.estado !== "cancelada" && r.hasta === todayKey);
  const entradas = reservas.filter(r => r.estado !== "cancelada" && r.desde === todayKey);
  const sortH    = (arr, campo) => [...arr].sort((a,b) => (a[campo]||"99:99").localeCompare(b[campo]||"99:99"));

  let lines = [`🧹 *Limpiezas — ${titulo}*`, ""];

  if(salidas.length) {
    lines.push("*↑ SALIDAS*");
    sortH(salidas, "horarioSalida").forEach(r => {
      const a = aptos.find(x => x.id === r.aptoId);
      const depto = a ? a.nombre : "?";
      const prox = reservas.filter(rx => rx.aptoId === r.aptoId && rx.estado !== "cancelada" && rx.desde > todayKey)
        .sort((a,b) => a.desde.localeCompare(b.desde))[0];
      const dejarListo = prox && prox.cantHuespedes ? ` — Dejar listo para ${prox.cantHuespedes} huésped${prox.cantHuespedes!==1?"es":""}` : "";
      lines.push(`• E ${fmtHora24(r.horarioEntrada, fmtHora24(DEFAULT_HORARIO_ENTRADA))} · S ${fmtHora24(r.horarioSalida, fmtHora24(DEFAULT_HORARIO_SALIDA))} | 🏠 Depto ${depto}${dejarListo}`);
      if(r.horarioNotas) lines.push(`  🕒 ${r.horarioNotas}`);
      if(r.notas) lines.push(`  📝 ${r.notas}`);
      if(prox) {
        const dias = diffDays(todayKey, prox.desde);
        lines.push(`  ↳ Próx entrada: ${dias === 0 ? "hoy" : `en ${dias}d (${fmt(prox.desde)})`}`);
        if(prox.notas) lines.push(`     📝 ${prox.notas}`);
      }
    });
    lines.push("");
  }

  if(entradas.length) {
    lines.push("*↓ ENTRADAS*");
    sortH(entradas, "horarioEntrada").forEach(r => {
      const a = aptos.find(x => x.id === r.aptoId);
      const depto = a ? a.nombre : "?";
      const cant = r.cantHuespedes ? ` · ${r.cantHuespedes} huésped${r.cantHuespedes!==1?"es":""}` : "";
      lines.push(`• E ${fmtHora24(r.horarioEntrada, fmtHora24(DEFAULT_HORARIO_ENTRADA))} · S ${fmtHora24(r.horarioSalida, fmtHora24(DEFAULT_HORARIO_SALIDA))} | 🏠 Depto ${depto}${cant}`);
      if(r.horarioNotas) lines.push(`  🕒 ${r.horarioNotas}`);
      if(r.notas) lines.push(`  📝 ${r.notas}`);
    });
  }

  const texto = lines.join("\n");

  // Get phone from contacto field if stored, otherwise just open WA without number
  // Try to find a phone associated to the user (stored in u.telefono if any)
  const tel = u && u.telefono ? u.telefono.replace(/[^\d+]/g, "") : "";
  const url = tel
    ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.open(url, "_blank");
}

function enviarHojaImpagosPorWA(nombreUsuario) {
  const u = usuarios.find(x => x.nombre === nombreUsuario);
  const DIAS_ES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const titulo  = `${DIAS_ES[today.getDay()]} ${today.getDate()} de ${MESES[today.getMonth()]} ${today.getFullYear()}`;
  const impagos = reservas
    .filter(r => r.estado !== "cancelada" && !!r.ingreso && !r.pago)
    .sort((a,b) => {
      const aptoA = aptos.find(x => x.id === a.aptoId)?.nombre || "";
      const aptoB = aptos.find(x => x.id === b.aptoId)?.nombre || "";
      return aptoA.localeCompare(aptoB, "es", { numeric: true }) || (rSortName(a).localeCompare(rSortName(b), "es"));
    });

  let lines = [`💸 *Impagos ingresados — ${titulo}*`, ""];
  if(!impagos.length) {
    lines.push("No hay reservas ingresadas e impagas.");
  } else {
    impagos.forEach(r => {
      const a = aptos.find(x => x.id === r.aptoId);
      const depto = a ? a.nombre : "?";
      const owner = r.reservaDe || "Sin asignar";
      lines.push(`• 🏠 ${depto} | Reserva de: ${owner} | ${fmtMonto(r.monto)}`);
      if(r.huesped) lines.push(`  👤 ${r.huesped}`);
      if(r.comentarioPago) lines.push(`  📝 ${r.comentarioPago}`);
    });
  }

  const texto = lines.join("\n");
  const tel = u && u.telefono ? u.telefono.replace(/[^\d+]/g, "") : "";
  const url = tel
    ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.open(url, "_blank");
}

// ─── AGENDA ──────────────────────────────────────────────
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS  = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

let agendaYear  = today.getFullYear();
let agendaMonth = today.getMonth(); // 0-based
let agendaFilter = "todos";

function changeMonth(d) {
  agendaMonth += d;
  if(agendaMonth > 11) { agendaMonth = 0; agendaYear++; }
  if(agendaMonth < 0)  { agendaMonth = 11; agendaYear--; }
  renderAgenda();
}
function goToday() {
  agendaYear = today.getFullYear();
  agendaMonth = today.getMonth();
  renderAgenda();
}
function filterAgenda(f, btn) {
  agendaFilter = f;
  document.querySelectorAll(".agenda-filter-tabs .tab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  // Sync mobile filter buttons
  document.querySelectorAll(".ag-filter-btn").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".ag-filter-btn").forEach(t => {
    if(t.getAttribute("onclick") && t.getAttribute("onclick").includes("'"+f+"'")) t.classList.add("active");
  });
  renderAgenda();
}

// Mobile agenda filter buttons — syncs with desktop tabs
function filterAgendaBtn(f, btn) {
  agendaFilter = f;
  document.querySelectorAll(".ag-filter-btn").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  // Sync desktop tabs
  document.querySelectorAll(".agenda-filter-tabs .tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".agenda-filter-tabs .tab").forEach(t => {
    if(t.getAttribute("onclick") && t.getAttribute("onclick").includes("'"+f+"'")) t.classList.add("active");
  });
  renderAgenda();
}

function renderAgenda() {
  const _leg = document.getElementById("agendaAdminLegend");
  if(_leg) {
    const _users = usuarios.filter(u => !!u.color);
    _leg.innerHTML = _users.map(u=>`<span style="display:flex;align-items:center;gap:4px;color:var(--text2)"><span style="width:8px;height:8px;border-radius:50%;background:${u.color};display:inline-block"></span>${u.nombre}</span>`).join("");
  }
  document.getElementById("agendaMonthLabel").textContent = `${MESES[agendaMonth]} ${agendaYear}`;

  // Build all events for the month
  const firstDay = new Date(agendaYear, agendaMonth, 1);
  const lastDay  = new Date(agendaYear, agendaMonth + 1, 0);

  // Collect events per day
  const byDay = {}; // "YYYY-MM-DD" -> [{type, reserva, apto}]
  const agendaOverlapCache = new Map();
  const agendaConflictsFor = aptoId => {
    if(!agendaOverlapCache.has(aptoId)) agendaOverlapCache.set(aptoId, reservasSolapadas(aptoId));
    return agendaOverlapCache.get(aptoId);
  };

  for(const r of reservas) {
    if(r.estado === "cancelada") continue;
    const d = parseDate(r.desde);
    const h = parseDate(r.hasta);

    // Check-in: within month
    if(d >= firstDay && d <= lastDay) {
      const key = r.desde;
      if(!byDay[key]) byDay[key] = [];
      byDay[key].push({ type: "entrada", reserva: r });
    }
    // Check-out: within month
    if(h >= firstDay && h <= lastDay) {
      const key = r.hasta;
      if(!byDay[key]) byDay[key] = [];
      byDay[key].push({ type: "salida", reserva: r });
    }
    // En casa today
    if(d < firstDay && h > firstDay) {
      // stays that started before month but active during it
    }
  }

  // Also add "en casa" for each day a reservation is active
  // (only show on days that already have events OR add separate logic)
  // We iterate all days with events and also check who is staying
  const allEventDays = new Set(Object.keys(byDay));

  // Build summary
  let totalEntradas = 0, totalSalidas = 0, totalNoches = 0, totalIngresosPesos = 0, totalIngresosUSD = 0;
  for(const r of reservas) {
    if(r.estado === "cancelada") continue;
    const d = parseDate(r.desde), h = parseDate(r.hasta);
    if(d.getFullYear() === agendaYear && d.getMonth() === agendaMonth) totalEntradas++;
    if(h.getFullYear() === agendaYear && h.getMonth() === agendaMonth) totalSalidas++;
    const mStart = firstDay, mEnd = new Date(agendaYear, agendaMonth+1, 0);
    const oStart = d > mStart ? d : mStart;
    const oEnd   = h < mEnd ? h : mEnd;
    if(oEnd > oStart) {
      const nights = Math.round((oEnd-oStart)/(1000*60*60*24));
      totalNoches += nights;
      const totalNights = diffDays(r.desde, r.hasta);
      if(totalNights > 0) {
        const part = r.monto * (nights/totalNights);
        if(r.monto < 5000) totalIngresosUSD += part;
        else totalIngresosPesos += part;
      }
    }
  }
  const agendaIngHTML = [
    fmtMonto(Math.round(totalIngresosPesos + totalIngresosUSD)),
  ].filter(Boolean).join(" / ") || "$0";

  const agendaSummaryEl = document.getElementById("agendaSummary");
  if(agendaSummaryEl) agendaSummaryEl.innerHTML = "";

  // Filter
  let filteredByDay = {};
  for(const [key, events] of Object.entries(byDay)) {
    const evs = agendaFilter === "todos" ? events : events.filter(e => e.type === agendaFilter);
    if(evs.length) filteredByDay[key] = evs;
  }

  // When showing "todos", also include days with active estadías but no entry/exit events
  if(agendaFilter === "todos") {
    const lastDayLoop = new Date(agendaYear, agendaMonth + 1, 0);
    for(const r of reservas) {
      if(r.estado === "cancelada") continue;
      const d = parseDate(r.desde), h = parseDate(r.hasta);
      // Loop through days in the stay that are within the month and >= today
      let cur = new Date(Math.max(d.getTime() + 86400000, today.getTime(), firstDay.getTime()));
      while(cur < h && cur <= lastDayLoop) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
        if(!filteredByDay[key]) filteredByDay[key] = [];
        cur = new Date(cur.getTime() + 86400000);
      }
    }
  }

  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const sortedDays = Object.keys(filteredByDay).sort().filter(d => d >= todayKey);

  if(sortedDays.length === 0) {
    document.getElementById("agendaContent").innerHTML = `<div class="agenda-empty">No hay entradas ni salidas en ${MESES[agendaMonth].toLowerCase()} ${agendaYear}</div>`;
    return;
  }

  let html = "";
  sortedDays.forEach((dateKey, i) => {
    const date = parseDate(dateKey);
    const isToday = date.getTime() === today.getTime();
    const events = filteredByDay[dateKey];
    // Count who is staying that night (en casa — entered before or on this day, leaving after)
    const enCasa = reservas.filter(r => {
      if(r.estado === "cancelada") return false;
      const d = parseDate(r.desde), h = parseDate(r.hasta);
      return d <= date && h > date;
    });

    const entradas = events.filter(e => e.type === "entrada");
    const salidas  = events.filter(e => e.type === "salida");

    const chips = [
      entradas.length ? `<div class="day-chip chip-entrada">↓ ${entradas.length} entrada${entradas.length>1?"s":""}</div>` : "",
      salidas.length  ? `<div class="day-chip chip-salida">↑ ${salidas.length} salida${salidas.length>1?"s":""}</div>` : "",
      enCasa.length   ? `<div class="day-chip chip-en-casa">🏠 ${enCasa.length} en casa</div>` : "",
    ].join("");

    const eventsHTML = events.map(ev => {
      const r = ev.reserva;
      const a = aptos.find(x => x.id === r.aptoId);
      const noches = diffDays(r.desde, r.hasta);
      const solapada = !!agendaConflictsFor(r.aptoId).has(r.id);
      const problematica = !!(r.ingreso && !r.pago);
      const vencida = !!(r.hasta && parseDate(r.hasta) < today);
      const otroUsuario = !!(r.reservaDe && a?.encargado && r.reservaDe !== a.encargado);
      const colorKey = getReservaHighlightKey(r, { solapada, problematica, conDeuda: !!r.hayDeuda, vencida, otroUsuario });
      const tieneIncidenciaVisual = ["superpuesta","problematica","conDeuda","estadiaLarga","vencida","reservaOtroUsuario"].includes(colorKey);
      const isEntrada = ev.type === "entrada";
      const detail = isEntrada
        ? `${noches} noche${noches!==1?"s":""} · hasta ${fmt(r.hasta)}`
        : `${noches} noche${noches!==1?"s":""} · desde ${fmt(r.desde)}`;
      const horarioEntrada = fmtHora24(r.horarioEntrada, fmtHora24(DEFAULT_HORARIO_ENTRADA));
      const horarioSalida = fmtHora24(r.horarioSalida, fmtHora24(DEFAULT_HORARIO_SALIDA));
      const horarioNotas = (r.horarioNotas || "").trim();
      const reservaUserColor = getReservaUserColor(r);
      const _ec = reservaUserColor ? { dot: reservaUserColor } : null;
      const _edot = _ec?`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${_ec.dot};margin-right:4px;flex-shrink:0"></span>`:"";
      const userBg = reservaUserColor ? `linear-gradient(90deg, ${hexToRgba(reservaUserColor, 0.32)}, ${hexToRgba(reservaUserColor, 0.18)})` : "";
      const userBorder = reservaUserColor ? hexToRgba(reservaUserColor, 0.7) : "";
      const rowStyle = (_ec?`border-left:3px solid ${_ec.dot};`:"") + (reservaUserColor?`background:${userBg};border-color:${userBorder};box-shadow:inset 0 0 0 1px ${hexToRgba(reservaUserColor, 0.2)};`:"");
      const impagoTag = !r.pago ? `<span style="background:var(--red-dim);color:var(--red);border:1px solid rgba(224,92,92,0.4);border-radius:4px;font-size:0.58rem;font-weight:800;padding:1px 5px;letter-spacing:0.05em;text-transform:uppercase;flex-shrink:0">IMPAGO</span>` : "";
      return `
        <div class="event-row ${r.hayDeuda ? "con-deuda" : ""} ${reservaUserColor ? "user-colored" : ""}" onclick="verDetalle(${r.id})" style="${rowStyle}">
          <div class="event-type-badge ${isEntrada ? "badge-entrada" : "badge-salida"}">
            ${isEntrada ? "↓ Entrada" : "↑ Salida"}
          </div>
          <div class="event-apto">${a ? a.nombre : "—"}</div>
          <div class="event-huesped">${_edot}${r.huesped}</div>
          ${impagoTag}
          <div class="event-detail">${detail}</div>
          <div class="event-horario-box" title="Horario de entrada y salida">
            <span class="event-horario-chip">E ${horarioEntrada}</span>
            <span class="event-horario-chip">S ${horarioSalida}</span>
            ${horarioNotas ? `<div class="event-horario-note">${horarioNotas.replace(/</g,"&lt;")}</div>` : ""}
          </div>
          <div class="event-monto${r.hayDeuda ? " con-deuda" : ""}">
            ${r._salio ? `<span style="color:var(--green);font-size:0.7rem;font-weight:700">✓ Salió ${r._salio}</span>` : fmtMonto(r.monto)}
            ${!r._salio && r.hayDeuda ? ` <span class="deuda-badge">Deuda ${fmtMonto(r.deudaMonto || 0)}</span>` : ""}
          </div>
          ${r.estado === 'pendiente'
            ? `<button class="event-estado estado-pendiente" style="cursor:pointer;border:none;font-family:inherit;${buildReservaStatusStyle('pendiente')}"
                onclick="event.stopPropagation();updateReserva(${r.id},'estado','confirmada');renderAgenda()"
                title="Click para confirmar">Pendiente ✓</button>`
            : `<div class="event-estado estado-${r.estado}" style="${buildReservaStatusStyle(r.estado)}">${r.estado}</div>`}
        </div>`;
    }).join("");

    // Estadías activas ese día — agrupadas como subtotal colapsable
    const eventIds = new Set(events.map(ev => ev.reserva.id));
    const enCasaList = (agendaFilter === "todos")
      ? enCasa.filter(r => !eventIds.has(r.id))
      : [];
    let enCasaRows = "";
    if(enCasaList.length > 0) {
      const rowsHTML = enCasaList.map(r => {
          const a = aptos.find(x => x.id === r.aptoId);
          const diasRestantes = diffDays(dateKey, r.hasta);
          const reservaUserColor = getReservaUserColor(r);
          const _cc = reservaUserColor ? { dot: reservaUserColor } : null;
          const _cdot = _cc?`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${_cc.dot};margin-right:4px;flex-shrink:0"></span>`:"";
          const userBg = reservaUserColor ? `linear-gradient(90deg, ${hexToRgba(reservaUserColor, 0.32)}, ${hexToRgba(reservaUserColor, 0.18)})` : "";
          const userBorder = reservaUserColor ? hexToRgba(reservaUserColor, 0.7) : "";
          const rowStyle = (_cc?`border-left:3px solid ${_cc.dot};`:"") + (reservaUserColor?`background:${userBg};border-color:${userBorder};box-shadow:inset 0 0 0 1px ${hexToRgba(reservaUserColor, 0.2)};`:"");
          return `
            <div class="event-row encasa-row ${r.hayDeuda ? "con-deuda" : ""}" onclick="verDetalle(${r.id})" style="${rowStyle}">
              <div class="event-type-badge badge-enhouse">🏠 Estadía</div>
              <div class="event-apto">${a ? a.nombre : "—"}</div>
              <div class="event-huesped">${_cdot}${r.huesped}</div>
              <div class="event-detail">Sale ${fmt(r.hasta)} · ${diasRestantes} día${diasRestantes!==1?"s":""} más</div>
              <div class="event-monto${r.hayDeuda ? " con-deuda" : ""}">${fmtMonto(r.monto)}</div>
              ${r.estado === 'pendiente'
                ? `<button class="event-estado estado-pendiente" style="cursor:pointer;border:none;font-family:inherit;${buildReservaStatusStyle('pendiente')}" onclick="event.stopPropagation();updateReserva(${r.id},'estado','confirmada');renderAgenda()" title="Click para confirmar">Pendiente ✓</button>`
                : `<div class="event-estado estado-${r.estado}" style="${buildReservaStatusStyle(r.estado)}">${r.estado}</div>`}
            </div>`;
        }).join("");
      const collapseId = `encasa_${dateKey.replace(/-/g,'')}`;
      enCasaRows = `
        <div style="margin-top:4px">
          <button onclick="var el=document.getElementById(&quot;${collapseId}&quot;);var arr=this.querySelector('.enc-arr');el.style.display=el.style.display==='none'?'block':'none';arr.textContent=el.style.display==='none'?'\\u25B6':'\\u25BC'"
            style="width:100%;display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:0.75rem;color:var(--text3);text-align:left">
            <span class="enc-arr">&#9658;</span>
            <span>🏠 En estadía — ${enCasaList.length} reserva${enCasaList.length!==1?"s":""}</span>
          </button>
          <div id="${collapseId}" style="display:none">${rowsHTML}</div>
        </div>`;
    }

    html += `
      <div class="agenda-day ${isToday?"is-today":""}" style="animation-delay:${i*0.04}s">
        <div class="day-header" onclick="toggleDay(this)">
          <div class="day-num-wrap">
            <div class="day-num">${date.getDate()}</div>
            <div class="day-dow">${DIAS[date.getDay()]}</div>
          </div>
          <div class="day-divider"></div>
          <div class="day-events-summary">${chips}</div>
          <div class="day-toggle">▼</div>
        </div>
        <div class="day-events open">${eventsHTML}${enCasaRows}</div>
      </div>`;
  });

  document.getElementById("agendaContent").innerHTML = html;
}

function toggleDay(header) {
  const events = header.nextElementSibling;
  const toggle = header.querySelector(".day-toggle");
  events.classList.toggle("open");
  toggle.classList.toggle("open");
}

// ─── WHATSAPP ──────────────────────────────────────────
let mensajeWA = "Hola, {nombre}, tengo una reserva en el departamento {depto} desde el dia {checkin} al {checkout}.";

function guardarMensajeWA() {
  mensajeWA = document.getElementById("wa_mensaje").value;
  fetch(`${SUPA_URL}/rest/v1/config?key=eq.mensaje_wa`, { method:"PATCH", headers:{...supa.h,"Prefer":"return=minimal"}, body:JSON.stringify({value:mensajeWA}) }).catch(()=>{});
}

function insertarToken(token) {
  const ta = document.getElementById("wa_mensaje");
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const val   = ta.value;
  ta.value = val.slice(0, start) + token + val.slice(end);
  ta.selectionStart = ta.selectionEnd = start + token.length;
  ta.focus();
  guardarMensajeWA();
  actualizarPreviewWA();
}

function interpolarMensaje(template, r) {
  const a      = aptos.find(x => x.id === r.aptoId);
  const noches = diffDays(r.desde, r.hasta);
  const moneda = r.monto < 10000 ? "U$D" : "$";
  return template
    .replace(/{nombre}/g,   r.huesped || "")
    .replace(/{checkin}/g,  fmt(r.desde))
    .replace(/{checkout}/g, fmt(r.hasta))
    .replace(/{depto}/g,    a ? a.nombre : "")
    .replace(/{noches}/g,   noches)
    .replace(/{monto}/g,    `${moneda} ${r.monto.toLocaleString()}`);
}

function actualizarPreviewWA() {
  const preview = document.getElementById("wa_preview");
  if(!preview) return;
  // Use first reserva as sample, or show generic placeholders
  const muestra = reservas[0];
  if(muestra) {
    preview.textContent = interpolarMensaje(mensajeWA, muestra);
  } else {
    preview.textContent = mensajeWA
      .replace(/{nombre}/g,   "Juan García")
      .replace(/{checkin}/g,  "20/03/26")
      .replace(/{checkout}/g, "25/03/26")
      .replace(/{depto}/g,    "1A")
      .replace(/{noches}/g,   "5")
      .replace(/{monto}/g,    "$ 2.500");
  }
}

function abrirWADirecto(contacto) {
  const numero = contacto.replace(/\D/g, "");
  window.open(`https://wa.me/${numero}`, "_blank");
}

function enviarWhatsapp(contacto, huesped, desde, hasta, aptoId, monto) {
  const numero = contacto.replace(/[^\d+]/g, "");
  // Build a fake reserva object for interpolation
  const r = { huesped, desde, hasta, aptoId: parseInt(aptoId), monto: parseFloat(monto) };
  const texto  = interpolarMensaje(mensajeWA, r);
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, "_blank");
}

// ─── TOGGLE PAGO ───────────────────────────────────────
// ─── PAGO POPOVER ──────────────────────────────────────
function togglePago(id, btnEl) {
  const r = reservas.find(x => x.id === id);
  if(!r) return;

  // Already paid → unpay instantly
  if(r.pago) {
    r.pago = false;
    r.cobrador = "";
    r.medioPago = "";
    r.hayDeuda = false;
    r.deudaMonto = 0;
    r.deudaComentario = "";
    r.comentarioPago = buildComentarioPago(pagoMetaFromReserva(r));
    render(r.aptoId);
    toast("↩ Marcada como impaga");
    return;
  }

  cerrarPopover();

  const cobradorOpts = `<option value="">Sin especificar</option>` +
    usuariosConRolValido().map(u => `<option value="${u.nombre}" ${r.cobrador===u.nombre?"selected":""}>${u.nombre}</option>`).join("");
  const medioOpts = `<option value="">Sin especificar</option>` +
    mediosPago.map(m => `<option value="${m.nombre}" ${r.medioPago===m.nombre?"selected":""}>${m.nombre}</option>`).join("");

  const backdrop = document.createElement("div");
  backdrop.id = "pagoPopoverBackdrop";
  backdrop.onclick = cerrarPopover;
  document.body.appendChild(backdrop);

  const pop = document.createElement("div");
  pop.className = "pago-popover";
  pop.id = "pagoPopover";
  pop.innerHTML = `
    <div class="pp-title pp-drag-handle" style="cursor:grab;display:flex;align-items:center;gap:8px;user-select:none">
      <span style="color:var(--border2);font-size:1rem">⠿</span>
      Registrar cobro
    </div>
    <div class="pp-row">
      <div class="pp-label">Quién cobró</div>
      <select class="pp-input" id="pp_cobrador">${cobradorOpts}</select>
    </div>
    <div class="pp-row">
      <div class="pp-label">Medio de pago</div>
      <select class="pp-input" id="pp_medio">${medioOpts}</select>
    </div>
    <div class="pp-footer">
      <button class="pp-btn-cancel" onclick="cerrarPopover()">Cancelar</button>
      <button class="pp-btn-confirm" onclick="confirmarPago(${id})">✓ Confirmar pago</button>
    </div>
  `;
  document.body.appendChild(pop);

  // Position near button
  if(btnEl) {
    const rect = btnEl.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - 260);
    const top  = Math.min(rect.bottom + 6, window.innerHeight - pop.offsetHeight - 20) + window.scrollY;
    pop.style.left = left + "px";
    pop.style.top  = top + "px";
  }

  // Make draggable
  hacerArrastrable(pop, pop.querySelector(".pp-drag-handle"));
}

async function confirmarPago(id) {
  const r = reservas.find(x => x.id === id);
  if(!r) return;
  r.pago=true;
  r.cobrador=document.getElementById("pp_cobrador").value;
  r.medioPago=document.getElementById("pp_medio").value;
  r.comentarioPago=buildComentarioPago(pagoMetaFromReserva(r));
  await supa.patch("reservas",id,{pago:true,cobrador:r.cobrador,medio_pago:r.medioPago,comentario_pago:r.comentarioPago});
  r.comentarioPago = parseComentarioPago(r.comentarioPago).comentario;
  cerrarPopover();
  logAccion("Pago registrado",`${r.huesped}${r.cobrador?" · cobró "+r.cobrador:""}${r.medioPago?" · "+r.medioPago:""}`);
  render(r.aptoId);
  toast("✓ Pago registrado"+(r.cobrador?" — "+r.cobrador:""));
}

function cerrarPopover() {
  document.getElementById("pagoPopover")?.remove();
  document.getElementById("pagoPopoverBackdrop")?.remove();
}

// ─── TOGGLE INGRESO (3 estados: falta → ingresó → confirmar retiro) ──
function marcarSalio(id, btnEl) {
  const r = reservas.find(x => x.id === id);
  if(!r) return;
  const now = new Date();
  r._salio = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  render(r.aptoId);
  toast("↑ Marcado como Salió — confirmá para archivar");
}

function abrirPopoverRetiro(id, btnEl) {
  const r = reservas.find(x => x.id === id);
  if(!r) return;
  // Force ingreso=true so the retiro popover can proceed
  if(!r.ingreso) {
    r.ingreso = true;
    supa.patch("reservas", id, { ingreso: true });
  }
  toggleIngreso(id, btnEl);
}

function toggleIngreso(id, btnEl) {
  const r = reservas.find(x => x.id === id);
  if(!r) return;

  if(!r.ingreso) {
    // FALTA → INGRESÓ
    r.ingreso = true;
    supa.patch("reservas", id, { ingreso: true });
    logAccion("Huésped ingresó", `${r.huesped} · depto ${aptos.find(x=>x.id===r.aptoId)?.nombre||""}`);
    render(r.aptoId);
    toast("↓ Huésped ingresó al departamento");
    return;
  }

  // INGRESÓ → confirmar retiro con popover
  cerrarPopover();

  const backdrop = document.createElement("div");
  backdrop.id = "pagoPopoverBackdrop";
  backdrop.onclick = cerrarPopover;
  document.body.appendChild(backdrop);

  const a = aptos.find(x => x.id === r.aptoId);
  const noches = diffDays(r.desde, r.hasta);
  const pop = document.createElement("div");
  pop.className = "pago-popover";
  pop.id = "pagoPopover";
  pop.innerHTML = `
    <div class="pp-title pp-drag-handle" style="cursor:grab;display:flex;align-items:center;gap:8px;user-select:none">
      <span style="color:var(--border2);font-size:1rem">⠿</span>
      ¿Confirmar retiro?
    </div>
    <div style="font-size:0.8rem;color:var(--text2);margin-bottom:10px;line-height:1.4">
      <strong style="color:var(--text)">${r.huesped}</strong><br>
      ${a ? a.nombre : ""} · ${fmt(r.desde)} → ${fmt(r.hasta)} · ${noches}n
    </div>
    <div class="pp-row">
      <div class="pp-label">Comentario de cierre</div>
      <input class="pp-input" type="text" id="pp_cierreComentario" placeholder="Todo OK, daños, etc…">
    </div>
    <div class="pp-footer">
      <button class="pp-btn-cancel" onclick="cerrarPopover()">Cancelar</button>
      <button class="pp-btn-confirm" onclick="confirmarRetiro(${id})">✓ Confirmar retiro</button>
    </div>
  `;
  document.body.appendChild(pop);

  if(btnEl) {
    const rect = btnEl.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - 260);
    const top  = Math.min(rect.bottom + 6, window.innerHeight - 200) + window.scrollY;
    pop.style.left = left + "px";
    pop.style.top  = top + "px";
  }

  hacerArrastrable(pop, pop.querySelector(".pp-drag-handle"));
}

async function confirmarRetiro(id) {
  const r = reservas.find(x => x.id === id);
  if(!r) return;

  const comentarioCierre = document.getElementById("pp_cierreComentario")?.value.trim() || "";

  const finalizar = async () => {
    cerrarPopover();
    const fechaCierre = new Date().toISOString().slice(0,10);
      const row = { apto_id:r.aptoId, huesped:r.huesped, contacto:r.contacto, fecha_desde:r.desde, fecha_hasta:r.hasta, monto:r.monto, estado:r.estado, pago:r.pago, cobrador:r.cobrador, medio_pago:r.medioPago, horario_entrada:r.horarioEntrada, horario_salida:r.horarioSalida, cant_huespedes:r.cantHuespedes, notas:r.notas, comentario_pago:buildComentarioPago(pagoMetaFromReserva(r)), comentario_cierre:comentarioCierre, fecha_cierre:fechaCierre };
    const cr = await supa.post("historial", row);
    console.log("[confirmarRetiro] historial post:", cr);
    if(cr) historial.unshift(dbHist(cr));
    const delOk = await supa.del("reservas", id);
    console.log("[confirmarRetiro] del reserva id:", id, "ok:", delOk);
    if(!delOk) { toast("✗ No se pudo eliminar la reserva de Supabase", false); return; }
    logAccion("Reserva finalizada", `${r.huesped} · depto ${aptos.find(x=>x.id===r.aptoId)?.nombre||""} · ${fmt(r.desde)} → ${fmt(r.hasta)}`);
    reservas = reservas.filter(x => x.id !== id);
    render();
    toast("✓ Reserva finalizada y archivada en Estadística");
  };

  if(!r.pago) {
    mostrarDialogoSalida(
      "⚠ Reserva impaga",
      `No se puede confirmar el retiro porque la reserva de <strong>${r.huesped}</strong> está <strong>IMPAGA</strong>.<br><br>Marcá el pago antes de finalizar.`,
      [{ label: "Entendido", action: () => {} }]
    );
    return;
  }

  await finalizar();
}

// ─── ESTADÍSTICA ─────────────────────────────────────────
function getAdminColor(nombre) {
  if(!nombre) return null;
  const color = getUserColor(nombre);
  return color ? { dot: color } : null;
}
function _isAdminNombre(nombre) {
  if(!nombre) return false;
  const u = usuarios.find(x => x.nombre === nombre);
  return normalizarRol(u?.rol) === "Administrador";
}

function editarHistorial(id) {
  const h = historial.find(x => x.id === id);
  if(!h) return;

  const cobradores = usuariosConRolValido();
  const cobradorOpts = `<option value="">Sin asignar</option>` +
    cobradores.map(u => `<option value="${u.nombre}" ${h.cobrador===u.nombre?"selected":""}>${u.nombre}</option>`).join("");
  const medioOpts = `<option value="">Sin especificar</option>` +
    mediosPago.map(m => `<option value="${m.nombre}" ${h.medioPago===m.nombre?"selected":""}>${m.nombre}</option>`).join("");
  const aptoOpts = aptos.map(ap => `<option value="${ap.id}" ${h.aptoId===ap.id?"selected":""}>${ap.nombre}</option>`).join("");

  mostrarDialogoSalida(
    "Editar reserva finalizada",
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px">
      <div style="grid-column:1/-1">
        <div class="form-label">Huésped</div>
        <input id="dlg_hist_huesped" class="form-input" value="${h.huesped.replace(/"/g,'&quot;')}">
      </div>
      <div>
        <div class="form-label">Departamento</div>
        <select id="dlg_hist_apto" class="form-input">${aptoOpts}</select>
      </div>
      <div>
        <div class="form-label">Monto</div>
        <input id="dlg_hist_monto" class="form-input" type="number" value="${h.monto}">
      </div>
      <div>
        <div class="form-label">Check-in</div>
        <input id="dlg_hist_desde" class="form-input" type="date" value="${h.desde}">
      </div>
      <div>
        <div class="form-label">Check-out</div>
        <input id="dlg_hist_hasta" class="form-input" type="date" value="${h.hasta}">
      </div>
      <div>
        <div class="form-label">Pago</div>
        <select id="dlg_hist_pago" class="form-input" onchange="
          var cob=document.getElementById('dlg_hist_cobrador');
          var warn=document.getElementById('dlg_hist_cobrador_warn');
          if(this.value==='true' && !cob.value){
            warn.style.display='block';
          } else { warn.style.display='none'; }
        ">
          <option value="false" ${!h.pago?"selected":""}>Impago</option>
          <option value="true"  ${h.pago?"selected":""}>Pagado</option>
        </select>
      </div>
      <div>
        <div class="form-label">Quién cobró</div>
        <select id="dlg_hist_cobrador" class="form-input" onchange="
          var warn=document.getElementById('dlg_hist_cobrador_warn');
          var pago=document.getElementById('dlg_hist_pago');
          if(pago.value==='true' && !this.value){ warn.style.display='block'; } else { warn.style.display='none'; }
        ">${cobradorOpts}</select>
        <div id="dlg_hist_cobrador_warn" style="display:${h.pago && !h.cobrador?'block':'none'};font-size:0.72rem;color:var(--red);margin-top:3px">⚠ Reserva pagada requiere cobrador</div>
      </div>
      <div>
        <div class="form-label">Medio de pago</div>
        <select id="dlg_hist_medio" class="form-input">${medioOpts}</select>
      </div>
      <div>
        <div class="form-label">Fecha de cierre</div>
        <input id="dlg_hist_cierre" class="form-input" type="date" value="${h.fechaCierre||h.hasta}">
      </div>
      <div style="grid-column:1/-1">
        <div class="form-label">Notas</div>
        <input id="dlg_hist_notas" class="form-input" value="${(h.notas||"").replace(/"/g,'&quot;')}">
      </div>
      <div style="grid-column:1/-1">
        <div class="form-label">Comentario de cierre</div>
        <input id="dlg_hist_comentario" class="form-input" value="${(h.comentarioCierre||"").replace(/"/g,'&quot;')}">
      </div>
    </div>`,
    [
      { label: "Cancelar", action: () => {} },
      { label: "Guardar cambios", action: async () => {
          // dlg DOM ya fue eliminado — leer de _dlgData
          const d = window._dlgData || {};
          const huesped    = (d.dlg_hist_huesped||"").trim()||h.huesped;
          const aptoId     = parseInt(d.dlg_hist_apto)||h.aptoId;
          const monto      = parseFloat(d.dlg_hist_monto)||h.monto;
          const desde      = d.dlg_hist_desde||h.desde;
          const hasta      = d.dlg_hist_hasta||h.hasta;
          const cobrador   = d.dlg_hist_cobrador||"";
          const medio      = d.dlg_hist_medio||"";
          const pago       = d.dlg_hist_pago==="true";
          const cierre     = d.dlg_hist_cierre||h.fechaCierre;
          const notas      = d.dlg_hist_notas||"";
          const comentario = d.dlg_hist_comentario||"";

          // Validar: pagado requiere cobrador
          if(pago && !cobrador) {
            toast("⚠ Asigná un cobrador antes de marcar como pagado", false);
            return;
          }

          const patch = { huesped, apto_id:aptoId, monto, fecha_desde:desde, fecha_hasta:hasta,
            cobrador:cobrador||null, medio_pago:medio||null, pago,
            fecha_cierre:cierre||null, notas:notas||null, comentario_cierre:comentario||null };
          const upd = await supa.patch("historial", id, patch);
          if(upd) {
            Object.assign(h, {huesped,aptoId,monto,desde,hasta,cobrador,medioPago:medio,pago,fechaCierre:cierre,notas,comentarioCierre:comentario});
            renderEstadistica();
            toast("✓ Reserva actualizada");
          } else { toast("⚠️ No se pudo guardar", false); }
        }}
    ]
  );
}



function renderEstadistica() {
  renderAgendaClientes();
  const statSummaryEl = document.getElementById("statSummary");
  if(!statSummaryEl) return;

  const filtroApto = document.getElementById("stat_filtroApto");
  const filtroMes  = document.getElementById("stat_filtroMes");
  const selApto    = filtroApto.value;
  const selMes     = filtroMes.value;

  const aptosConHistorial = [...new Set(historial.map(h => h.aptoId))];
  filtroApto.innerHTML = `<option value="">Todos los deptos</option>` +
    aptos.filter(a => aptosConHistorial.includes(a.id) || selApto == a.id)
      .map(a => `<option value="${a.id}" ${selApto==a.id?"selected":""}>${a.nombre}</option>`).join("");

  const mesesSet = new Set(historial.map(h => h.fechaCierre?.slice(0,7)).filter(Boolean));
  filtroMes.innerHTML = `<option value="">Todos los meses</option>` +
    [...mesesSet].sort().reverse().map(m => {
      const [y,mo] = m.split("-");
      return `<option value="${m}" ${selMes===m?"selected":""}>${MESES[parseInt(mo)-1]} ${y}</option>`;
    }).join("");

  let data = historial.filter(h => {
    if(selApto && h.aptoId != selApto) return false;
    if(selMes  && !h.fechaCierre?.startsWith(selMes)) return false;
    return true;
  });

  if(!window._statSort) window._statSort = { col: "fechaCierre", asc: false };
  const sort = window._statSort;
  data.sort((a,b) => {
    let va, vb;
    switch(sort.col) {
      case "apto":    va=aptos.find(x=>x.id===a.aptoId)?.nombre||""; vb=aptos.find(x=>x.id===b.aptoId)?.nombre||""; break;
      case "huesped": va=a.huesped||"";  vb=b.huesped||""; break;
      case "desde":   va=a.desde||"";    vb=b.desde||""; break;
      case "hasta":   va=a.hasta||"";    vb=b.hasta||""; break;
      case "noches":  va=diffDays(a.desde,a.hasta); vb=diffDays(b.desde,b.hasta); break;
      case "monto":   va=a.monto;        vb=b.monto; break;
      case "pago":    va=a.pago?1:0;     vb=b.pago?1:0; break;
      case "cobrador":va=a.cobrador||""; vb=b.cobrador||""; break;
      case "medio":   va=a.medioPago||"";vb=b.medioPago||""; break;
      default:        va=a.fechaCierre||""; vb=b.fechaCierre||"";
    }
    if(va<vb) return sort.asc ? -1 : 1;
    if(va>vb) return sort.asc ?  1 : -1;
    return 0;
  });

  const totalMontoAll   = data.reduce((s,h) => s+h.monto, 0);
  const totalNoches     = data.reduce((s,h) => s+diffDays(h.desde,h.hasta), 0);
  const totalPagadas    = data.filter(h => h.pago).length;
  const statIngHTML     = data.length ? fmtMonto(totalMontoAll) : "$0";

  statSummaryEl.innerHTML = `
    <div class="ms-item"><div class="ms-val">${data.length}</div><div class="ms-lbl">Reservas</div></div>
    <div class="ms-item"><div class="ms-val">${totalNoches}</div><div class="ms-lbl">Noches</div></div>
    <div class="ms-item"><div class="ms-val" style="color:var(--gold);font-size:0.9rem">${statIngHTML}</div><div class="ms-lbl">Facturado</div></div>
    <div class="ms-item"><div class="ms-val" style="color:var(--green)">${totalPagadas}</div><div class="ms-lbl">Pagadas</div></div>
    <div class="ms-item"><div class="ms-val" style="color:var(--red)">${data.length-totalPagadas}</div><div class="ms-lbl">Sin cobrar</div></div>
  `;

  if(data.length === 0) {
    document.getElementById("statList").innerHTML = `<div class="agenda-empty">No hay reservas finalizadas todavía.<br>Al confirmar el retiro de un huésped, aparecen acá.</div>`;
    return;
  }

  const pendientesAdmin = data.filter(h => !_isAdminNombre(h.cobrador||""));

  // ── Shared styles ──
  const COL_WIDTHS = ["100px","140px","90px","90px","55px","90px","45px","100px","80px","80px","40px"];
  function thMain(col, label, align) {
    const active = sort.col === col;
    const arrow  = active ? (sort.asc ? " ↑" : " ↓") : "";
    const s = `padding:7px 10px;font-size:0.62rem;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;white-space:nowrap;border-bottom:2px solid var(--border2);background:var(--bg3);cursor:pointer;user-select:none;color:${active?"var(--gold)":"var(--text3)"};${align?`text-align:${align}`:""}`;
    return `<th style="${s}" onclick="window._statSort={col:'${col}',asc:${active?!sort.asc:true}};renderEstadistica()">${label}${arrow}</th>`;
  }
  function thPend(label, align) {
    const s = `padding:7px 10px;font-size:0.62rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--orange);font-weight:700;white-space:nowrap;border-bottom:2px solid rgba(201,125,58,0.5);background:rgba(201,125,58,0.06);${align?`text-align:${align}`:""}`;
    return `<th style="${s}">${label}</th>`;
  }
  function tdStyle(extra) {
    return `padding:5px 10px;font-size:0.78rem;border-bottom:1px solid var(--border);vertical-align:middle;white-space:nowrap;${extra||""}`;
  }

  function buildRow(h, i, bgEven, bgOdd, borderColor) {
    const a        = aptos.find(x => x.id === h.aptoId);
    const noches   = diffDays(h.desde, h.hasta);
    const bg       = i%2===0 ? bgEven : bgOdd;
    const montoStr = fmtMonto(h.monto);
    const pendDot  = !_isAdminNombre(h.cobrador||"") ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--orange);margin-left:5px;vertical-align:middle"></span>` : "";
    const border   = `border-bottom:1px solid ${borderColor||"var(--border)"};`;
    return `<tr style="background:${bg}">
      <td style="${tdStyle(`color:var(--gold);font-weight:700;${border}`)}">${a?a.nombre:"—"}</td>
      <td style="${tdStyle(`font-weight:500;max-width:150px;overflow:hidden;text-overflow:ellipsis;${border}`)}">${h.huesped}${pendDot}</td>
      <td style="${tdStyle(`color:var(--text2);${border}`)}">${fmt(h.desde)}</td>
      <td style="${tdStyle(`color:var(--text2);${border}`)}">${fmt(h.hasta)}</td>
      <td style="${tdStyle(`text-align:center;color:var(--text3);${border}`)}">${noches}n</td>
      <td style="${tdStyle(`font-family:'Fraunces',serif;font-weight:600;color:var(--gold);text-align:right;${border}`)}">${montoStr}</td>
      <td style="${tdStyle(`text-align:right;color:var(--text3);font-size:0.72rem;${border}`)}">${(()=>{const _n=diffDays(h.desde,h.hasta);return _n>0&&h.monto>0?fmtMonto(Math.round(h.monto/_n)):"\u2014";})()}</td>
      <td style="${tdStyle(`text-align:center;font-weight:700;${h.pago?"color:var(--green)":"color:var(--red)"};${border}`)}">${h.pago?"✓":"✗"}</td>
      <td style="${tdStyle(`color:${!_isAdminNombre(h.cobrador||"")?"var(--orange)":"var(--text2)"};${border}`)}">${h.cobrador||"—"}</td>
      <td style="${tdStyle(`color:var(--text2);${border}`)}">${h.medioPago||"—"}</td>
      <td style="${tdStyle(`color:var(--text3);font-size:0.7rem;${border}`)}">${fmt(h.fechaCierre||h.hasta)}</td>
      <td style="${tdStyle(border)}"><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editarHistorial(${h.id})" style="padding:3px 9px;font-size:0.7rem">✏</button></td>
    </tr>`;
  }

  function buildHeader(thFn) {
    return `<thead><tr>
      ${thFn("apto","Depto")}${thFn("huesped","Huésped")}
      ${thFn("desde","Check-in")}${thFn("hasta","Check-out")}
      ${thFn("noches","Noches","center")}${thFn("monto","Monto","right")}${thFn("","$/noche","right")}
      ${thFn("pago","Pago","center")}${thFn("cobrador","Cobrador")}
      ${thFn("medio","Medio")}${thFn("fechaCierre","Cierre")}
      <th style="padding:7px 10px;background:${thFn===thMain?"var(--bg3)":"rgba(201,125,58,0.06)"};border-bottom:2px solid ${thFn===thMain?"var(--border2)":"rgba(201,125,58,0.5)"}"></th>
    </tr></thead>`;
  }

  // ── Tabla pendientes admin — sort ──
  if(!window._statSortPend) window._statSortPend = { col: "fechaCierre", asc: false };
  const sortP = window._statSortPend;
  const pendSorted = [...pendientesAdmin].sort((a,b) => {
    let va, vb;
    switch(sortP.col) {
      case "apto":    va=aptos.find(x=>x.id===a.aptoId)?.nombre||""; vb=aptos.find(x=>x.id===b.aptoId)?.nombre||""; break;
      case "huesped": va=a.huesped||"";  vb=b.huesped||""; break;
      case "desde":   va=a.desde||"";    vb=b.desde||""; break;
      case "hasta":   va=a.hasta||"";    vb=b.hasta||""; break;
      case "noches":  va=diffDays(a.desde,a.hasta); vb=diffDays(b.desde,b.hasta); break;
      case "monto":   va=a.monto;        vb=b.monto; break;
      case "pago":    va=a.pago?1:0;     vb=b.pago?1:0; break;
      case "cobrador":va=a.cobrador||""; vb=b.cobrador||""; break;
      case "medio":   va=a.medioPago||"";vb=b.medioPago||""; break;
      default:        va=a.fechaCierre||""; vb=b.fechaCierre||"";
    }
    if(va<vb) return sortP.asc ? -1 : 1;
    if(va>vb) return sortP.asc ?  1 : -1;
    return 0;
  });

  function thPendSort(col, label, align) {
    const active = sortP.col === col;
    const arrow  = active ? (sortP.asc ? " ↑" : " ↓") : "";
    const s = `padding:7px 10px;font-size:0.62rem;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;white-space:nowrap;border-bottom:2px solid rgba(201,125,58,0.5);background:rgba(201,125,58,0.06);cursor:pointer;user-select:none;color:${active?"var(--text)":"var(--orange)"};${align?`text-align:${align}`:""}`;
    return `<th style="${s}" onclick="window._statSortPend={col:'${col}',asc:${active?!sortP.asc:true}};renderEstadistica()">${label}${arrow}</th>`;
  }

  const pendienteHTML = pendientesAdmin.length > 0 ? `
    <div style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">
        <div style="font-weight:700;color:var(--orange);font-size:0.88rem">⚠ Cobros no registrados por Administrador (${pendientesAdmin.length})</div>
        <div style="font-size:0.75rem;color:var(--text2)">— Editá "Quién cobró" para regularizar</div>
      </div>
      <div style="overflow-x:auto;border-radius:10px;border:1px solid rgba(201,125,58,0.4)">
        <table style="width:100%;border-collapse:collapse;table-layout:fixed">
          ${buildHeader((col,label,align) => thPendSort(col,label,align))}
          <tbody>${pendSorted.map((h,i) => buildRow(h,i,"rgba(201,125,58,0.04)","rgba(201,125,58,0.07)","rgba(201,125,58,0.2)")).join("")}</tbody>
        </table>
      </div>
    </div>` : "";

  // ── Tabla principal agrupada por mes ──
  const dataAdmin = data.filter(h => _isAdminNombre(h.cobrador||""));
  const adminTotal   = dataAdmin.reduce((s,h) => s+h.monto, 0);
  const adminNoches  = dataAdmin.reduce((s,h) => s+diffDays(h.desde,h.hasta), 0);
  const adminPagadas = dataAdmin.filter(h => h.pago).length;
  const adminIngHTML = dataAdmin.length ? fmtMonto(adminTotal) : "$0";

  // Group by month
  const byMonth = {};
  dataAdmin.forEach(h => {
    const mes = (h.fechaCierre||h.hasta||"").slice(0,7);
    if(!byMonth[mes]) byMonth[mes] = [];
    byMonth[mes].push(h);
  });
  const mesesOrden = Object.keys(byMonth).sort().reverse();

  let bodyHTML = "";
  mesesOrden.forEach((mes, mi) => {
    const mData = byMonth[mes];
    const mMonto = mData.reduce((s,h)=>s+h.monto,0);
    const mNoches = mData.reduce((s,h)=>s+diffDays(h.desde,h.hasta),0);
    const [y,mo] = mes.split("-");
    const mesLabel = `${MESES[parseInt(mo)-1]} ${y}`;
    const gid = `statMes_${mi}`;
    bodyHTML += `<tr onclick="var g=document.getElementById('${gid}');var rows=g.querySelectorAll('tr');rows.forEach(r=>r.style.display=r.style.display==='none'?'':'none');this.querySelector('.stat-chevron').style.transform=rows[0]?.style.display===''?'':'rotate(-90deg)'"
      style="background:var(--bg3);cursor:pointer;border-top:2px solid var(--border2)">
      <td colspan="5" style="padding:7px 10px;font-size:0.75rem;font-weight:700;color:var(--text2)">
        <svg class="stat-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:6px;transition:transform 0.15s"><polyline points="6 9 12 15 18 9"/></svg>
        ${mesLabel} <span style="color:var(--text3);font-weight:400;font-size:0.7rem;margin-left:6px">${mData.length} reservas · ${mNoches}n</span>
      </td>
      <td style="padding:7px 10px;font-family:'Fraunces',serif;font-weight:700;color:var(--gold);text-align:right;font-size:0.82rem">${fmtMonto(mMonto)}</td>
      <td colspan="5"></td>
    </tr>
    <tbody id="${gid}">${mData.map((h,i) => buildRow(h,i,"var(--card)","var(--bg2)","var(--border)")).join("")}</tbody>`;
  });

  const totalRow = `<tr style="background:var(--bg3);border-top:2px solid var(--border2)">
    <td style="padding:6px 10px;font-size:0.72rem;color:var(--text3);font-weight:700;text-transform:uppercase" colspan="4">Total (${dataAdmin.length})</td>
    <td style="padding:6px 10px;font-weight:700;text-align:center;color:var(--text)">${adminNoches}n</td>
    <td style="padding:6px 10px;font-family:'Fraunces',serif;font-weight:700;color:var(--gold);text-align:right">${adminIngHTML}</td>
    <td style="padding:6px 10px;color:var(--green);font-weight:700;text-align:center">${adminPagadas}</td>
    <td colspan="4"></td>
  </tr>`;

  const mainHTML = `
    <div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border)">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed">
        ${buildHeader((col,label,align) => thMain(col,label,align))}
        ${bodyHTML}
        <tfoot>${totalRow}</tfoot>
      </table>
    </div>`;

  document.getElementById("statList").innerHTML = pendienteHTML + mainHTML;
}




// ─── AGENDA DE CLIENTES ─────────────────────────────────
function renderAgendaClientes() {
  const el = document.getElementById("agendaClientesList");
  if(!el) return;
  const q = (document.getElementById("agendaClientesBuscar")?.value || "").toLowerCase().trim();
  const sourceReservas = [
    ...historial.map(h => ({ ...h, _src: "hist" })),
    ...reservas
      .filter(r => r.estado !== "cancelada")
      .map(r => ({ ...r, fechaCierre: "", _src: "act" }))
  ].filter(r => r.huesped || r.contacto);

  // Agrupar reservas activas + historial por teléfono (o nombre si no hay tel)
  const clientMap = {};
  sourceReservas.forEach(h => {
    const key = h.contacto ? h.contacto.replace(/\s/g,"") : ("__"+(h.huesped||"").toLowerCase());
    if(!clientMap[key]) {
      clientMap[key] = {
        nombre: h.huesped,
        contacto: h.contacto || "",
        reservas: []
      };
    }
    // Actualizar nombre al más reciente
    const fechaRef = h.fechaCierre || h.hasta || h.desde || "";
    if(fechaRef > (clientMap[key].ultimoCierre||"")) {
      clientMap[key].nombre = h.huesped;
      clientMap[key].ultimoCierre = fechaRef;
    }
    clientMap[key].reservas.push(h);
  });

  // Filtrar
  let clientes = Object.values(clientMap).filter(c => {
    if(!q) return true;
    const nombre = c.nombre.toLowerCase();
    const tel    = c.contacto.toLowerCase();
    return nombre.includes(q) || tel.includes(q);
  });

  // Ordenar por nombre
  clientes.sort((a,b) => a.nombre.localeCompare(b.nombre));

  if(clientes.length === 0) {
    el.innerHTML = `<div class="agenda-empty">${q ? "Sin resultados para <strong>"+q+"</strong>" : "No hay clientes registrados todavía."}</div>`;
    return;
  }

  const thS = "padding:6px 10px;font-size:0.62rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text3);font-weight:700;white-space:nowrap;border-bottom:2px solid var(--border2);background:var(--bg3)";
  const tdS = (extra) => `padding:5px 10px;font-size:0.78rem;border-bottom:1px solid var(--border);vertical-align:top;${extra||""}`;

  const rows = clientes.map((c, ci) => {
    const bg = ci%2===0 ? "var(--card)" : "var(--bg2)";
    // Sort reservas by date desc
    const sorted = [...c.reservas].sort((a,b)=>(b.fechaCierre||b.hasta||b.desde).localeCompare(a.fechaCierre||a.hasta||a.desde));
    const totalReservas = sorted.length;
    const totalNoches   = sorted.reduce((s,h)=>s+diffDays(h.desde,h.hasta),0);
    const totalMonto    = sorted.reduce((s,h)=>s+h.monto,0);

    // Sub-rows for each reservation
    const subRows = sorted.map((h,ri) => {
      const a = aptos.find(x=>x.id===h.aptoId);
      const noches = diffDays(h.desde,h.hasta);
      return `<div style="font-size:0.72rem;color:var(--text2);padding:2px 0;border-bottom:${ri<sorted.length-1?"1px dashed var(--border)":""};display:grid;grid-template-columns:110px 90px 64px 90px;gap:6px;align-items:center">
        <span>${fmt(h.desde)} → ${fmt(h.hasta)}</span>
        <span style="color:var(--gold);font-weight:600">${fmtMonto(h.monto)}</span>
        <span style="color:var(--text3)">${noches}n · ${h.cantHuespedes||"—"}hués.</span>
        <span style="color:var(--text3);font-size:0.68rem">${a?a.nombre:"—"}${h._src==="act" ? ` · <strong style="color:var(--green);font-weight:700">activa</strong>` : ""}</span>
      </div>`;
    }).join("");

    return `<tr style="background:${bg}">
      <td style="${tdS("font-weight:700;color:var(--text);white-space:nowrap")}">${c.nombre}</td>
      <td style="${tdS("color:var(--text2);white-space:nowrap")}">${c.contacto ? `<a href="tel:${c.contacto}" style="color:inherit;text-decoration:none">📱 ${c.contacto}</a>` : "—"}</td>
      <td style="${tdS("text-align:center;color:var(--text);font-weight:700")}">${totalReservas}</td>
      <td style="${tdS("text-align:center;color:var(--text3)")}">${totalNoches}n</td>
      <td style="${tdS("font-family:'Fraunces',serif;font-weight:600;color:var(--gold)")}">${fmtMonto(totalMonto)}</td>
      <td style="${tdS("min-width:300px")}">${subRows}</td>
    </tr>`;
  }).join("");

  el.innerHTML = `
    <div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border)">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="${thS}">Cliente</th>
          <th style="${thS}">Teléfono</th>
          <th style="${thS};text-align:center">Reservas</th>
          <th style="${thS};text-align:center">Noches</th>
          <th style="${thS}">Total pagado</th>
          <th style="${thS}">Detalle de reservas</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="font-size:0.7rem;color:var(--text3);margin-top:8px">${clientes.length} cliente${clientes.length!==1?"s":""} · ${sourceReservas.length} reserva${sourceReservas.length!==1?"s":""} entre activas e historial</div>
  `;
}

// ─── TABLA COBROS POR USUARIO ────────────────────────────
function abrirTablaCobros() {
  if(historial.length === 0) {
    document.getElementById("tablaCobrosContent").innerHTML =
      `<div class="agenda-empty">No hay reservas finalizadas todavía.</div>`;
    openModal("modalCobros");
    return;
  }

  // Aggregate by cobrador
  const porUsuario = {};
  historial.forEach(h => {
    const key = h.cobrador || "Sin asignar";
    if(!porUsuario[key]) porUsuario[key] = { totalPesos: 0, totalUSD: 0, cantidad: 0, pagadas: 0, medios: {} };
    if(h.monto >= 5000) porUsuario[key].totalPesos += h.monto;
    else                porUsuario[key].totalUSD   += h.monto;
    porUsuario[key].cantidad += 1;
    if(h.pago) porUsuario[key].pagadas += 1;
    const medio = h.medioPago || "Sin especificar";
    porUsuario[key].medios[medio] = (porUsuario[key].medios[medio] || 0) + h.monto;
  });

  const sorted = Object.entries(porUsuario).sort((a,b) => (b[1].totalPesos+b[1].totalUSD) - (a[1].totalPesos+a[1].totalUSD));
  const grandPesos = sorted.reduce((s,[,v]) => s + v.totalPesos, 0);
  const grandUSD   = sorted.reduce((s,[,v]) => s + v.totalUSD,   0);
  const grandTotalHTML = fmtMonto(grandPesos + grandUSD) || "$0";

  const rows = sorted.map(([nombre, v], i) => {
    const par = i % 2 === 0;
    const u = usuarios.find(x => x.nombre === nombre);
    const rol = u?.rol ? `<span style="font-size:0.68rem;color:var(--text3);font-weight:400"> — ${u.rol}</span>` : "";
    const mediosStr = Object.entries(v.medios)
      .sort((a,b) => b[1]-a[1])
      .map(([m, val]) => `<span class="reserva-estado" style="background:var(--bg3);color:var(--text3);border:1px solid var(--border);margin:1px">${m}: $${val.toLocaleString()}</span>`)
      .join(" ");
    const totalHTML = fmtMonto(v.totalPesos + v.totalUSD) || "$0";
    return `<tr style="${par ? '' : 'background:var(--bg3)'}">
      <td style="font-weight:600;color:var(--text)">${nombre}${rol}</td>
      <td style="text-align:center;color:var(--text)">${v.cantidad}</td>
      <td style="text-align:center;color:var(--green)">${v.pagadas}</td>
      <td style="text-align:center;color:var(--red)">${v.cantidad - v.pagadas}</td>
      <td style="text-align:right;font-family:'Fraunces',serif;font-weight:600;color:var(--gold);font-size:0.88rem">${totalHTML}</td>
      <td style="font-size:0.72rem">${mediosStr}</td>
    </tr>`;
  }).join("");

  document.getElementById("tablaCobrosContent").innerHTML = `
    <table class="tabla-resumen" style="font-size:0.82rem">
      <thead>
        <tr>
          <th style="text-align:left">Usuario</th>
          <th>Reservas</th>
          <th>Pagadas</th>
          <th>Impagas</th>
          <th>Total cobrado</th>
          <th style="text-align:left">Medios usados</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:var(--bg2);border-top:2px solid var(--border2)">
          <td style="font-weight:700;color:var(--text2);padding:8px 12px;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em">Total</td>
          <td style="text-align:center;font-weight:700;color:var(--text);padding:8px 12px">${historial.length}</td>
          <td style="text-align:center;font-weight:700;color:var(--green);padding:8px 12px">${historial.filter(h=>h.pago).length}</td>
          <td style="text-align:center;font-weight:700;color:var(--red);padding:8px 12px">${historial.filter(h=>!h.pago).length}</td>
          <td style="text-align:right;font-family:'Fraunces',serif;font-weight:700;color:var(--gold);font-size:0.9rem;padding:8px 12px">${grandTotalHTML}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  `;

  openModal("modalCobros");
}

// ─── TABLA DETALLE ───────────────────────────────────────
function abrirTablaDetalle() {
  if(historial.length === 0) {
    document.getElementById("tablaDetalleContent").innerHTML =
      `<div class="agenda-empty">No hay reservas finalizadas todavía.</div>`;
    openModal("modalTablaDetalle");
    return;
  }

  const data = [...historial].sort((a,b) => (b.fechaCierre||b.hasta).localeCompare(a.fechaCierre||a.hasta));

  const rows = data.map((h, i) => {
    const a      = aptos.find(x => x.id === h.aptoId);
    const noches = diffDays(h.desde, h.hasta);
    const moneda = h.monto < 5000 ? "USD" : "$";
    const par    = i % 2 === 0;
    return `<tr style="${par ? '' : 'background:var(--bg3)'}">
      <td style="color:var(--text)">${fmt(h.desde)}</td>
      <td style="color:var(--text)">${fmt(h.hasta)}</td>
      <td style="color:var(--gold);font-weight:600">${a ? a.nombre : "—"}</td>
      <td style="color:var(--text);font-weight:500">${h.huesped}</td>
      <td style="color:var(--gold);font-family:'Fraunces',serif;font-weight:600;text-align:right">${moneda} ${h.monto.toLocaleString()}</td>
      <td style="color:var(--text);text-align:center">${noches}</td>
      <td style="color:var(--text2)">${h.cobrador || "—"}</td>
      <td style="color:var(--text2)">${h.medioPago || "—"}</td>
    </tr>`;
  }).join("");

  const totalPesos  = historial.filter(h => h.monto >= 5000).reduce((s,h) => s + h.monto, 0);
  const totalUSD    = historial.filter(h => h.monto < 5000).reduce((s,h) => s + h.monto, 0);
  const totalNoches = historial.reduce((s,h) => s + diffDays(h.desde,h.hasta), 0);
  const detTotalHTML = [
    totalPesos ? `$${totalPesos.toLocaleString()}` : "",
    totalUSD   ? `USD ${totalUSD.toLocaleString()}` : "",
  ].filter(Boolean).join(" / ") || "$0";

  document.getElementById("tablaDetalleContent").innerHTML = `
    <table class="tabla-resumen" style="font-size:0.82rem">
      <thead>
        <tr>
          <th style="text-align:left">Ingreso</th>
          <th style="text-align:left">Egreso</th>
          <th style="text-align:left">Depto</th>
          <th style="text-align:left">Huésped</th>
          <th>Precio</th>
          <th>Días</th>
          <th style="text-align:left">Quién cobró</th>
          <th style="text-align:left">Medio de pago</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr style="background:var(--bg2);font-weight:700;border-top:2px solid var(--border2)">
          <td colspan="4" style="color:var(--text2);padding:8px 12px;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em">Total (${data.length} reservas)</td>
          <td style="color:var(--gold);font-family:'Fraunces',serif;font-size:0.88rem;text-align:right;padding:8px 12px">${detTotalHTML}</td>
          <td style="color:var(--text);text-align:center;padding:8px 12px">${totalNoches}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>
  `;

  openModal("modalTablaDetalle");
}

// ─── TABLA RESUMEN ───────────────────────────────────────
function abrirTablaResumen() {
  // Default: current month
  const now = new Date();
  const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0');
  const firstDay = `${y}-${m}-01`;
  const lastDay  = `${y}-${m}-${String(new Date(y, now.getMonth()+1, 0).getDate()).padStart(2,'0')}`;
  document.getElementById("tr_desde").value = firstDay;
  document.getElementById("tr_hasta").value = lastDay;
  document.getElementById("tablaResumenContent").innerHTML = "";
  openModal("modalTabla");
  generarTablaResumen();
}

function generarTablaResumen() {
  const desdeStr = document.getElementById("tr_desde").value;
  const hastaStr = document.getElementById("tr_hasta").value;
  const el = document.getElementById("tablaResumenContent");
  if(!desdeStr || !hastaStr) { el.innerHTML = `<div style="color:var(--text3);padding:24px;text-align:center">Seleccioná fecha desde y hasta</div>`; return; }

  const desde = parseDate(desdeStr);
  const hasta  = parseDate(hastaStr);
  if(desde > hasta) { el.innerHTML = `<div style="color:var(--red);padding:24px;text-align:center">La fecha desde debe ser anterior a la fecha hasta</div>`; return; }

  const totalDiasPeriodo = Math.round((hasta - desde) / (1000*60*60*24)) + 1;

  // Use both historial and active reservas
  const todasReservas = [
    ...historial.map(r => ({...r, _src:"hist"})),
    ...reservas.filter(r => r.estado !== "cancelada").map(r => ({...r, _src:"act"}))
  ];

  // Filter to reservas that overlap with the date range
  const enRango = todasReservas.filter(r => {
    const d = parseDate(r.desde), h = parseDate(r.hasta);
    return d <= hasta && h >= desde;
  });

  // Get unique aptos with data
  const aptoIds = [...new Set(enRango.map(r => r.aptoId))].sort((a,b) => {
    const na = aptos.find(x=>x.id===a)?.nombre||"";
    const nb = aptos.find(x=>x.id===b)?.nombre||"";
    return na.localeCompare(nb);
  });

  if(aptoIds.length === 0) {
    el.innerHTML = `<div style="color:var(--text3);padding:32px;text-align:center">Sin reservas en ese período</div>`;
    return;
  }

  // Per apto: calc dias reservados (clipped to range) and monto
  const fmtNum = n => n > 0 ? fmtMonto(n) : "—";

  let grandMonto = 0, grandDias = 0;

  const rows = aptoIds.map(id => {
    const a = aptos.find(x => x.id === id);
    const rs = enRango.filter(r => r.aptoId === id);

    // Dias reservados clipped to range
    let diasReservados = 0;
    rs.forEach(r => {
      const d = new Date(Math.max(parseDate(r.desde), desde));
      const h = new Date(Math.min(parseDate(r.hasta), hasta));
      diasReservados += Math.max(0, Math.round((h - d) / (1000*60*60*24)));
    });

    // Monto total (proportional clip if needed — use full monto for simplicity)
    const montoTotal = rs.reduce((s,r) => s + (r.monto||0), 0);
    grandMonto += montoTotal;
    grandDias  += diasReservados;

    const pct = Math.round(diasReservados / totalDiasPeriodo * 100);
    const barColor = pct >= 80 ? "var(--green)" : pct >= 40 ? "var(--gold)" : "var(--text3)";

    return `<tr>
      <td style="padding:10px 12px;font-weight:600;color:var(--text);white-space:nowrap;position:sticky;left:0;background:var(--bg)">${a ? a.nombre : id}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:700;color:var(--gold)">${montoTotal > 0 ? fmtMonto(montoTotal) : "—"}</td>
      <td style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text)">${diasReservados}d</td>
      <td style="padding:10px 12px;text-align:center">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:6px;background:var(--bg3);border-radius:3px;min-width:60px">
            <div style="height:6px;border-radius:3px;background:${barColor};width:${pct}%"></div>
          </div>
          <span style="font-size:0.8rem;font-weight:700;color:${barColor};min-width:32px">${pct}%</span>
        </div>
      </td>
      <td style="padding:10px 12px;text-align:center;color:var(--text3);font-size:0.78rem">${diasReservados}/${totalDiasPeriodo}d</td>
    </tr>`;
  }).join("");

  const pctTotal = Math.round(grandDias / (totalDiasPeriodo * aptoIds.length) * 100);

  el.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:0.84rem">
      <thead>
        <tr style="border-bottom:2px solid var(--border2)">
          <th style="text-align:left;padding:8px 12px;font-size:0.65rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;position:sticky;left:0;background:var(--bg)">Depto</th>
          <th style="text-align:right;padding:8px 12px;font-size:0.65rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em">Monto total</th>
          <th style="text-align:center;padding:8px 12px;font-size:0.65rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em">Días reserv.</th>
          <th style="text-align:center;padding:8px 12px;font-size:0.65rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;min-width:140px">Ocupación</th>
          <th style="text-align:center;padding:8px 12px;font-size:0.65rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em">Ratio</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr style="border-top:2px solid var(--border2);background:var(--bg2)">
          <td style="padding:10px 12px;font-weight:800;color:var(--text);position:sticky;left:0;background:var(--bg2)">TOTAL</td>
          <td style="padding:10px 12px;text-align:right;font-weight:800;color:var(--gold)">${grandMonto > 0 ? fmtMonto(grandMonto) : "—"}</td>
          <td style="padding:10px 12px;text-align:center;font-weight:800;color:var(--text)">${grandDias}d</td>
          <td style="padding:10px 12px;text-align:center">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="flex:1;height:6px;background:var(--bg3);border-radius:3px;min-width:60px">
                <div style="height:6px;border-radius:3px;background:var(--gold);width:${pctTotal}%"></div>
              </div>
              <span style="font-size:0.8rem;font-weight:700;color:var(--gold);min-width:32px">${pctTotal}%</span>
            </div>
          </td>
          <td style="padding:10px 12px;text-align:center;color:var(--text3);font-size:0.78rem">${grandDias}/${totalDiasPeriodo * aptoIds.length}d</td>
        </tr>
      </tfoot>
    </table>
    <div style="margin-top:10px;font-size:0.7rem;color:var(--text3)">
      Período: ${fmt(desde)} → ${fmt(hasta)} (${totalDiasPeriodo} días). Incluye reservas activas e historial.
    </div>`;
}

// ─── EXPORTAR TABLA ──────────────────────────────────────
function exportarTabla(contenedorId, nombre, formato) {
  const tabla = document.querySelector(`#${contenedorId} table`);
  if(!tabla) return;

  const filas = [...tabla.querySelectorAll("tr")];
  const datos = filas.map(fila =>
    [...fila.querySelectorAll("th, td")].map(celda =>
      celda.innerText.replace(/\n/g, " ").replace(/\s+/g, " ").trim()
    )
  ).filter(fila => fila.some(c => c));

  if(formato === "csv") {
    const csv = datos.map(fila =>
      fila.map(c => `"${c.replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const bom = "\uFEFF"; // UTF-8 BOM for Excel compatibility
    descargar(bom + csv, `${nombre}.csv`, "text/csv;charset=utf-8;");

  } else { // xls — HTML table format that Excel opens natively
    const ths = datos[0].map(c => `<th style="background:#1c1a17;color:#d4a853;font-weight:bold">${c}</th>`).join("");
    const trs = datos.slice(1).map(fila =>
      `<tr>${fila.map(c => `<td>${c}</td>`).join("")}</tr>`
    ).join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8">
      <style>
        table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11pt; }
        th { background: #1c1a17; color: #d4a853; padding: 6px 10px; border: 1px solid #ccc; }
        td { padding: 5px 10px; border: 1px solid #ddd; }
        tr:nth-child(even) td { background: #f5f5f0; }
      </style></head>
      <body><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></body></html>`;
    descargar(html, `${nombre}.xls`, "application/vnd.ms-excel;charset=utf-8;");
  }
}

function descargar(contenido, nombreArchivo, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── NOTAS ────────────────────────────────────────────────
// ─── SEARCHABLE DROPDOWN GENÉRICO ─────────────────────────
// items: [{value, label, color?}]
// onSelect: function(value, label)
function openSearchableDropdown(anchorEl, items, currentValue, onSelect) {
  document.getElementById('_sdrop_portal')?.remove();
  const rect = anchorEl.getBoundingClientRect();
  const portal = document.createElement('div');
  portal.id = '_sdrop_portal';
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  const maxH = Math.min(260, Math.max(120, spaceBelow));
  portal.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.bottom+2}px;width:${Math.max(rect.width,200)}px;background:var(--bg2);border:1px solid var(--border2);border-radius:10px;z-index:99999;box-shadow:0 12px 40px rgba(0,0,0,0.7);overflow:hidden`;

  const searchWrap = document.createElement('div');
  searchWrap.style.cssText = 'padding:8px 10px;border-bottom:1px solid var(--border);position:relative';
  const searchInput = document.createElement('input');
  searchInput.placeholder = 'Buscar…';
  searchInput.style.cssText = 'width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--text);font-family:DM Sans,sans-serif;font-size:0.83rem;padding:6px 10px;outline:none;box-sizing:border-box';
  searchWrap.appendChild(searchInput);
  portal.appendChild(searchWrap);

  const listEl = document.createElement('div');
  listEl.style.cssText = `max-height:${maxH}px;overflow-y:auto`;
  portal.appendChild(listEl);

  function renderItems(q) {
    listEl.innerHTML = '';
    const filtered = q ? items.filter(i => i.label.toLowerCase().includes(q.toLowerCase())) : items;
    if(!filtered.length) {
      listEl.innerHTML = '<div style="padding:10px 14px;font-size:0.82rem;color:var(--text3)">Sin resultados</div>';
      return;
    }
    filtered.forEach(item => {
      const div = document.createElement('div');
      div.style.cssText = `padding:9px 14px;cursor:pointer;font-size:0.84rem;border-bottom:1px solid var(--border);color:${item.color||'var(--text)'};font-weight:${item.color?'700':'400'};background:${item.value===currentValue?'var(--bg3)':'transparent'}`;
      div.textContent = item.label;
      div.addEventListener('mouseenter', () => div.style.background = 'var(--bg3)');
      div.addEventListener('mouseleave', () => div.style.background = item.value===currentValue?'var(--bg3)':'transparent');
      div.addEventListener('mousedown', e => {
        e.preventDefault();
        portal.remove();
        onSelect(item.value, item.label);
      });
      listEl.appendChild(div);
    });
  }

  renderItems('');
  searchInput.addEventListener('input', () => renderItems(searchInput.value));
  searchInput.addEventListener('keydown', e => {
    if(e.key === 'Escape') portal.remove();
    if(e.key === 'Enter') { const first = listEl.querySelector('div'); if(first) first.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); }
  });

  document.body.appendChild(portal);
  setTimeout(() => {
    const pr = portal.getBoundingClientRect();
    if(pr.bottom > window.innerHeight - 8) portal.style.top = (rect.top - portal.offsetHeight - 2)+'px';
    searchInput.focus();
    document.addEventListener('mousedown', function h(ev) {
      if(!portal.contains(ev.target) && ev.target !== anchorEl) { portal.remove(); document.removeEventListener('mousedown',h); }
    });
  }, 0);
}

function toggleSearchableDropdown(id) {
  if(document.getElementById('_sdrop_portal')) { document.getElementById('_sdrop_portal').remove(); return; }
  const hidden = document.getElementById(id);
  const display = document.getElementById(id+'_display');
  if(!hidden || !display) return;

  let items = [];
  if(id === 'nota_apto') {
    items = aptos.map(a => ({ value: String(a.id), label: a.nombre + (a.desc ? ' — '+a.desc : '') }));
  }

  openSearchableDropdown(display, items, hidden.value, (val, label) => {
    hidden.value = val;
    display.textContent = label;
    display.style.color = '';
  });
}

// Convierte todos los <select class="form-input"> dentro de un modal en dropdowns con búsqueda
// Skips selects que ya tienen pocos items (<= 4) como pago/ingreso/moneda, o los custom ya reemplazados
const _upgradedSelects = new Set();
function upgradeSelectsInModal(modalId) {
  const modal = document.getElementById(modalId);
  if(!modal) return;
  modal.querySelectorAll('select.form-input').forEach(sel => {
    if(_upgradedSelects.has(sel.id)) return;
    if(sel.options.length <= 4) return; // skip small selects (pago, ingreso, estado, moneda)
    if(!sel.id) return;
    _upgradedSelects.add(sel.id);
    _wrapSelectWithSearch(sel);
  });
}

function _wrapSelectWithSearch(sel) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative';
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  sel.style.display = 'none';

  const display = document.createElement('div');
  display.className = 'form-input';
  display.style.cssText = 'cursor:pointer;padding-right:32px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;user-select:none';
  const setDisplay = () => {
    const opt = sel.options[sel.selectedIndex];
    display.textContent = opt ? opt.text : '—';
    display.style.color = opt && opt.value ? '' : 'var(--text3)';
  };
  setDisplay();
  wrap.insertBefore(display, sel);

  const arrow = document.createElement('div');
  arrow.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
  arrow.style.cssText = 'position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--text3)';
  wrap.appendChild(arrow);

  display.addEventListener('click', () => {
    if(document.getElementById('_sdrop_portal')) { document.getElementById('_sdrop_portal').remove(); return; }
    const items = Array.from(sel.options).map(o => ({ value: o.value, label: o.text, color: o.style.color || '' }));
    openSearchableDropdown(display, items, sel.value, (val, label) => {
      sel.value = val;
      setDisplay();
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  // Keep display in sync if select changes programmatically
  const obs = new MutationObserver(setDisplay);
  obs.observe(sel, { childList: true, attributes: true, subtree: true });
}

function abrirModalNota() {
  const display = document.getElementById("nota_apto_display");
  const hidden  = document.getElementById("nota_apto");
  if(display) { display.textContent = "Seleccioná un departamento"; display.style.color = "var(--text3)"; }
  if(hidden)  hidden.value = "";
  document.getElementById("nota_texto").value = "";
  openModal("modalNota");
}

async function guardarNota() {
  const texto  = document.getElementById("nota_texto").value.trim();
  const aptoId = parseInt(document.getElementById("nota_apto").value);
  if(!texto || !aptoId) { toast("⚠️ Completá los campos", false); return; }
  const cr = await supa.post("notas", { apto_id: aptoId, texto, sort_key: "9999-12-31" });
  if(cr) notas.push(dbNota(cr));
  closeModal("modalNota"); render(); toast("✓ Nota agregada");
}

async function eliminarNota(id) {
  await supa.del("notas", id);
  notas = notas.filter(n => n.id !== id);
  render();
}

function actualizarNota(id, nuevoTexto) {
  const n = notas.find(x => x.id === id);
  if(n) { n.texto = nuevoTexto.trim(); supa.patch("notas", id, { texto: n.texto }); }
}

let _dragNotaId  = null;
let _dragAptoId  = null;

let _notaDragFromHandle = false;
let _reservaDragFromHandle = false;

function notaDragStart(e) {
  if(!_notaDragFromHandle) { e.preventDefault(); return; }
  e.stopPropagation();
  _dragFromHandle = false;
  _dragNotaId = parseInt(e.currentTarget.dataset.notaId);
  _dragAptoId = parseInt(e.currentTarget.dataset.aptoId);
  e.currentTarget.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", String(_dragNotaId));
}

function reservaItemDragStart(e) {
  if(!_reservaDragFromHandle) { e.preventDefault(); return; }
  e.stopPropagation();
  _dragFromHandle = false;
  _dragNotaId = null;
  window._dragReservaId = parseInt(e.currentTarget.dataset.reservaId);
  _dragAptoId = parseInt(e.currentTarget.dataset.aptoId);
  e.currentTarget.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", "reserva:" + window._dragReservaId);
}

function notaDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("drag-over");
}

function notaDragLeave(e) {
  e.currentTarget.classList.remove("drag-over");
}

function notaDrop(e, aptoId) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");

  const targetIndex = parseInt(e.currentTarget.dataset.index);
  const mixed = getMixedList(aptoId);

  // Handle reserva drag
  if(window._dragReservaId && _dragNotaId === null) {
    const rid = window._dragReservaId;
    window._dragReservaId = null;
    _dragAptoId = null;
    const fromIdx = mixed.findIndex(x => x._type === "reserva" && x.id === rid);
    if(fromIdx === -1) return;
    const [res] = mixed.splice(fromIdx, 1);
    mixed.splice(targetIndex, 0, res);
    // Re-sort reservas by their new order — swap desde values won't work well,
    // so just re-render visually; true reordering needs notas as anchors
    render(aptoId);
    return;
  }

  if(_dragNotaId === null) return;

  const fromIdx = mixed.findIndex(x => x._type === "nota" && x.id === _dragNotaId);
  if(fromIdx === -1) { _dragNotaId = null; return; }

  const [nota] = mixed.splice(fromIdx, 1);
  mixed.splice(targetIndex, 0, nota);

  // Reassign sortKeys based on neighbors and save to DB
  const savePromises = [];
  mixed.forEach((item, i) => {
    if(item._type === "nota") {
      const prevR = mixed.slice(0, i).reverse().find(x => x._type === "reserva");
      const nextR = mixed.slice(i+1).find(x => x._type === "reserva");
      const n = notas.find(x => x.id === item.id);
      if(n) {
        let newKey;
        if(prevR)      newKey = prevR.desde + "_z" + String(n.id).padStart(6,"0");
        else if(nextR) newKey = nextR.desde.replace(/(\d{4}-\d{2}-)(\d{2})/, (m,p,d) => p + String(Math.max(1, parseInt(d)-1)).padStart(2,"0")) + "_a" + String(n.id).padStart(6,"0");
        else           newKey = "0000-01-01_" + String(n.id).padStart(6,"0");
        if(n.sortKey !== newKey) {
          n.sortKey = newKey;
          savePromises.push(supa.patch("notas", n.id, { sort_key: newKey }));
        }
      }
    }
  });

  _dragNotaId = null;
  _dragAptoId = null;
  render();
  Promise.all(savePromises);
}

function moverNota(notaId, dir, aptoId) {
  // kept for backward compat — now unused
}

function getMixedList(aptoId) {
  const rs = reservas
    .filter(r => r.aptoId === aptoId && r.estado !== "cancelada")
    .sort((a,b) => parseDate(a.desde) - parseDate(b.desde))
    .map(r => ({ ...r, _type: "reserva", _sort: r.desde }));

  const ns = notas
    .filter(n => n.aptoId === aptoId)
    .map(n => ({ ...n, _type: "nota", _sort: n.sortKey }));

  return [...rs, ...ns].sort((a,b) => a._sort < b._sort ? -1 : a._sort > b._sort ? 1 : 0);
}

function renderNotas() {} // no-op: notes are now rendered inline in aptCard

// ─── LOG DE ACTIVIDAD ─────────────────────────────────────

// ─── USUARIO ACTUAL ───────────────────────────────────────
let currentUser = null;
let loginSelectedUser = null;

function abrirLogin() {
  loginSelectedUser = null;
  const list = document.getElementById("loginUserList");
  if(usuarios.length === 0) {
    list.innerHTML = `
      <div style="text-align:center;color:var(--text3);font-size:0.82rem;padding:8px 0 12px">No hay usuarios cargados todavía.</div>
      <button onclick="confirmarLogin(0)"
        style="padding:12px 16px;border-radius:8px;border:1px solid var(--border);
          background:var(--bg3);color:var(--text);font-family:'DM Sans',sans-serif;
          font-size:0.9rem;font-weight:500;text-align:center;cursor:pointer;
          transition:all 0.15s;width:100%"
        onmouseover="this.style.borderColor='var(--gold)';this.style.background='var(--gold-dim)'"
        onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--bg3)'">
        Entrar →
      </button>`;
  } else {
    list.innerHTML = usuarios.map(u => `
      <button onclick="confirmarLogin(${u.id})"
        style="padding:12px 16px;border-radius:8px;border:1px solid var(--border);
          background:var(--bg3);color:var(--text);font-family:'DM Sans',sans-serif;
          font-size:0.9rem;font-weight:500;text-align:left;cursor:pointer;
          transition:all 0.15s;width:100%"
        onmouseover="this.style.borderColor='var(--gold)';this.style.background='var(--gold-dim)'"
        onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--bg3)'">
        ${u.nombre}${u.rol ? ` <span style="color:var(--text3);font-size:0.75rem">— ${u.rol}</span>` : ""}
      </button>`).join("");
  }
  document.getElementById("modalLogin").classList.add("open");
}

function confirmarLogin(id) {
  const u = id ? usuarios.find(x => x.id === id) : null;
  currentUser = u ? u.nombre : "—";
  document.getElementById("modalLogin").classList.remove("open");
  const badge = document.getElementById("currentUserBadge");
  badge.textContent = currentUser;
  badge.style.display = currentUser !== "—" ? "inline" : "none";
  syncAptoSortOrder();
  applyStoredDeptoFilters();
  render();
  if(currentUser !== "—") logAccion("Sesión iniciada", currentUser);
}

function togglePassVisibility(inputId, btn) {
  const inp = document.getElementById(inputId);
  inp.type = inp.type === "password" ? "text" : "password";
  btn.textContent = inp.type === "password" ? "👁" : "🙈";
}

function togglePassDisplay(userId, pass) {
  const span = document.getElementById(`pass-${userId}`);
  if(!span) return;
  span.textContent = span.textContent.includes("•") ? pass : "•".repeat(pass.length);
}

// ─── LOG DE ACTIVIDAD ─────────────────────────────────────
function logAccion(accion, detalle = "") {
  const now = new Date();
  const hora  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const fecha = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
  const entry = { fecha, hora, accion, detalle, usuario: currentUser || "—" };
  activityLog.unshift(entry);
  if(activityLog.length > 500) activityLog.pop();
  supa.post("activity_log", entry).catch(()=>{});
}

function limpiarFiltrosLog() {
  const u = document.getElementById("logFiltroUsuario");
  const f = document.getElementById("logFiltroFecha");
  if(u) u.value = "";
  if(f) f.value = "";
  renderLogSeccion();
}

function renderLogSeccion() {
  const content = document.getElementById("logSeccionContent");
  const countEl = document.getElementById("logCount");
  if(!content) return;

  // Populate user filter if empty
  const selU = document.getElementById("logFiltroUsuario");
  if(selU && selU.options.length <= 1) {
    const users = [...new Set(activityLog.map(e => e.usuario).filter(Boolean))].sort();
    users.forEach(u => {
      const o = document.createElement("option");
      o.value = u; o.textContent = u;
      selU.appendChild(o);
    });
  }

  const filtroUsuario = document.getElementById("logFiltroUsuario")?.value || "";
  const filtroFecha   = document.getElementById("logFiltroFecha")?.value || "";

  let lista = activityLog.slice();
  if(filtroUsuario) lista = lista.filter(e => e.usuario === filtroUsuario);
  if(filtroFecha)   lista = lista.filter(e => e.fecha === filtroFecha.split("-").reverse().join("/"));

  if(countEl) countEl.textContent = `${lista.length} registro${lista.length !== 1 ? "s" : ""}`;

  if(lista.length === 0) {
    content.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text3);font-size:0.82rem">Sin registros${filtroUsuario||filtroFecha ? " para este filtro" : ""}.</div>`;
    return;
  }

  // Helper: get week label from DD/MM/YYYY fecha
  function getWeekLabel(fecha) {
    if(!fecha) return "Sin fecha";
    const parts = fecha.split("/");
    if(parts.length !== 3) return fecha;
    const d = new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0]));
    if(isNaN(d)) return fecha;
    // Get Monday of that week
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    const mon = new Date(d); mon.setDate(d.getDate() + diff);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const pad = n => String(n).padStart(2,'0');
    return `${pad(mon.getDate())}/${pad(mon.getMonth()+1)} — ${pad(sun.getDate())}/${pad(sun.getMonth()+1)}/${sun.getFullYear()}`;
  }

  let lastWeek = null;
  let html = '';
  let groupIdx = 0;
  lista.forEach(e => {
    const week = getWeekLabel(e.fecha);
    if(week !== lastWeek) {
      if(lastWeek !== null) html += `</div>`;
      const gid = `logGroup_${groupIdx++}`;
      html += `<div style="font-size:0.67rem;color:var(--text3);text-transform:uppercase;letter-spacing:0.08em;font-weight:700;padding:10px 0 4px;border-top:1px solid var(--border);margin-top:4px;cursor:pointer;display:flex;align-items:center;gap:6px;user-select:none" onclick="var g=document.getElementById('${gid}');g.style.display=g.style.display==='none'?'flex':'none';this.querySelector('.log-chevron').style.transform=g.style.display==='none'?'rotate(-90deg)':''">
        <svg class="log-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;transition:transform 0.15s;transform:rotate(-90deg)"><polyline points="6 9 12 15 18 9"/></svg>
        Semana del ${week}
      </div>
      <div id="${gid}" style="display:none;flex-direction:column;gap:0">`;
      lastWeek = week;
    }
    html += `<div class="log-row">
      <span class="log-hora">${e.fecha} ${e.hora}</span>
      <span style="background:var(--bg3);color:var(--text2);font-size:0.65rem;padding:1px 6px;border-radius:8px;flex-shrink:0;white-space:nowrap">${e.usuario}</span>
      <span class="log-accion">${e.accion}</span>
      ${e.detalle ? `<span class="log-detalle">${e.detalle}</span>` : ""}
    </div>`;
  });
  if(lastWeek !== null) html += `</div>`;
  content.innerHTML = html;
}

function abrirLog() { switchPage('estadistica', document.getElementById('navEstadistica')); }

async function limpiarLog() {
  if(!confirm("¿Limpiar todo el historial de actividad?")) return;
  await fetch(`${SUPA_URL}/rest/v1/activity_log?id=gt.0`, { method:"DELETE", headers: supa.h });
  activityLog = [];
  renderLogSeccion();
  toast("✓ Log limpiado");
}

// ─── GASTOS ───────────────────────────────────────────────
function renderGastos() {
  const dir = gastosSort.dir === "asc" ? 1 : -1;
  const lista = [...gastos].sort((a,b) => {
    const av = a[gastosSort.campo] ?? "";
    const bv = b[gastosSort.campo] ?? "";
    if(gastosSort.campo === "monto") return (Number(av) - Number(bv)) * dir;
    return String(av).localeCompare(String(bv), "es", { numeric: true }) * dir;
  });

  // ── SALDOS ──────────────────────────────────────────────
  // For each user: total spent + how much they paid FOR others
  const saldosEl = document.getElementById("gastosSaldos");
  if(saldosEl) {
    saldosEl.innerHTML = buildGastosSummaryHTML(getGastosSummaryData(lista), "No hay gastos registrados este período");
  }

  // ── LISTA POR USUARIO ────────────────────────────────────
  const listaEl = document.getElementById("gastosLista");
  if(!listaEl) return;

  if(lista.length === 0) {
    listaEl.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text3)">No hay gastos registrados este período</div>`;
    renderGastosClosures();
    return;
  }

  const arrow = campo => gastosSort.campo === campo ? (gastosSort.dir === "asc" ? " ↑" : " ↓") : "";
  const thBtn = (campo, label, align = "left") => `<th onclick="sortGastos('${campo}')" style="text-align:${align};padding:8px 12px;font-size:0.65rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;cursor:pointer;user-select:none">${label}${arrow(campo)}</th>`;

  listaEl.innerHTML = buildGastosTableHTML(lista, { interactive: true, showActions: true, sortable: true, thBtn });
  renderGastosClosures();
}

function fmtMoneyByCurrency(moneda, monto) {
  const valor = Number(monto) || 0;
  if(moneda === "USD") return `U$D ${valor.toLocaleString("es-AR")}`;
  return `$ ${valor.toLocaleString("es-AR")}`;
}
function buildGastosTableHTML(lista = [], options = {}) {
  const { interactive = false, showActions = false, sortable = false, thBtn = null } = options;
  const headerCell = (campo, label, align = "left") => {
    if(sortable && thBtn) return thBtn(campo, label, align);
    return `<th style="text-align:${align};padding:8px 12px;font-size:0.65rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em">${label}</th>`;
  };
  return `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;overflow:auto">
      <table style="width:100%;min-width:760px;border-collapse:collapse;font-size:0.82rem">
        <thead>
          <tr style="border-bottom:1px solid var(--border)">
            ${headerCell("fecha","Fecha")}
            ${headerCell("usuario","Usuario")}
            ${headerCell("categoria","Categoría")}
            ${headerCell("concepto","Concepto")}
            ${headerCell("monto","Monto","right")}
            ${headerCell("pagadoPor","Pagó","center")}
            ${showActions ? `<th style="padding:8px 6px;width:28px"></th>` : ""}
          </tr>
        </thead>
        <tbody>
          ${lista.map((g,i) => `
            <tr style="border-top:${i>0?'1px solid var(--border)':'none'};${interactive ? "cursor:pointer;transition:background 0.1s" : ""}" ${interactive ? `onclick="editarGasto(${g.id})" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''"` : ""}>
              <td style="padding:9px 12px;color:var(--text3);white-space:nowrap">${fmt(parseDate(g.fecha))}</td>
              <td style="padding:9px 12px;color:var(--text2)">${g.usuario || "Sin asignar"}</td>
              <td style="padding:9px 12px"><span style="display:inline-flex;padding:3px 8px;border-radius:999px;background:var(--bg3);border:1px solid var(--border);font-size:0.7rem;color:var(--text2)">${resolveGastoTypeName(g.categoria, DEFAULT_GASTO_TYPE_FALLBACK)}</span></td>
              <td style="padding:9px 12px;color:var(--text)">${g.concepto}${g.notas ? `<span style="color:var(--text3);font-size:0.72rem;margin-left:6px">· ${g.notas}</span>` : ""}</td>
              <td style="padding:9px 12px;text-align:right;font-weight:700;color:${g.moneda==='USD'?'var(--gold)':'var(--text)'};white-space:nowrap">${g.moneda==='USD'?'USD':'$'} ${g.monto.toLocaleString()}</td>
              <td style="padding:9px 12px;text-align:center">
                ${(g.pagadoPor || g.usuario)
                  ? `<span style="background:var(--orange-dim);color:var(--orange);border-radius:4px;padding:2px 7px;font-size:0.65rem;font-weight:700">${g.pagadoPor || g.usuario}</span>`
                  : `<span style="color:var(--text3);font-size:0.72rem">—</span>`}
              </td>
              ${showActions ? `<td style="padding:9px 6px;text-align:center"><button onclick="event.stopPropagation();eliminarGasto(${g.id})" style="background:none;border:none;color:var(--text3);cursor:pointer;padding:2px 4px;font-size:0.8rem;opacity:0.6;transition:opacity 0.15s" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'" title="Eliminar">✕</button></td>` : ""}
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}
function getGastosSummaryData(sourceList = []) {
  const lista = [...sourceList];
  const usrs = usuarios.filter(u => u.participaGastos !== false).map(u => u.nombre);
  const totalGasto = {};
  const rawDeudas = {};
  usrs.forEach(u => { totalGasto[u] = { ARS: 0, USD: 0 }; });

  lista.forEach(g => {
    const moneda = g.moneda === "USD" ? "USD" : "ARS";
    const monto = Number(g.monto) || 0;
    if(!usrs.length || !monto) return;
    const pagador = g.pagadoPor || g.usuario;
    if(pagador) {
      if(!totalGasto[pagador]) totalGasto[pagador] = { ARS: 0, USD: 0 };
      totalGasto[pagador][moneda] += monto;
    }
    const share = monto / usrs.length;
    if(!pagador || !usrs.includes(pagador)) return;
    usrs.forEach(u => {
      if(u === pagador) return;
      if(!rawDeudas[u]) rawDeudas[u] = {};
      if(!rawDeudas[u][pagador]) rawDeudas[u][pagador] = { ARS: 0, USD: 0 };
      rawDeudas[u][pagador][moneda] += share;
    });
  });

  const deudas = {};
  usrs.forEach(a => {
    usrs.forEach(b => {
      if(a === b) return;
      const ab = rawDeudas[a]?.[b] || { ARS: 0, USD: 0 };
      const ba = rawDeudas[b]?.[a] || { ARS: 0, USD: 0 };
      ["ARS", "USD"].forEach(moneda => {
        const neto = (ab[moneda] || 0) - (ba[moneda] || 0);
        if(neto > 0.009) {
          if(!deudas[a]) deudas[a] = {};
          if(!deudas[a][b]) deudas[a][b] = { ARS: 0, USD: 0 };
          deudas[a][b][moneda] = neto;
        }
      });
    });
  });

  const debtTotals = { ARS: 0, USD: 0 };
  Object.values(deudas).forEach(mapa => {
    Object.values(mapa).forEach(montos => {
      debtTotals.ARS += montos.ARS || 0;
      debtTotals.USD += montos.USD || 0;
    });
  });

  return { lista, usrs, totalGasto, deudas, debtTotals };
}
function buildGastosSummaryHTML(summary, emptyMessage = "No hay gastos en ese período.") {
  if(!summary.lista.length) {
    return `<div style="padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--bg3);color:var(--text3)">${emptyMessage}</div>`;
  }
  const totalCards = summary.usrs.map(u => {
    const ars = summary.totalGasto[u]?.ARS || 0;
    const usd = summary.totalGasto[u]?.USD || 0;
    const deudasUsuario = Object.entries(summary.deudas[u] || {}).map(([acreedor, montos]) => {
      const parts = [];
      if(montos.ARS > 0) parts.push(fmtMoneyByCurrency("ARS", montos.ARS));
      if(montos.USD > 0) parts.push(fmtMoneyByCurrency("USD", montos.USD));
      return parts.length ? `<div style="font-size:0.74rem;color:var(--text2);padding:6px 0;border-top:1px dashed rgba(255,255,255,0.08)">Debe a <strong>${acreedor}</strong>: ${parts.join(" + ")}</div>` : "";
    }).join("");
    const leDeben = summary.usrs.filter(o => o !== u).map(o => {
      const deuda = summary.deudas[o]?.[u] || { ARS: 0, USD: 0 };
      const parts = [];
      if(deuda.ARS > 0) parts.push(fmtMoneyByCurrency("ARS", deuda.ARS));
      if(deuda.USD > 0) parts.push(fmtMoneyByCurrency("USD", deuda.USD));
      return parts.length ? `<div style="font-size:0.74rem;color:var(--text2);padding:6px 0;border-top:1px dashed rgba(255,255,255,0.08)">Le debe <strong>${o}</strong>: ${parts.join(" + ")}</div>` : "";
    }).join("");
    const detalleDeudas = (deudasUsuario || leDeben)
      ? `<div style="margin-top:10px;padding-top:2px">
          ${deudasUsuario ? `<div style="font-size:0.64rem;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;margin-bottom:2px">Debe</div>${deudasUsuario}` : ""}
          ${leDeben ? `<div style="font-size:0.64rem;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;margin:${deudasUsuario ? "10px" : "0"} 0 2px">Le deben</div>${leDeben}` : ""}
        </div>`
      : `<div style="margin-top:10px;font-size:0.74rem;color:var(--text3)">Sin saldos cruzados en este período.</div>`;
    return `<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:12px;padding:12px 14px;min-width:220px;flex:1">
      <div style="font-size:0.68rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">${u}</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        <div><div style="font-size:0.62rem;color:var(--text3)">Pesos</div><div style="font-size:1rem;font-weight:800">${fmtMoneyByCurrency("ARS", ars)}</div></div>
        <div><div style="font-size:0.62rem;color:var(--text3)">Dólares</div><div style="font-size:1rem;font-weight:800;color:var(--gold)">${fmtMoneyByCurrency("USD", usd)}</div></div>
      </div>
      ${detalleDeudas}
    </div>`;
  }).join("");

  return `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <div style="background:var(--red-dim);border:1px solid rgba(224,92,92,0.25);border-radius:12px;padding:12px 14px;min-width:220px">
        <div style="font-size:0.66rem;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">Deuda total entre usuarios</div>
        <div style="margin-top:6px;font-size:0.95rem;font-weight:800;color:var(--red)">${fmtMoneyByCurrency("ARS", summary.debtTotals.ARS)}</div>
        <div style="font-size:0.95rem;font-weight:800;color:var(--gold)">${fmtMoneyByCurrency("USD", summary.debtTotals.USD)}</div>
      </div>
      <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:12px;padding:12px 14px;min-width:220px">
        <div style="font-size:0.66rem;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">Gastos del período</div>
        <div style="margin-top:6px;font-size:0.95rem;font-weight:800">${summary.lista.length} registro${summary.lista.length!==1?"s":""}</div>
      </div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">${totalCards}</div>`;
}
function renderGastosClosures() {
  const el = document.getElementById("gastosCierresHistorial");
  if(!el) return;
  if(!gastoClosures.length) {
    el.innerHTML = `<div style="margin-top:18px;padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--bg2)">
      <div class="section-title" style="font-size:1rem;margin-bottom:6px">Historial de cierres</div>
      <div style="color:var(--text3);font-size:0.82rem">Todavía no hay cierres guardados.</div>
    </div>`;
    return;
  }
  el.innerHTML = `<div style="margin-top:18px">
    <div class="section-title" style="font-size:1rem;margin-bottom:12px">Historial de cierres</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${gastoClosures.map(c => `
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="display:flex;flex-direction:column;gap:4px">
            <div style="font-size:0.74rem;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">${fmt(c.desde)} → ${fmt(c.hasta)}</div>
            <div style="font-size:0.84rem;color:var(--text2)">Cierre: ${fmt(c.fechaCierre)} · ${c.reset ? "reiniciado" : "solo guardado"} · ${c.cantidadGastos} gasto${c.cantidadGastos!==1?"s":""}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="verCierreGastos('${c.id}')">Ver resumen</button>
        </div>`).join("")}
    </div>
  </div>`;
}

function abrirModalGasto() {
  const hoy = new Date();
  const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
  _guardandoGasto = false;
  setGastoSaveState(false);
  document.getElementById("g_id").value = "";
  document.getElementById("g_fecha").value = hoyISO;
  document.getElementById("g_concepto").value = "";
  document.getElementById("g_monto").value = "";
  document.getElementById("g_moneda").value = "ARS";
  poblarCategoriasGasto(DEFAULT_GASTO_TYPE_FALLBACK);
  document.getElementById("g_notas").value = "";
  document.getElementById("modalGastoTitulo").textContent = "Nuevo Gasto";
  _poblarSelectsGasto(currentUser, "");
  openModal("modalGasto");
}

function _poblarSelectsGasto(usuario, pagadoPor) {
  const usrsGastos = usuarios.filter(u => u.participaGastos !== false);
  const selU = document.getElementById("g_usuario");
  const selP = document.getElementById("g_pagadopor");
  if(selU) selU.innerHTML = `<option value="">Sin asignar</option>` +
    usrsGastos.map(u => `<option value="${u.nombre}" ${u.nombre===usuario?"selected":""}>${u.nombre}</option>`).join("");
  if(selP) selP.innerHTML = `<option value="">No — lo pagó quien lo cargó</option>` +
    usrsGastos.map(u => `<option value="${u.nombre}" ${u.nombre===pagadoPor?"selected":""}>${u.nombre}</option>`).join("");
}

function editarGasto(id) {
  const g = gastos.find(x => x.id === id);
  if(!g) return;
  _guardandoGasto = false;
  setGastoSaveState(false);
  document.getElementById("g_id").value = g.id;
  document.getElementById("g_fecha").value = g.fecha;
  document.getElementById("g_concepto").value = g.concepto;
  document.getElementById("g_moneda").value = g.moneda;
  document.getElementById("g_monto").value = formatMontoByMoneda(g.monto, g.moneda);
  poblarCategoriasGasto(g.categoria || DEFAULT_GASTO_TYPE_FALLBACK);
  document.getElementById("g_notas").value = g.notas || "";
  document.getElementById("modalGastoTitulo").textContent = "Editar Gasto";
  _poblarSelectsGasto(g.usuario, g.pagadoPor || "");
  openModal("modalGasto");
}

async function guardarGasto() {
  if(_guardandoGasto) return;
  const gid      = document.getElementById("g_id").value;
  const fecha    = document.getElementById("g_fecha").value;
  const usuario  = document.getElementById("g_usuario").value;
  const concepto = document.getElementById("g_concepto").value.trim();
  const monto    = parseMontoInputValue(document.getElementById("g_monto").value);
  const moneda   = document.getElementById("g_moneda").value;
  const categoria= resolveGastoTypeName(document.getElementById("g_categoria").value || DEFAULT_GASTO_TYPE_FALLBACK, DEFAULT_GASTO_TYPE_FALLBACK);
  const notas    = document.getElementById("g_notas").value.trim();
  const pagadoPor= document.getElementById("g_pagadopor").value;

  if(!fecha)    { toast("⚠️ Ingresá la fecha", false); return; }
  if(!concepto) { toast("⚠️ Ingresá el concepto", false); return; }
  if(!monto)    { toast("⚠️ Ingresá el monto", false); return; }

  const row = { fecha, usuario, concepto, monto, moneda, categoria, notas, pagado_por: pagadoPor || null };
  _guardandoGasto = true;
  setGastoSaveState(true);
  try {
    if(gid) {
      let upd = await supa.patch("gastos", gid, row);
      if(!upd) upd = await supa.patch("gastos", gid, { fecha, usuario, concepto, monto, moneda, notas, pagado_por: pagadoPor || null });
      if(!upd) {
        toast("No se pudo actualizar el gasto", false);
        return;
      }
      setStoredGastoCategory(gid, categoria);
      const i=gastos.findIndex(x=>x.id===parseInt(gid));
      if(i!==-1) {
        gastos[i]=dbGasto(upd);
        gastos[i].categoria = categoria;
      }
      toast("✓ Gasto actualizado");
    } else {
      let cr = await supa.post("gastos", row);
      if(!cr) cr = await supa.post("gastos", { fecha, usuario, concepto, monto, moneda, notas, pagado_por: pagadoPor || null });
      if(!cr) {
        toast("No se pudo registrar el gasto", false);
        return;
      }
      setStoredGastoCategory(cr.id, categoria);
      const gasto = dbGasto(cr);
      gasto.categoria = categoria;
      gastos.push(gasto);
      toast("✓ Gasto registrado");
    }
    closeModal("modalGasto");
    renderGastos();
  } finally {
    _guardandoGasto = false;
    setGastoSaveState(false);
  }
}

async function eliminarGasto(id) {
  if(!confirm("¿Eliminar este gasto?")) return;
  await supa.del("gastos", id);
  gastos = gastos.filter(g => g.id !== id);
  renderGastos();
  toast("✓ Gasto eliminado");
}

function verCierreGastos(id) {
  const cierre = gastoClosures.find(c => c.id === id);
  if(!cierre) return;
  const detailTable = buildGastosTableHTML(cierre.summary?.lista || [], { interactive: false, showActions: false, sortable: false });
  mostrarDialogoSalida(
    `Cierre ${fmt(cierre.desde)} → ${fmt(cierre.hasta)}`,
    `<div style="font-size:0.76rem;color:var(--text3);margin-bottom:12px">Último guardado: ${fmt(cierre.fechaCierre)} · ${cierre.reset ? "reiniciado" : "sin reiniciar"}</div>
    ${buildGastosSummaryHTML(cierre.summary || getGastosSummaryData([]))}
    <div style="margin-top:14px">
      <div style="font-size:0.68rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Detalle del período</div>
      ${detailTable}
    </div>`,
    [
      { label: "Cerrar", action: () => {} },
      { label: "Exportar .xls", action: () => exportGastoClosureXls(id) }
    ],
    { maxWidth: 1080, width: "96%", maxHeight: "90vh" }
  );
}
function buildGastoClosureExportHTML(cierre) {
  const summary = cierre.summary || getGastosSummaryData([]);
  const resumenRows = summary.usrs.map(u => {
    const debe = Object.entries(summary.deudas[u] || {}).map(([acreedor, montos]) => {
      const parts = [];
      if(montos.ARS > 0) parts.push(`ARS ${Number(montos.ARS).toLocaleString("es-AR")}`);
      if(montos.USD > 0) parts.push(`USD ${Number(montos.USD).toLocaleString("es-AR")}`);
      return parts.length ? `Debe a ${acreedor}: ${parts.join(" + ")}` : "";
    }).filter(Boolean).join(" | ");
    const leDeben = summary.usrs.filter(o => o !== u).map(o => {
      const deuda = summary.deudas[o]?.[u] || { ARS: 0, USD: 0 };
      const parts = [];
      if(deuda.ARS > 0) parts.push(`ARS ${Number(deuda.ARS).toLocaleString("es-AR")}`);
      if(deuda.USD > 0) parts.push(`USD ${Number(deuda.USD).toLocaleString("es-AR")}`);
      return parts.length ? `${o} le debe ${parts.join(" + ")}` : "";
    }).filter(Boolean).join(" | ");
    return `<tr>
      <td>${u}</td>
      <td>${summary.totalGasto[u]?.ARS || 0}</td>
      <td>${summary.totalGasto[u]?.USD || 0}</td>
      <td>${debe}</td>
      <td>${leDeben}</td>
    </tr>`;
  }).join("");
  const detalleRows = (summary.lista || []).map(g => `<tr>
      <td>${fmt(parseDate(g.fecha))}</td>
      <td>${g.usuario || "Sin asignar"}</td>
      <td>${resolveGastoTypeName(g.categoria, DEFAULT_GASTO_TYPE_FALLBACK)}</td>
      <td>${g.concepto || ""}</td>
      <td>${g.notas || ""}</td>
      <td>${g.moneda === "USD" ? "USD" : "ARS"}</td>
      <td>${Number(g.monto) || 0}</td>
      <td>${g.pagadoPor || g.usuario || ""}</td>
    </tr>`).join("");
  return `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: Arial, sans-serif; padding: 18px; }
      h1, h2 { margin: 0 0 10px; }
      .meta { margin-bottom: 18px; color: #444; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 18px; }
      th, td { border: 1px solid #cfcfcf; padding: 8px; text-align: left; vertical-align: top; }
      th { background: #f4f4f4; }
    </style>
  </head>
  <body>
    <h1>Cierre ${fmt(cierre.desde)} - ${fmt(cierre.hasta)}</h1>
    <div class="meta">Guardado: ${fmt(cierre.fechaCierre)} | Registros: ${cierre.cantidadGastos}</div>
    <table>
      <thead>
        <tr>
          <th>Usuario</th>
          <th>Pagó ARS</th>
          <th>Pagó USD</th>
          <th>Debe</th>
          <th>Le deben</th>
        </tr>
      </thead>
      <tbody>${resumenRows}</tbody>
    </table>
    <table>
      <thead>
        <tr>
          <th>Deuda total ARS</th>
          <th>Deuda total USD</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${summary.debtTotals.ARS || 0}</td>
          <td>${summary.debtTotals.USD || 0}</td>
        </tr>
      </tbody>
    </table>
    <h2>Detalle del período</h2>
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Usuario</th>
          <th>Categoría</th>
          <th>Concepto</th>
          <th>Notas</th>
          <th>Moneda</th>
          <th>Monto</th>
          <th>Pagó</th>
        </tr>
      </thead>
      <tbody>${detalleRows}</tbody>
    </table>
  </body>
  </html>`;
}
function exportGastoClosureXls(id) {
  const cierre = gastoClosures.find(c => c.id === id);
  if(!cierre) {
    toast("No se encontró el cierre para exportar", false);
    return;
  }
  const blob = new Blob(["\ufeff", buildGastoClosureExportHTML(cierre)], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cierre-gastos-${cierre.desde}-${cierre.hasta}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function getLastGastoClosure() {
  return gastoClosures.length ? gastoClosures[0] : null;
}
function buildNextClosureRangeDefaults() {
  const last = getLastGastoClosure();
  const todayIso = new Date().toISOString().slice(0,10);
  if(!last?.hasta) return { desde: todayIso, hasta: todayIso };
  const next = parseDate(last.hasta);
  next.setDate(next.getDate() + 1);
  const nextIso = next.toISOString().slice(0,10);
  return { desde: nextIso, hasta: todayIso };
}
function saveGastoClosureRecord({ desde, hasta, summary, reset }) {
  const now = new Date();
  const fechaCierre = now.toISOString().slice(0,10);
  const record = {
    id: `cierre_${now.getTime()}`,
    creadoEn: now.toISOString(),
    fechaCierre,
    desde,
    hasta,
    reset: !!reset,
    cantidadGastos: summary.lista.length,
    summary
  };
  gastoClosures = [record, ...gastoClosures].slice(0, 100);
  setStoredGastoClosures(gastoClosures);
  return record;
}
function abrirCierreGastos() {
  const last = getLastGastoClosure();
  const defaults = buildNextClosureRangeDefaults();
  mostrarDialogoSalida(
    "Cierre mensual",
    `<div style="display:flex;flex-direction:column;gap:12px">
      <div style="font-size:0.8rem;color:var(--text2)">Último cierre: <strong>${last ? fmt(last.fechaCierre) : "sin cierres previos"}</strong></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <div class="form-label">Desde</div>
          <input id="dlg_cierre_desde" class="form-input" type="date" value="${defaults.desde}">
        </div>
        <div>
          <div class="form-label">Hasta</div>
          <input id="dlg_cierre_hasta" class="form-input" type="date" value="${defaults.hasta}">
        </div>
      </div>
    </div>`,
    [
      { label: "Cancelar", action: () => {} },
      { label: "Ver resumen", action: async () => {
        const d = window._dlgData || {};
        const desde = d.dlg_cierre_desde || defaults.desde;
        const hasta = d.dlg_cierre_hasta || defaults.hasta;
        if(!desde || !hasta) { toast("⚠️ Completá ambas fechas", false); return; }
        if(desde > hasta) { toast("⚠️ La fecha desde no puede ser mayor a la fecha hasta", false); return; }
        const periodo = gastos.filter(g => g.fecha >= desde && g.fecha <= hasta);
        const summary = getGastosSummaryData(periodo);
        const detailTable = buildGastosTableHTML(summary.lista || [], { interactive: false, showActions: false, sortable: false });
        mostrarDialogoSalida(
          `Resumen ${fmt(desde)} → ${fmt(hasta)}`,
          `<div style="font-size:0.78rem;color:var(--text2);margin-bottom:12px">Período seleccionado: <strong>${fmt(desde)}</strong> a <strong>${fmt(hasta)}</strong></div>
          ${buildGastosSummaryHTML(summary)}
          <div style="margin-top:14px">
            <div style="font-size:0.68rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Detalle del período</div>
            ${detailTable}
          </div>`,
          [
            { label: "Volver", action: () => abrirCierreGastos() },
            { label: "Guardar sin reiniciar", action: () => {
              const rec = saveGastoClosureRecord({ desde, hasta, summary, reset: false });
              renderGastos();
              toast("✓ Cierre guardado en historial");
              logAccion("Cierre de gastos guardado", `${fmt(desde)} → ${fmt(hasta)} · ${rec.cantidadGastos} gastos`);
            }},
            { label: "Guardar y reiniciar", action: () => {
              mostrarDialogoSalida(
                "¿Volver el flujo a cero?",
                "Se va a guardar el cierre en historial y se eliminarán de la lista actual los gastos dentro de ese período.",
                [
                  { label: "No", action: () => {} },
                  { label: "Sí, reiniciar", action: async () => {
                    const rec = saveGastoClosureRecord({ desde, hasta, summary, reset: true });
                    const ids = periodo.map(g => g.id).filter(Boolean);
                    for(const id of ids) {
                      await supa.del("gastos", id);
                    }
                    gastos = gastos.filter(g => !(g.fecha >= desde && g.fecha <= hasta));
                    renderGastos();
                    toast("✓ Cierre guardado y flujo reiniciado");
                    logAccion("Cierre de gastos reiniciado", `${fmt(desde)} → ${fmt(hasta)} · ${rec.cantidadGastos} gastos`);
                  }}
                ]
              );
            }}
          ],
          { maxWidth: 1080, width: "96%", maxHeight: "90vh" }
        );
      }}
    ]
  );
}

// ─── AGENDA DE CLIENTES ───────────────────────────────────
function abrirAgendaClientes() {
  // Auto-import from reservas: build unique clients by phone
  reservas.concat(historial).forEach(r => {
    if(!r.contacto) return;
    const existe = clientes.find(c => c.telefono === r.contacto);
    if(!existe) {
      clientes.push({ id: nextClienteId++, nombre: r.huesped, telefono: r.contacto });
    }
  });
  renderAgendaClientesModal();
  openModal("modalAgendaClientes");
}

function getReservaClienteSuggestions() {
  const pool = [];
  const seen = new Set();
  clientes.forEach(c => {
    const key = `${(c.nombre || "").trim().toLowerCase()}|${(c.telefono || "").trim()}`;
    if(!c.nombre || seen.has(key)) return;
    seen.add(key);
    pool.push({ nombre: c.nombre, telefono: c.telefono || "", nacionalidad: "" });
  });
  reservas.concat(historial).forEach(r => {
    const nombre = (r.huesped || "").trim();
    const telefono = (r.contacto || "").trim();
    const nacionalidad = (r.nacionalidad || "").trim();
    const key = `${nombre.toLowerCase()}|${telefono}`;
    if(!nombre || seen.has(key)) return;
    seen.add(key);
    pool.push({ nombre, telefono, nacionalidad });
  });
  return pool.sort((a,b) => a.nombre.localeCompare(b.nombre, "es"));
}
function normalizePhoneLookup(raw) {
  return String(raw || "").replace(/\D/g, "");
}
function fillReservaClienteFields(data = {}, options = {}) {
  const {
    overwriteNombre = true,
    overwriteTelefono = true,
    overwriteNacionalidad = true
  } = options;
  const nombreEl = document.getElementById("r_huesped");
  const telEl = document.getElementById("r_contacto");
  const nacEl = document.getElementById("r_nacionalidad");
  if(nombreEl && overwriteNombre) nombreEl.value = data.nombre || "";
  if(telEl && overwriteTelefono) telEl.value = data.telefono || "";
  if(nacEl && overwriteNacionalidad) nacEl.value = data.nacionalidad || "";
}

function renderReservaClienteSuggestions(query) {
  const wrap = document.getElementById("r_huesped_sugerencias");
  const input = document.getElementById("r_huesped");
  if(!wrap || !input) return;
  const q = String(query || "").trim().toLowerCase();
  if(!q) { hideReservaClienteSuggestions(); return; }
  const results = getReservaClienteSuggestions()
    .filter(c => c.nombre.toLowerCase().includes(q))
    .slice(0, 8);
  if(!results.length) { hideReservaClienteSuggestions(); return; }
  window._reservaClienteSuggestions = results;
  wrap.innerHTML = results.map((c, idx) => `
    <button type="button"
      onclick="applyReservaClienteSuggestion(${idx})"
      style="display:flex;width:100%;align-items:flex-start;justify-content:space-between;gap:10px;padding:9px 10px;background:transparent;border:none;border-radius:8px;cursor:pointer;text-align:left;color:var(--text);font-family:'DM Sans',sans-serif;appearance:none;-webkit-appearance:none;box-shadow:none"
      onmouseover="this.style.background='var(--bg3)'"
      onmouseout="this.style.background='transparent'">
      <span style="display:flex;flex-direction:column;gap:2px">
        <span style="font-size:0.84rem;font-weight:600">${c.nombre}</span>
        ${c.telefono ? `<span style="font-size:0.72rem;color:var(--text3)">${fmtTelefono(c.telefono)}</span>` : ""}
      </span>
      ${c.nacionalidad ? `<span style="font-size:0.68rem;color:var(--text3);white-space:nowrap">${c.nacionalidad}</span>` : ""}
    </button>
  `).join("");
  wrap.style.display = "block";
}
function renderReservaClientePhoneSuggestions(query) {
  const wrap = document.getElementById("r_contacto_sugerencias");
  const input = document.getElementById("r_contacto");
  if(!wrap || !input) return;
  const q = normalizePhoneLookup(query);
  if(!q) { hideReservaClienteSuggestions(); return; }
  const results = getReservaClienteSuggestions()
    .filter(c => normalizePhoneLookup(c.telefono).includes(q))
    .slice(0, 8);
  if(!results.length) { hideReservaClienteSuggestions(); return; }
  window._reservaClientePhoneSuggestions = results;
  wrap.innerHTML = results.map((c, idx) => `
    <button type="button"
      onclick="applyReservaClientePhoneSuggestion(${idx})"
      style="display:flex;width:100%;align-items:flex-start;justify-content:space-between;gap:10px;padding:9px 10px;background:transparent;border:none;border-radius:8px;cursor:pointer;text-align:left;color:var(--text);font-family:'DM Sans',sans-serif;appearance:none;-webkit-appearance:none;box-shadow:none"
      onmouseover="this.style.background='var(--bg3)'"
      onmouseout="this.style.background='transparent'">
      <span style="display:flex;flex-direction:column;gap:2px">
        <span style="font-size:0.84rem;font-weight:600">${fmtTelefono(c.telefono || "")}</span>
        <span style="font-size:0.72rem;color:var(--text3)">${c.nombre || "Sin nombre"}</span>
      </span>
      ${c.nacionalidad ? `<span style="font-size:0.68rem;color:var(--text3);white-space:nowrap">${c.nacionalidad}</span>` : ""}
    </button>
  `).join("");
  wrap.style.display = "block";
}

function applyReservaClienteSuggestion(index) {
  const data = window._reservaClienteSuggestions?.[index];
  if(!data) return;
  fillReservaClienteFields(data, {
    overwriteNombre: true,
    overwriteTelefono: true,
    overwriteNacionalidad: true
  });
  hideReservaClienteSuggestions();
}
function applyReservaClientePhoneSuggestion(index) {
  const data = window._reservaClientePhoneSuggestions?.[index];
  if(!data) return;
  fillReservaClienteFields(data, {
    overwriteNombre: true,
    overwriteTelefono: true,
    overwriteNacionalidad: true
  });
  hideReservaClienteSuggestions();
}

function autofillReservaClienteByName(rawName) {
  const q = String(rawName || "").trim().toLowerCase();
  if(!q) return;
  const match = getReservaClienteSuggestions().find(c => c.nombre.trim().toLowerCase() === q);
  if(!match) return;
  fillReservaClienteFields(match, {
    overwriteNombre: true,
    overwriteTelefono: true,
    overwriteNacionalidad: true
  });
}
function autofillReservaClienteByPhone(rawPhone) {
  const q = normalizePhoneLookup(rawPhone);
  if(!q) return;
  const match = getReservaClienteSuggestions().find(c => normalizePhoneLookup(c.telefono) === q);
  if(!match) return;
  fillReservaClienteFields(match, {
    overwriteNombre: true,
    overwriteTelefono: true,
    overwriteNacionalidad: true
  });
}

function hideReservaClienteSuggestions() {
  ["r_huesped_sugerencias", "r_contacto_sugerencias"].forEach(id => {
    const wrap = document.getElementById(id);
    if(wrap) {
      wrap.style.display = "none";
      wrap.innerHTML = "";
    }
  });
  window._reservaClienteSuggestions = [];
  window._reservaClientePhoneSuggestions = [];
}

function renderAgendaClientesModal() {
  const q = (document.getElementById("clienteSearch")?.value || "").toLowerCase();
  let lista = [...clientes].sort((a,b) => a.nombre.localeCompare(b.nombre, "es"));
  if(q) lista = lista.filter(c => c.nombre.toLowerCase().includes(q) || c.telefono.includes(q));

  const countEl = document.getElementById("agendaClientesCount");
  if(countEl) countEl.textContent = `${lista.length} cliente${lista.length !== 1 ? "s" : ""}`;

  const listaEl = document.getElementById("agendaClientesLista");
  if(!listaEl) return;

  if(lista.length === 0) {
    listaEl.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text3);font-size:0.85rem">Sin clientes${q ? " que coincidan" : " aún"}</div>`;
    return;
  }

  listaEl.innerHTML = lista.map(c => {
    const rsCliente   = reservas.filter(r => r.contacto === c.telefono)
      .sort((a,b) => b.desde.localeCompare(a.desde));
    const histCliente = historial.filter(r => r.contacto === c.telefono)
      .sort((a,b) => b.desde.localeCompare(a.desde));
    const total = rsCliente.length + histCliente.length;

    const histHTML = total === 0 ? "" : `
      <details style="margin-top:8px">
        <summary style="font-size:0.68rem;color:var(--text3);cursor:pointer;letter-spacing:0.05em;text-transform:uppercase;font-weight:600;display:flex;align-items:center;gap:4px;list-style:none">
          <span style="transition:transform 0.15s;display:inline-block">▶</span> ${total} reserva${total!==1?"s":""}
        </summary>
        <div style="margin-top:8px;display:flex;flex-direction:column;gap:5px">
          ${rsCliente.map(r => {
            const a = aptos.find(x => x.id === r.aptoId);
            return `<div style="font-size:0.75rem;padding:7px 10px;background:var(--bg3);border-radius:7px;display:flex;gap:8px;align-items:center">
              <span style="width:7px;height:7px;border-radius:50%;background:${reservaColor(r.estado)};flex-shrink:0"></span>
              <span style="flex:1;color:var(--text2)">${a?a.nombre:"?"} · ${fmt(r.desde)} → ${fmt(r.hasta)}</span>
              <span style="color:var(--text3)">${r.monto<5000?"USD":"$"} ${r.monto.toLocaleString()}</span>
            </div>`;
          }).join("")}
          ${histCliente.map(r => {
            const a = aptos.find(x => x.id === r.aptoId);
            return `<div style="font-size:0.75rem;padding:7px 10px;background:var(--bg3);border-radius:7px;display:flex;gap:8px;align-items:center;opacity:0.7">
              <span style="width:7px;height:7px;border-radius:50%;background:var(--text3);flex-shrink:0"></span>
              <span style="flex:1;color:var(--text3)">${a?a.nombre:"?"} · ${fmt(r.desde)} → ${fmt(r.hasta)} · <em>finalizada</em></span>
              <span style="color:var(--text3)">${r.monto<5000?"USD":"$"} ${r.monto.toLocaleString()}</span>
            </div>`;
          }).join("")}
        </div>
      </details>`;

    return `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:0.9rem;font-weight:700;color:var(--text3);flex-shrink:0">${c.nombre.charAt(0).toUpperCase()}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:0.9rem;color:var(--text)">${c.nombre}</div>
            <div style="font-size:0.75rem;color:var(--text3);display:flex;gap:10px;margin-top:2px;flex-wrap:wrap">
              <span>📱 ${c.telefono}</span>
              ${total > 0 ? `<span style="color:var(--gold)">🗓 ${total} reserva${total!==1?"s":""}</span>` : ""}
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button onclick="abrirWADirecto('${c.telefono}')" title="WhatsApp"
              style="background:none;border:none;cursor:pointer;padding:4px;opacity:0.7;transition:opacity 0.15s" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.524 5.855L0 24l6.29-1.507A11.946 11.946 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.369l-.36-.213-3.733.894.944-3.643-.235-.374A9.818 9.818 0 1 1 12 21.818z"/></svg>
            </button>
            <button onclick="editarCliente(${c.id})" title="Editar"
              style="background:none;border:none;cursor:pointer;padding:4px;color:var(--text3);font-size:1rem;opacity:0.7;transition:opacity 0.15s" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">✎</button>
            <button onclick="eliminarCliente(${c.id})" title="Eliminar"
              style="background:none;border:none;cursor:pointer;padding:4px;color:var(--text3);font-size:0.85rem;opacity:0.7;transition:opacity 0.15s" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">✕</button>
          </div>
        </div>
        ${histHTML}
      </div>`;
  }).join("");
}

function abrirFormCliente(c = null) {
  document.getElementById("cli_id").value = c ? c.id : "";
  document.getElementById("cli_nombre").value = c ? c.nombre : "";
  document.getElementById("cli_telefono").value = c ? c.telefono : "";
  document.getElementById("formClienteTitulo").textContent = c ? "Editar Cliente" : "Nuevo Cliente";
  document.getElementById("formClienteInline").style.display = "block";
  document.getElementById("cli_nombre").focus();
}

function cancelarFormCliente() {
  document.getElementById("formClienteInline").style.display = "none";
  ["cli_id","cli_nombre","cli_telefono"].forEach(id => document.getElementById(id).value = "");
}

function guardarCliente() {
  const id     = document.getElementById("cli_id").value;
  const nombre = document.getElementById("cli_nombre").value.trim();
  const tel    = document.getElementById("cli_telefono").value.trim();
  if(!nombre || !tel) { toast("⚠️ Completá nombre y teléfono", false); return; }
  if(id) {
    const c = clientes.find(x => x.id === parseInt(id));
    if(c) { c.nombre = nombre; c.telefono = tel; }
    toast("✓ Cliente actualizado");
  } else {
    clientes.push({ id: nextClienteId++, nombre, telefono: tel });
    toast("✓ Cliente agregado");
  }
  cancelarFormCliente();
  renderAgendaClientesModal();
}

function editarCliente(id) {
  const c = clientes.find(x => x.id === id);
  if(c) abrirFormCliente(c);
}

function eliminarCliente(id) {
  if(!confirm("¿Eliminar este cliente?")) return;
  clientes = clientes.filter(c => c.id !== id);
  renderAgendaClientesModal();
  toast("✓ Cliente eliminado");
}

let _renderTimer = null;
let _lastRenderedPage = null; // cache para evitar re-renders innecesarios
// ─── ESC KEY HANDLER ──────────────────────────────────────
// useCapture:true so we intercept BEFORE blur fires on focused inputs
document.addEventListener("keydown", e => {
  if(e.key !== "Escape") return;

  // Close dropdowns/popovers first
  if(document.getElementById("_sdrop_portal")) { document.getElementById("_sdrop_portal").remove(); e.preventDefault(); return; }
  if(document.getElementById("apto_portal")) { document.getElementById("apto_portal").remove(); e.preventDefault(); return; }
  if(document.getElementById("pais_portal")) { cerrarPaisDropdown(); e.preventDefault(); return; }
  if(document.getElementById("pagoPopover") || document.getElementById("pagoPopoverBackdrop")) { cerrarPopover(); e.preventDefault(); return; }
  if(document.getElementById("dialogoSalida")) { document.getElementById("dialogoSalida").remove(); e.preventDefault(); return; }

  // Find which modal is open
  const openModal = [...document.querySelectorAll(".modal-overlay.open")]
    .find(m => m.id !== "modalLogin");
  if(!openModal) return;

  e.preventDefault(); // stop blur from firing on focused input

  const id = openModal.id;

  if(id === "modalDetalle") {
    const rid = parseInt(openModal.dataset.reservaId || "0");
    mostrarDialogoSalida(
      "¿Descartar cambios?",
      "Si descartás, los cambios que hiciste no se guardarán.",
      [
        { label: "Volver", action: () => {} },
        { label: "Descartar", action: async () => {
          if(rid) {
            const fresh = await supa.get("reservas", `id=eq.${rid}`);
            if(fresh?.[0]) { const idx = reservas.findIndex(x => x.id === rid); if(idx !== -1) reservas[idx] = dbRes(fresh[0]); }
          }
          _detalleSnapshot = null; closeModal("modalDetalle"); render();
        }}
      ]
    );
    return;
  }

  if(id === "modalReserva") { intentarCerrarReserva(); return; }
  if(id === "modalGasto")   { intentarCerrarGasto();   return; }
  if(id === "modalApto")    { intentarCerrarApto();    return; }

  // Generic: ask confirm before closing
  const hasInputs = openModal.querySelectorAll("input:not([type=hidden]):not([type=color]), textarea, select").length > 0;
  if(hasInputs) {
    mostrarDialogoSalida(
      "¿Cerrar?",
      "¿Querés cerrar este panel?",
      [
        { label: "Cancelar", action: () => {} },
        { label: "Cerrar", action: () => openModal.classList.remove("open") }
      ]
    );
  } else {
    openModal.classList.remove("open");
  }
}, true); // <-- useCapture so it runs before blur

// ─── RESERVAS TEMPORALES ──────────────────────────────────
// Stored in memory (and Supabase via reservas table with apto_id = null or TEMP apto)
function getReservasTemp() {
  return reservas.filter(r => {
    const aptoId = r.aptoId;
    const sinDepto = aptoId === null || aptoId === undefined || aptoId === 0 || aptoId === "0" || aptoId === "" || r._temp === true;
    return sinDepto && r.estado !== "cancelada";
  });
}

let _tempDragId = null;

function tempDragStart(event, id) {
  _tempDragId = id;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", "temp:" + id);
}

async function dropTempOnApto(event, aptoId) {
  event.preventDefault();
  event.stopPropagation();
  const data = event.dataTransfer.getData("text/plain");
  if(!data.startsWith("temp:")) return;
  const id = parseInt(data.replace("temp:",""));
  const r = reservas.find(x => x.id === id);
  if(!r) return;
  r.aptoId = aptoId;
  r._temp = false;
  await supa.patch("reservas", id, { apto_id: aptoId });
  actualizarTempBadge();
  // Remove drop highlight
  event.currentTarget.style.outline = "";
  renderTemp();
  render(aptoId);
  toast(`✓ ${r.huesped} asignado a ${aptos.find(x=>x.id===aptoId)?.nombre}`);
  logAccion("Reserva temporal asignada (drag)", `${r.huesped} → ${aptos.find(x=>x.id===aptoId)?.nombre}`);
  _tempDragId = null;
}

function tempDragOver(event, aptoId) {
  if(!_tempDragId) return;
  event.preventDefault();
  event.currentTarget.style.outline = "2px solid var(--orange)";
}

function tempDragLeaveCard(event) {
  event.currentTarget.style.outline = "";
}

function actualizarTempBadge() {
  const n = getReservasTemp().length;
  const badge = document.getElementById("tempBadge");
  if(!badge) return;
  if(n > 0) { badge.textContent = n; badge.style.display = "inline"; }
  else badge.style.display = "none";
}

function nuevaReservaTemporal() {
  nuevaReservaParaApto(0, true);
}

// Estado de ordenamiento de la grilla asignadas
var _asigSort = { campo: 'desde', dir: 'asc' };
var _tempSort = { campo: 'desde', dir: 'asc' };

function sortTemp(campo) {
  if(_tempSort.campo === campo) {
    _tempSort.dir = _tempSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    _tempSort.campo = campo;
    _tempSort.dir = 'asc';
  }
  _renderTempTablas();
}

function sortAsig(campo) {
  if(_asigSort.campo === campo) {
    _asigSort.dir = _asigSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    _asigSort.campo = campo;
    _asigSort.dir = 'asc';
  }
  renderTemp();
}

function buscarLibres() {
  const desde = document.getElementById("libresDesde")?.value;
  const hasta  = document.getElementById("libresHasta")?.value;
  const el = document.getElementById("libresResultado");
  if(!el) return;
  if(!desde || !hasta) { el.innerHTML = '<div style="color:var(--red);font-size:0.82rem">Ingresá ambas fechas.</div>'; return; }
  if(hasta <= desde) { el.innerHTML = '<div style="color:var(--red);font-size:0.82rem">La salida debe ser posterior al ingreso.</div>'; return; }

  const dDesde = parseDate(desde), dHasta = parseDate(hasta);
  const noches = diffDays(desde, hasta);

  const libres = aptos.filter(a =>
    !reservas.some(r => r.aptoId === a.id && r.estado !== "cancelada" &&
      parseDate(r.desde) < dHasta && parseDate(r.hasta) > dDesde)
  );

  if(libres.length === 0) {
    el.innerHTML = '<div style="color:var(--text3);font-size:0.82rem;padding:8px 0">No hay departamentos libres para esas fechas.</div>';
    return;
  }

  const cards = libres.map(a => {
    const prev = reservas.filter(r => r.aptoId === a.id && r.estado !== "cancelada" && r.hasta <= desde)
      .sort((x,y) => y.hasta.localeCompare(x.hasta))[0];
    const next = reservas.filter(r => r.aptoId === a.id && r.estado !== "cancelada" && r.desde >= hasta)
      .sort((x,y) => x.desde.localeCompare(y.desde))[0];
    const prevMatch = prev && prev.hasta === desde;
    const nextMatch = next && next.desde === hasta;
    let info = '';
    if(prevMatch) info += `<div style="font-size:0.7rem;color:var(--green);margin-top:3px">✓ Sale el ${fmtShort(prev.hasta)} (${prev.huesped})</div>`;
    else if(prev)  info += `<div style="font-size:0.7rem;color:var(--text3);margin-top:3px">Anterior sale: ${fmtShort(prev.hasta)}</div>`;
    if(nextMatch)  info += `<div style="font-size:0.7rem;color:var(--green);margin-top:2px">✓ Entra el ${fmtShort(next.desde)} (${next.huesped})</div>`;
    else if(next)  info += `<div style="font-size:0.7rem;color:var(--text3);margin-top:2px">Siguiente entra: ${fmtShort(next.desde)}</div>`;
    const border = (prevMatch || nextMatch) ? 'var(--green)' : 'var(--border)';
    return `<div style="padding:8px 12px;background:var(--bg2);border:1px solid ${border};border-radius:8px;min-width:150px">
      <div style="font-weight:700;color:var(--green);font-size:0.88rem">${a.nombre}${a.encargado?` <span style="font-weight:400;color:var(--text3);font-size:0.75rem">· ${a.encargado}</span>`:''}</div>
      ${info}
    </div>`;
  }).join('');

  el.innerHTML = `<div style="font-size:0.75rem;color:var(--green);font-weight:700;margin-bottom:8px">${libres.length} depto${libres.length!==1?'s':''} libre${libres.length!==1?'s':''} · ${noches} noche${noches!==1?'s':''}</div><div style="display:flex;flex-wrap:wrap;gap:8px">${cards}</div>`;
}

function toggleHoyPanel() {
  const p = document.getElementById('hoyPanel');
  if(!p) return;
  const showing = p.style.display !== 'none';
  p.style.display = showing ? 'none' : 'block';
  if(!showing) {
    // Set default date to today
    const t = new Date();
    const pad = n => String(n).padStart(2,'0');
    const todayIso = `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}`;
    const inp = document.getElementById('hoyFecha');
    if(inp && !inp.value) inp.value = todayIso;
    buscarLibresHoy();
  }
}

function buscarLibresHoy() {
  const el = document.getElementById('hoyResultado');
  if(!el) return;
  const t = new Date();
  const pad = n => String(n).padStart(2,'0');
  const defaultIso = `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}`;
  const fecha = document.getElementById('hoyFecha')?.value || defaultIso;
  const hasta = document.getElementById('hoyFechaHasta')?.value || '';

  // If hasta is filled and valid → use range mode (same as buscarLibres)
  if(hasta && hasta > fecha) {
    const dDesde = parseDate(fecha), dHasta = parseDate(hasta);
    const noches = diffDays(fecha, hasta);
    const libres = aptos.filter(a =>
      !reservas.some(r => r.aptoId === a.id && r.estado !== "cancelada" &&
        parseDate(r.desde) < dHasta && parseDate(r.hasta) > dDesde)
    );
    if(libres.length === 0) {
      el.innerHTML = `<div style="color:var(--text3);font-size:0.82rem;padding:8px 0">No hay departamentos libres para esas fechas.</div>`;
      return;
    }
    const cards = libres.map(a => {
      const prev = reservas.filter(r => r.aptoId === a.id && r.estado !== "cancelada" && r.hasta <= fecha)
        .sort((x,y) => y.hasta.localeCompare(x.hasta))[0];
      const next = reservas.filter(r => r.aptoId === a.id && r.estado !== "cancelada" && r.desde >= hasta)
        .sort((x,y) => x.desde.localeCompare(y.desde))[0];
      const prevMatch = prev && prev.hasta === fecha;
      const nextMatch = next && next.desde === hasta;
      let info = '';
      if(prevMatch) info += `<div style="font-size:0.7rem;color:var(--green);margin-top:3px">✓ Sale el ${fmtShort(prev.hasta)} · ${prev.huesped}</div>`;
      else if(prev)  info += `<div style="font-size:0.7rem;color:var(--text3);margin-top:3px">Anterior sale: ${fmtShort(prev.hasta)}</div>`;
      if(nextMatch)  info += `<div style="font-size:0.7rem;color:var(--green);margin-top:2px">✓ Entra el ${fmtShort(next.desde)} · ${next.huesped}</div>`;
      else if(next)  info += `<div style="font-size:0.7rem;color:var(--text3);margin-top:2px">Siguiente entra: ${fmtShort(next.desde)}</div>`;
      const border = (prevMatch || nextMatch) ? 'var(--green)' : 'var(--border2)';
      return `<div style="padding:8px 10px;background:var(--bg2);border:1px solid ${border};border-radius:8px;min-width:140px">
        <div style="font-weight:700;color:#4caf7d;font-size:0.85rem">${a.nombre}${a.encargado?` <span style="font-weight:400;color:var(--text3);font-size:0.72rem">· ${a.encargado}</span>`:''}</div>
        ${info}
      </div>`;
    }).join('');
    el.innerHTML = `<div style="font-size:0.75rem;color:var(--green);font-weight:700;margin-bottom:8px">${libres.length} depto${libres.length!==1?'s':''} libre${libres.length!==1?'s':''} · ${noches} noche${noches!==1?'s':''}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${cards}</div>`;
    return;
  }

  // Single date mode
  const dFecha = parseDate(fecha);
  const libres = aptos.filter(a =>
    !reservas.some(r => r.aptoId === a.id && r.estado !== "cancelada" &&
      parseDate(r.desde) <= dFecha && parseDate(r.hasta) > dFecha)
  );
  const ocupados = aptos.filter(a =>
    reservas.some(r => r.aptoId === a.id && r.estado !== "cancelada" &&
      parseDate(r.desde) <= dFecha && parseDate(r.hasta) > dFecha)
  );

  const chips = (arr, color, bgColor, borderColor) => arr.map(a => {
    const activa = reservas.find(r => r.aptoId === a.id && r.estado !== "cancelada" &&
      parseDate(r.desde) <= dFecha && parseDate(r.hasta) > dFecha);
    const next = reservas.filter(r => r.aptoId === a.id && r.estado !== "cancelada" && r.desde > fecha)
      .sort((x,y) => x.desde.localeCompare(y.desde))[0];
    let sub = '';
    if(activa) sub = `<div style="font-size:0.68rem;color:${color};opacity:0.8;margin-top:2px">${activa.huesped} · OUT ${fmtShort(activa.hasta)}</div>`;
    else if(next) sub = `<div style="font-size:0.68rem;color:var(--text3);margin-top:2px">Próx: ${fmtShort(next.desde)}</div>`;
    return `<div style="padding:7px 10px;background:${bgColor};border:1px solid ${borderColor};border-radius:8px">
      <div style="font-size:0.82rem;font-weight:700;color:${color}">${a.nombre}${a.encargado?` <span style="font-size:0.7rem;font-weight:400;color:var(--text3)">· ${a.encargado}</span>`:''}</div>
      ${sub}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="margin-bottom:8px;font-size:0.72rem;font-weight:700;color:var(--text3)">
      ${fmtShort(fecha)} — <span style="color:#4caf7d">${libres.length} libres</span> · <span style="color:var(--red)">${ocupados.length} ocupados</span>
    </div>
    ${libres.length ? `<div style="margin-bottom:6px;font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#4caf7d">Libres</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${chips(libres,'#4caf7d','rgba(61,158,106,0.08)','rgba(61,158,106,0.25)')}</div>` : ''}
    ${ocupados.length ? `<div style="margin-bottom:6px;font-size:0.65rem;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:var(--red)">Ocupados</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">${chips(ocupados,'var(--text2)','var(--bg2)','var(--border)')}</div>` : ''}`;
}

function buscarLibresParaReserva(desde, hasta) {
  const noches = diffDays(desde, hasta);
  const dDesde = parseDate(desde), dHasta = parseDate(hasta);

  const libres = aptos.filter(a =>
    !reservas.some(r => r.aptoId === a.id && r.estado !== "cancelada" &&
      parseDate(r.desde) < dHasta && parseDate(r.hasta) > dDesde)
  );

  const cards = libres.map(a => {
    const prev = reservas.filter(r => r.aptoId === a.id && r.estado !== "cancelada" && r.hasta <= desde)
      .sort((x,y) => y.hasta.localeCompare(x.hasta))[0];
    const next = reservas.filter(r => r.aptoId === a.id && r.estado !== "cancelada" && r.desde >= hasta)
      .sort((x,y) => x.desde.localeCompare(y.desde))[0];
    const prevMatch = prev && prev.hasta === desde;
    const nextMatch = next && next.desde === hasta;
    let info = '';
    if(prevMatch) info += `<div style="font-size:0.7rem;color:var(--green);margin-top:3px">✓ Sale el ${fmtShort(prev.hasta)} · ${prev.huesped}</div>`;
    else if(prev)  info += `<div style="font-size:0.7rem;color:var(--text3);margin-top:3px">Anterior sale: ${fmtShort(prev.hasta)}</div>`;
    if(nextMatch)  info += `<div style="font-size:0.7rem;color:var(--green);margin-top:2px">✓ Entra el ${fmtShort(next.desde)} · ${next.huesped}</div>`;
    else if(next)  info += `<div style="font-size:0.7rem;color:var(--text3);margin-top:2px">Siguiente entra: ${fmtShort(next.desde)}</div>`;
    const border = (prevMatch || nextMatch) ? 'var(--green)' : 'var(--border2)';
    return `<div style="padding:10px 12px;background:var(--bg2);border:1px solid ${border};border-radius:8px;min-width:160px;flex:0 0 auto">
      <div style="font-weight:700;color:var(--green);font-size:0.88rem">${a.nombre}${a.encargado ? ` <span style="font-weight:400;color:var(--text3);font-size:0.75rem">· ${a.encargado}</span>` : ''}</div>
      ${info}
    </div>`;
  }).join('');

  const resumenHTML = libres.length === 0
    ? `<div style="text-align:center;padding:24px;color:var(--text3);font-size:0.85rem">No hay departamentos libres para esas fechas.</div>`
    : `<div style="font-size:0.75rem;color:var(--green);font-weight:700;margin-bottom:10px">${libres.length} depto${libres.length!==1?'s':''} libre${libres.length!==1?'s':''} · ${noches} noche${noches!==1?'s':''}</div>
       <div style="display:flex;flex-wrap:wrap;gap:8px">${cards}</div>`;

  mostrarDialogoSalida(
    `Libres del ${fmtShort(desde)} al ${fmtShort(hasta)}`,
    `<div style="margin-bottom:12px;display:flex;gap:16px;font-size:0.82rem;color:var(--text3)">
      <span>📅 Ingreso: <b style="color:var(--text)">${fmtShort(desde)}</b></span>
      <span>📅 Salida: <b style="color:var(--text)">${fmtShort(hasta)}</b></span>
      <span>🌙 ${noches} noche${noches!==1?'s':''}</span>
    </div>
    ${resumenHTML}`,
    [{ label: "Cerrar", action: () => {} }],
    { maxWidth: 600, width: "92vw", buttonJustify: "center" }
  );
}

var _tempReservaDe = '';

function renderTemp() {
  actualizarTempBadge();
  var el = document.getElementById("tempLista");
  var toolbar = document.getElementById("tempToolbar");
  if(!el) return;
  // Build toolbar only once
  if(!document.getElementById('tempBuscar')) {
    var reservaDeOpts = '<option value="">Todos</option>' + usuarios.map(function(u){ return '<option value="'+u.nombre+'">'+u.nombre+'</option>'; }).join('');
    var toolbarHTML =
      '<div style="display:flex;align-items:center;gap:7px;flex-wrap:nowrap;overflow-x:auto">'
      + '<div style="position:relative;flex:1;min-width:100px">'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--text3);pointer-events:none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
      + '<input id="tempBuscar" type="text" placeholder="Buscar…" style="width:100%;padding:7px 28px 7px 28px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:\'DM Sans\',sans-serif;font-size:0.82rem;outline:none">'
      + '<button id="tempBuscarX" onclick="document.getElementById(\'tempBuscar\').value=\'\';_renderTempTablas();this.style.display=\'none\'" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text3);font-size:0.78rem;padding:2px;line-height:1;display:none" title="Limpiar">✕</button>'
      + '</div>'
      + '<select id="tempReservaDe" style="flex-shrink:0;padding:7px 10px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:\'DM Sans\',sans-serif;font-size:0.82rem;outline:none;width:auto">'+reservaDeOpts+'</select>'
      + '<div style="width:1px;height:18px;background:var(--border2);flex-shrink:0"></div>'
      + '<button class="btn btn-ghost btn-sm" onclick="abrirPendientes()" style="flex-shrink:0;display:flex;align-items:center;gap:5px;font-size:0.78rem;white-space:nowrap" title="Pendientes">'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Pend.</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="toggleHoyPanel()" style="flex-shrink:0;display:flex;align-items:center;gap:5px;font-size:0.78rem;white-space:nowrap;color:#4caf7d;border-color:rgba(61,158,106,0.28);background:rgba(61,158,106,0.08)" title="Libres por fecha">'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Libres</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="openModal(\'modalBooking\')" style="flex-shrink:0;display:flex;align-items:center;gap:5px;font-size:0.78rem;white-space:nowrap;color:#b07ee8;border-color:rgba(146,95,224,0.28);background:rgba(146,95,224,0.08)">'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>Booking</button>'
      + '<button class="btn btn-gold btn-sm" onclick="nuevaReservaParaApto(0,true)" style="flex-shrink:0;white-space:nowrap;font-size:0.78rem">+ Nueva</button>'
      + '</div>';
    if(toolbar) toolbar.innerHTML = toolbarHTML;
    el.innerHTML =
      '<div id="hoyPanel" style="display:none;background:var(--bg3);border:1px solid rgba(61,158,106,0.25);border-radius:12px;padding:12px 14px;margin-bottom:14px;position:relative">'
      + '<button onclick="document.getElementById(\'hoyPanel\').style.display=\'none\'" style="position:absolute;top:8px;right:10px;background:none;border:none;cursor:pointer;color:var(--text3);font-size:0.85rem;line-height:1;padding:2px 5px" title="Cerrar">✕</button>'
      + '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">'
      + '<div style="display:flex;flex-direction:column;gap:3px"><label style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text3)">Fecha</label><input type="date" id="hoyFecha" class="form-input" style="width:150px;padding:6px 10px;font-size:0.82rem" oninput="buscarLibresHoy()"></div>'
      + '<div style="display:flex;flex-direction:column;gap:3px"><label style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text3)">Hasta (opcional)</label><input type="date" id="hoyFechaHasta" class="form-input" style="width:150px;padding:6px 10px;font-size:0.82rem" oninput="buscarLibresHoy()"></div>'
      + '<button class="btn btn-gold" onclick="buscarLibresHoy()" style="padding:7px 16px;font-size:0.82rem">Ver libres</button>'
      + '</div>'
      + '<div id="hoyResultado" style="margin-top:10px"></div>'
      + '<div style="margin-top:12px;text-align:center"><button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'hoyPanel\').style.display=\'none\'" style="font-size:0.78rem;padding:5px 20px">Cerrar</button></div>'
      + '</div>'
      + '<div id="tempTablas"></div>';
    document.getElementById('tempBuscar').addEventListener('input', function() {
      _renderTempTablas();
      var x = document.getElementById('tempBuscarX');
      if(x) x.style.display = this.value ? 'block' : 'none';
    });
    document.getElementById('tempReservaDe').addEventListener('change', function() { _tempReservaDe = this.value; _renderTempTablas(); });
  }
  _renderTempTablas();
}

function _renderTempTablas() {
  var tablasEl = document.getElementById("tempTablas");
  if(!tablasEl) return;
  var th = 'padding:10px 14px;text-align:left;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text3)';
  var buscarVal = (document.getElementById('tempBuscar')?.value || '').trim().toLowerCase();
  var todayStr = today.toISOString().slice(0,10);
  var tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
  var tomorrowStr = tomorrow.toISOString().slice(0,10);

  function dateColor(val) {
    if(val === todayStr) return 'color:#d4af37;font-weight:700'; // gold/yellow
    if(val === tomorrowStr) return 'color:#925fe0;font-weight:700'; // violet
    return '';
  }

  // ── GRILLA TEMPORALES ──
  var listaTemp = getReservasTemp();
  if(buscarVal) {
    listaTemp = listaTemp.filter(function(r) {
      return [r.huesped, r.contacto, r.notas, r.nacionalidad, r.desde, r.hasta].join(' ').toLowerCase().includes(buscarVal);
    });
  }
  if(_tempReservaDe) {
    listaTemp = listaTemp.filter(function(r){ return (r.reservaDe || r.cobrador || '') === _tempReservaDe; });
  }
  listaTemp = listaTemp.sort(function(a,b){
    var va, vb;
    if(_tempSort.campo === 'huesped')      { va=a.huesped||''; vb=b.huesped||''; }
    else if(_tempSort.campo === 'nacionalidad') { va=a.nacionalidad||''; vb=b.nacionalidad||''; }
    else if(_tempSort.campo === 'desde')   { va=a.desde||''; vb=b.desde||''; }
    else if(_tempSort.campo === 'hasta')   { va=a.hasta||''; vb=b.hasta||''; }
    else if(_tempSort.campo === 'monto')   { va=a.monto||0; vb=b.monto||0; return _tempSort.dir==='asc'?va-vb:vb-va; }
    else if(_tempSort.campo === 'noches')  { va=diffDays(a.desde,a.hasta)||0; vb=diffDays(b.desde,b.hasta)||0; return _tempSort.dir==='asc'?va-vb:vb-va; }
    else if(_tempSort.campo === 'contacto'){ va=a.contacto||''; vb=b.contacto||''; }
    else if(_tempSort.campo === 'cantHuespedes') { va=a.cantHuespedes||0; vb=b.cantHuespedes||0; return _tempSort.dir==='asc'?va-vb:vb-va; }
    else if(_tempSort.campo === 'notas')   { va=a.notas||''; vb=b.notas||''; }
    else { va=a.desde||''; vb=b.desde||''; }
    return _tempSort.dir==='asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  var rowsTemp = '';
  for(var i=0; i<listaTemp.length; i++) {
    var r = listaTemp[i];
    var bg = i%2===0?'var(--bg2)':'var(--card)';
    var noches = diffDays(r.desde, r.hasta);
    var dcDesde = dateColor(r.desde);
    var dcHasta = dateColor(r.hasta);
    rowsTemp += '<tr style="background:'+bg+';border-bottom:1px solid var(--border)">';
    rowsTemp += '<td style="padding:8px 10px"><button class="btn btn-ghost btn-sm" onclick="verDetalle('+r.id+')" style="font-size:0.7rem;padding:4px 8px;white-space:nowrap">🔍 Ver</button></td>';
    rowsTemp += '<td style="padding:6px 8px"><button class="btn btn-ghost btn-sm btn-eliminar-temp" data-rid="'+r.id+'" data-nombre="'+r.huesped.replace(/"/g,'&quot;')+'" style="font-size:0.8rem;padding:3px 8px;color:var(--red);border-color:var(--red-dim);line-height:1" title="Eliminar reserva">✕</button></td>';
    rowsTemp += '<td style="padding:4px 6px"><button class="btn btn-ghost btn-sm" onclick="buscarLibresParaReserva(\''+r.desde+'\',\''+r.hasta+'\')" title="Buscar deptos libres para estas fechas" style="font-size:0.68rem;padding:3px 7px;color:#7ab0eb;border-color:rgba(74,133,190,0.28);background:rgba(74,133,190,0.08);white-space:nowrap"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button></td>';
    rowsTemp += '<td style="padding:4px 6px"><input class="grid-input" data-id="'+r.id+'" data-campo="huesped" value="'+r.huesped.replace(/"/g,'&quot;')+'" oninput="updateReservaDebounced(parseInt(this.dataset.id),this.dataset.campo,this.value)" style="width:140px;font-weight:700"></td>';
    rowsTemp += '<td style="padding:8px 10px" class="td-pais-temp" data-id="'+r.id+'" data-val="'+(r.nacionalidad||'').replace(/"/g,'&quot;')+'"></td>';
    rowsTemp += '<td style="padding:4px 6px"><input class="grid-input" type="date" data-id="'+r.id+'" data-campo="desde" value="'+(r.desde||'')+'" oninput="updateReservaDebounced(parseInt(this.dataset.id),this.dataset.campo,this.value)" style="width:130px;'+(dcDesde||'color:var(--green)')+'"></td>';
    rowsTemp += '<td style="padding:4px 6px"><input class="grid-input" type="date" data-id="'+r.id+'" data-campo="hasta" value="'+(r.hasta||'')+'" oninput="updateReservaDebounced(parseInt(this.dataset.id),this.dataset.campo,this.value)" style="width:130px;'+(dcHasta||'color:var(--red)')+'"></td>';
    rowsTemp += '<td style="padding:4px 6px;text-align:center;font-size:0.8rem;font-weight:700;color:var(--text2)">'+(noches>0?noches+'n':'—')+'</td>';
    rowsTemp += '<td style="padding:4px 6px"><input class="grid-input" type="text" data-id="'+r.id+'" data-campo="monto" value="'+(r.monto?fmtMonto(r.monto):'')+'" onblur="var v=parseMontoInputValue(this.value);updateReservaDebounced(parseInt(this.dataset.id),this.dataset.campo,v);this.value=v?fmtMonto(v):\'\'" style="width:110px;color:var(--gold);font-weight:700" placeholder="U$D / $"></td>';
    var _tn=noches,_tpd=(_tn>0&&r.monto>0)?Math.round(r.monto/_tn):null;
    rowsTemp += '<td style="padding:4px 6px;font-size:0.75rem;color:var(--text3)">'+(_tpd?fmtMonto(_tpd):'—')+'</td>';
    rowsTemp += '<td style="padding:4px 6px"><input class="grid-input" type="number" data-id="'+r.id+'" data-campo="cantHuespedes" value="'+(r.cantHuespedes||'')+'" oninput="updateReservaDebounced(parseInt(this.dataset.id),this.dataset.campo,parseInt(this.value)||0)" style="width:60px;text-align:center"></td>';
    rowsTemp += '<td style="padding:4px 6px"><button class="btn btn-gold btn-sm btn-asignar-temp" data-rid="'+r.id+'" style="font-size:0.72rem;padding:5px 12px">📌 Asignar</button></td>';
    var telTempVal = (r.contacto||'');
    if(telTempVal && !telTempVal.startsWith('+')) telTempVal = '+' + telTempVal;
    rowsTemp += '<td style="padding:4px 6px"><div style="display:flex;align-items:center;gap:4px">'
      + (r.contacto ? '<button onclick="abrirWADirecto(\''+r.contacto.replace(/'/g,"\\'")+'\')" style="background:none;border:none;cursor:pointer;padding:0;flex-shrink:0;display:flex;align-items:center" title="WhatsApp"><svg width="13" height="13" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.524 5.855L0 24l6.29-1.507A11.946 11.946 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.369l-.36-.213-3.733.894.944-3.643-.235-.374A9.818 9.818 0 1 1 12 21.818z"/></svg></button>' : '')
      + '<input class="grid-input" data-id="'+r.id+'" data-campo="contacto" value="'+telTempVal.replace(/"/g,'&quot;')+'" oninput="if(this.value&&!this.value.startsWith(\'+\'))this.value=\'+\'+this.value;updateReservaDebounced(parseInt(this.dataset.id),this.dataset.campo,this.value)" style="min-width:0;flex:1">'
      + '</div></td>';
    rowsTemp += '<td style="padding:4px 6px"><input class="grid-input" data-id="'+r.id+'" data-campo="notas" value="'+(r.notas||'').replace(/"/g,'&quot;')+'" oninput="updateReservaDebounced(parseInt(this.dataset.id),this.dataset.campo,this.value)" style="width:110px"></td>';
    rowsTemp += '</tr>';
  }

  function thSort(campo, label, sort) {
    var cls = 'th-sort'+(sort.campo===campo?' '+sort.dir:'');
    var fn = sort === _tempSort ? 'sortTemp' : 'sortAsig';
    return '<th class="'+cls+'" style="'+th+';cursor:pointer" onclick="'+fn+'(\''+campo+'\')" title="Ordenar por '+label+'">'+label+'</th>';
  }

  var gridTemp = listaTemp.length === 0
    ? '<div style="text-align:center;padding:32px;color:var(--text3)">'+(buscarVal?'Sin resultados para "'+buscarVal+'"':'Sin reservas temporales')+'</div>'
    : '<div style="overflow-x:auto;border-radius:12px;border:1px solid var(--border)"><table style="width:100%;border-collapse:collapse;font-size:0.83rem"><thead><tr style="background:var(--bg3);border-bottom:1px solid var(--border)">'
      + '<th style="'+th+'"></th><th style="'+th+'"></th><th style="'+th+'"></th>'
      + thSort('huesped','Nombre',_tempSort)
      + thSort('nacionalidad','Nacionalidad',_tempSort)
      + thSort('desde','Ingreso',_tempSort)
      + thSort('hasta','Salida',_tempSort)
      + thSort('noches','Noches',_tempSort)
      + thSort('monto','Precio',_tempSort)
      + '<th style="'+th+'">$/noche</th>'
      + thSort('cantHuespedes','Huéspedes',_tempSort)
      + '<th style="'+th+'">Asignar</th>'
      + '<th style="'+th+';resize:horizontal;overflow:hidden;min-width:80px" id="thTelTemp">Teléfono</th>'
      + '<th style="'+th+';resize:horizontal;overflow:hidden;min-width:80px" id="thNotasTemp">Comentarios</th>'
      + '</tr></thead><tbody>'+rowsTemp+'</tbody></table></div>';

  // ── GRILLA ASIGNADAS ──
  var listaAsig = reservas.filter(function(r){ return r.aptoId && r.aptoId!==0 && r.estado!=='cancelada'; });
  if(buscarVal) {
    listaAsig = listaAsig.filter(function(r) {
      var aptoNombre = (aptos.find(function(a){return a.id===r.aptoId;})||{}).nombre||'';
      return [r.huesped, r.contacto, r.notas, r.nacionalidad, r.desde, r.hasta, aptoNombre].join(' ').toLowerCase().includes(buscarVal);
    });
  }
  if(_tempReservaDe) {
    listaAsig = listaAsig.filter(function(r){ return (r.reservaDe || r.cobrador || '') === _tempReservaDe; });
  }
  listaAsig = listaAsig.sort(function(a,b){
      var va, vb;
      if(_asigSort.campo === 'huesped')      { va=a.huesped||''; vb=b.huesped||''; }
      else if(_asigSort.campo === 'nacionalidad') { va=a.nacionalidad||''; vb=b.nacionalidad||''; }
      else if(_asigSort.campo === 'desde')   { va=a.desde||''; vb=b.desde||''; }
      else if(_asigSort.campo === 'hasta')   { va=a.hasta||''; vb=b.hasta||''; }
      else if(_asigSort.campo === 'monto')   { va=a.monto||0; vb=b.monto||0; return _asigSort.dir==='asc'?va-vb:vb-va; }
      else if(_asigSort.campo === 'aptoId')  { va=(aptos.find(function(x){return x.id===a.aptoId;})||{}).nombre||''; vb=(aptos.find(function(x){return x.id===b.aptoId;})||{}).nombre||''; }
      else if(_asigSort.campo === 'contacto'){ va=a.contacto||''; vb=b.contacto||''; }
      else if(_asigSort.campo === 'cantHuespedes') { va=a.cantHuespedes||0; vb=b.cantHuespedes||0; return _asigSort.dir==='asc'?va-vb:vb-va; }
      else if(_asigSort.campo === 'notas')   { va=a.notas||''; vb=b.notas||''; }
      else { va=a.desde||''; vb=b.desde||''; }
      return _asigSort.dir==='asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  var rowsAsig = '';
  for(var j=0; j<listaAsig.length; j++) {
    var ra = listaAsig[j];
    var bgA = j%2===0?'var(--bg2)':'var(--card)';
    var dcA = dateColor(ra.desde);
    var dcH = dateColor(ra.hasta);
    var aptoSel = '<option value="0"'+(ra.aptoId===0||!ra.aptoId?' selected':'')+'>⭐ Sin asignar</option>' + aptos.map(function(a){ return '<option value="'+a.id+'"'+(a.id===ra.aptoId?' selected':'')+'>'+a.nombre+'</option>'; }).join('');
    rowsAsig += '<tr style="background:'+bgA+';border-bottom:1px solid var(--border)">';
    rowsAsig += '<td style="padding:4px 6px"><button class="btn btn-ghost btn-sm" onclick="buscarLibresParaReserva(\''+ra.desde+'\',\''+ra.hasta+'\')" title="Buscar deptos libres para estas fechas" style="font-size:0.68rem;padding:3px 7px;color:#7ab0eb;border-color:rgba(74,133,190,0.28);background:rgba(74,133,190,0.08);white-space:nowrap"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button></td>';
    rowsAsig += '<td style="padding:4px 6px"><input class="grid-input" data-id="'+ra.id+'" data-campo="huesped" value="'+ra.huesped.replace(/"/g,'&quot;')+'" oninput="updateReservaDebounced(parseInt(this.dataset.id),this.dataset.campo,this.value)" style="width:120px;font-weight:700"></td>';
    rowsAsig += '<td style="padding:8px 10px" class="td-pais-asig" data-id="'+ra.id+'" data-val="'+(ra.nacionalidad||'').replace(/"/g,'&quot;')+'"></td>';
    rowsAsig += '<td style="padding:4px 6px"><input class="grid-input" type="date" data-id="'+ra.id+'" data-campo="desde" value="'+(ra.desde||'')+'" oninput="updateReservaDebounced(parseInt(this.dataset.id),this.dataset.campo,this.value)" style="width:130px;'+(dcA||'color:var(--green)')+'"></td>';
    rowsAsig += '<td style="padding:4px 6px"><input class="grid-input" type="date" data-id="'+ra.id+'" data-campo="hasta" value="'+(ra.hasta||'')+'" oninput="updateReservaDebounced(parseInt(this.dataset.id),this.dataset.campo,this.value)" style="width:130px;'+(dcH||'color:var(--red)')+'"></td>';
    rowsAsig += '<td style="padding:4px 6px"><input class="grid-input" type="text" data-id="'+ra.id+'" data-campo="monto" value="'+(ra.monto?fmtMonto(ra.monto):'')+'" onblur="var v=parseMontoInputValue(this.value);updateReservaDebounced(parseInt(this.dataset.id),this.dataset.campo,v);this.value=v?fmtMonto(v):\'\'" style="width:110px;color:var(--gold);font-weight:700" placeholder="U$D / $"></td>';
    var _an=diffDays(ra.desde,ra.hasta),_apd=(_an>0&&ra.monto>0)?Math.round(ra.monto/_an):null;
    rowsAsig += '<td style="padding:4px 6px;font-size:0.75rem;color:var(--text3);white-space:nowrap">'+(_apd?fmtMonto(_apd):'—')+'</td>';
    rowsAsig += '<td style="padding:4px 6px"><input class="grid-input" type="number" data-id="'+ra.id+'" data-campo="cantHuespedes" value="'+(ra.cantHuespedes||'')+'" oninput="updateReservaDebounced(parseInt(this.dataset.id),this.dataset.campo,parseInt(this.value)||0)" style="width:60px;text-align:center"></td>';
    rowsAsig += '<td style="padding:4px 6px"><select class="grid-input" data-id="'+ra.id+'" data-campo="aptoId" onchange="updateReservaDebounced(parseInt(this.dataset.id),this.dataset.campo,parseInt(this.value))" style="width:110px">'+aptoSel+'</select></td>';
    var telAsigVal = (ra.contacto||'');
    if(telAsigVal && !telAsigVal.startsWith('+')) telAsigVal = '+' + telAsigVal;
    rowsAsig += '<td style="padding:4px 6px"><div style="display:flex;align-items:center;gap:4px">'
      + (ra.contacto ? '<button onclick="abrirWADirecto(\''+ra.contacto.replace(/'/g,"\\'")+'\')" style="background:none;border:none;cursor:pointer;padding:0;flex-shrink:0;display:flex;align-items:center" title="WhatsApp"><svg width="13" height="13" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.524 5.855L0 24l6.29-1.507A11.946 11.946 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.369l-.36-.213-3.733.894.944-3.643-.235-.374A9.818 9.818 0 1 1 12 21.818z"/></svg></button>' : '')
      + '<input class="grid-input" data-id="'+ra.id+'" data-campo="contacto" value="'+telAsigVal.replace(/"/g,'&quot;')+'" oninput="if(this.value&&!this.value.startsWith(\'+\'))this.value=\'+\'+this.value;updateReservaDebounced(parseInt(this.dataset.id),this.dataset.campo,this.value)" style="min-width:0;flex:1">'
      + '</div></td>';
    rowsAsig += '<td style="padding:4px 6px"><input class="grid-input" data-id="'+ra.id+'" data-campo="notas" value="'+(ra.notas||'').replace(/"/g,'&quot;')+'" oninput="updateReservaDebounced(parseInt(this.dataset.id),this.dataset.campo,this.value)" style="width:110px"></td>';
    rowsAsig += '</tr>';
  }
  var gridAsig = listaAsig.length === 0
    ? '<div style="text-align:center;padding:32px;color:var(--text3)">Sin reservas asignadas</div>'
    : (function(){
        var campos=['huesped','nacionalidad','desde','hasta','monto','cantHuespedes','aptoId','notas'];
        var labels=['Nombre','Nacionalidad','Ingreso','Salida','Precio','$/noche','Huéspedes','Departamento','Comentarios'];
        var ths='<th style="'+th+'"></th>'+campos.map(function(c,i){
          var cls='th-sort'+(_asigSort.campo===c?' '+_asigSort.dir:'');
          return '<th class="'+cls+'" style="'+th+';cursor:pointer" onclick="sortAsig(\''+c+'\')" title="Ordenar por '+labels[i]+'">'+labels[i]+'</th>';
        }).join('')+'<th style="'+th+';resize:horizontal;overflow:hidden;min-width:80px">Teléfono</th><th style="'+th+';resize:horizontal;overflow:hidden;min-width:80px">Comentarios</th>';
        return '<div style="overflow-x:auto;border-radius:12px;border:1px solid var(--border)"><table style="width:100%;border-collapse:collapse;font-size:0.83rem"><thead><tr style="background:var(--bg3);border-bottom:1px solid var(--border)">'+ths+'</tr></thead><tbody>'+rowsAsig+'</tbody></table></div>';
      })();

  var pad = function(n){ return String(n).padStart(2,'0'); };
  var todayIso = today.getFullYear()+'-'+pad(today.getMonth()+1)+'-'+pad(today.getDate());
  var tom = new Date(today); tom.setDate(tom.getDate()+1);
  var tomorrowIso = tom.getFullYear()+'-'+pad(tom.getMonth()+1)+'-'+pad(tom.getDate());

  tablasEl.innerHTML =
    '<div style="font-family:Fraunces,serif;font-size:0.9rem;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Sin departamento asignado</div>'
    + gridTemp
    + '<div style="font-family:Fraunces,serif;font-size:0.9rem;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.08em;margin-top:28px;margin-bottom:10px">Reservas asignadas</div>'
    + gridAsig;

  // Inyectar inputs de país
  tablasEl.querySelectorAll('.td-pais-temp,.td-pais-asig').forEach(function(td) {
    var id = parseInt(td.dataset.id);
    var val = td.dataset.val || '';
    td.appendChild(crearPaisInput(id, val));
  });

  // Botones asignar
  tablasEl.querySelectorAll('.btn-asignar-temp').forEach(function(btn) {
    btn.addEventListener('click', function() { asignarDeptoTemporal(parseInt(this.dataset.rid)); });
  });

  // Botones eliminar — directo sin diálogo
  tablasEl.querySelectorAll('.btn-eliminar-temp').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var rid = parseInt(this.dataset.rid);
      var nombre = this.dataset.nombre || 'esta reserva';
      this.disabled = true;
      this.textContent = '…';
      await supa.del('reservas', rid);
      reservas = reservas.filter(function(r){ return r.id !== rid; });
      _renderTempTablas();
      actualizarTempBadge();
      toast('✓ ' + nombre + ' eliminada');
    });
  });
}

function asignarDeptoTemporal(id) {
  const idNum = parseInt(id);
  const r = reservas.find(x => parseInt(x.id) === idNum);
  if(!r) return;

  // Build searchable depto dropdown using same portal as r_apto
  let selectedAptoId = null;

  mostrarDialogoSalida(
    `Asignar departamento a ${r.huesped}`,
    `<div style="margin-top:8px">
      <label style="font-size:0.75rem;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:6px">Departamento</label>
      <div style="position:relative">
        <input id="dlg_apto_search" class="form-input" type="text" placeholder="Buscar depto…" autocomplete="off"
          oninput="dlgAptoFilter(this.value)"
          onkeydown="dlgAptoKeydown(event)"
          style="width:100%">
        <input type="hidden" id="dlg_apto_id" value="">
      </div>
      <div id="dlg_apto_portal" style="display:none;margin-top:4px;background:var(--bg2);border:1px solid var(--border2);border-radius:8px;max-height:200px;overflow-y:auto"></div>
    </div>`,
    [
      { label: "Cancelar", action: () => { document.getElementById("dlg_apto_portal")?.remove(); } },
      { label: "✓ Asignar", action: async () => {
        const aptoId = parseInt(window._dlgData?.dlg_apto_id || "0");
        if(!aptoId) { toast("⚠️ Seleccioná un departamento", false); return; }
        const nombreApto = aptos.find(x=>x.id===aptoId)?.nombre || "";
        const solapadas = reservas.filter(x =>
          x.aptoId === aptoId && x.estado !== "cancelada" && x.id !== r.id &&
          parseDate(x.desde) < parseDate(r.hasta) && parseDate(x.hasta) > parseDate(r.desde)
        );
        const doAsignar = async () => {
          await supa.patch("reservas", id, { apto_id: aptoId });
          const resActualizadas = await supa.get("reservas", "order=fecha_desde");
          reservas = resActualizadas.map(dbRes);
          actualizarTempBadge(); renderTemp(); render(aptoId);
          toast(`✓ ${r.huesped} asignado a ${nombreApto}`);
          logAccion("Reserva temporal asignada", `${r.huesped} → ${nombreApto}`);
        };
        if(solapadas.length > 0) {
          const lista = solapadas.map(x => `<div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:0.82rem">· <b>${x.huesped}</b> <span style="color:var(--text3)">${fmtShort(x.desde)} → ${fmtShort(x.hasta)}</span></div>`).join("");
          mostrarDialogoSalida(
            `⚠️ Superposición en ${nombreApto}`,
            `<div style="color:var(--text2);margin-bottom:10px">Hay ${solapadas.length} reserva${solapadas.length>1?'s':''} que se superpone${solapadas.length>1?'n':''}:</div>${lista}<div style="margin-top:12px;color:var(--text2)">¿Asignar igual?</div>`,
            [
              { label: "Cancelar", action: () => {} },
              { label: "✓ Asignar igual", action: doAsignar }
            ]
          );
        } else {
          await doAsignar();
        }
      }}
    ]
  );
  // Focus search after dialog renders
  setTimeout(() => {
    const inp = document.getElementById("dlg_apto_search");
    if(inp) { inp.focus(); dlgAptoFilter(""); }
  }, 100);
}

function dlgAptoFilter(val) {
  const portal = document.getElementById("dlg_apto_portal");
  const hidden = document.getElementById("dlg_apto_id");
  if(!portal) return;
  const all = aptos.filter(a => !val || (a.nombre+(a.encargado?" "+a.encargado:"")).toLowerCase().includes(val.toLowerCase()));
  portal.style.display = "block";
  portal.innerHTML = all.map((a,i) => `<div data-apto-id="${a.id}" data-idx="${i}"
    style="padding:8px 12px;cursor:pointer;font-size:0.84rem;border-bottom:1px solid var(--border);color:var(--text)"
    onmousedown="event.preventDefault();document.getElementById('dlg_apto_search').value='${a.nombre.replace(/'/g,"\\'")}';document.getElementById('dlg_apto_id').value='${a.id}';document.getElementById('dlg_apto_portal').style.display='none'"
    onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''"
    >${a.nombre}${a.encargado?` <span style="color:var(--text3);font-size:0.78rem">· ${a.encargado}</span>`:""}</div>`).join("")
    || '<div style="padding:8px 12px;color:var(--text3);font-size:0.82rem">Sin resultados</div>';
  if(all.length === 0 && hidden) hidden.value = "";
}

function dlgAptoKeydown(e) {
  if(e.key === "Escape") { const p=document.getElementById("dlg_apto_portal"); if(p) p.style.display="none"; }
}

async function eliminarReservaTemp(id) {
  if(!confirm("¿Eliminar esta reserva temporal?")) return;
  await supa.del("reservas", id);
  reservas = reservas.filter(r => r.id !== id);
  renderTemp();
  toast("✓ Reserva eliminada");
}

function render(aptoId = null) {
  // Debounce
  clearTimeout(_renderTimer);
  _renderTimer = setTimeout(() => _doRender(aptoId), 30);
}

function _doRender(aptoId = null) {
  try { renderStats(); } catch(e) {}
  const onDeptos = document.getElementById("pageDeptos")?.classList.contains("active");
  if(!onDeptos) return;
  applyStoredDeptoFilters();

  // If a specific apto changed, only re-render that card
  if(aptoId) {
    const grid = document.getElementById("aptsGrid");
    const existingCard = grid?.querySelector(`[data-apto-id="${aptoId}"]`);
    if(existingCard) {
      const a = aptos.find(x => x.id === aptoId);
      if(a) {
        const tmp = document.createElement("div");
        tmp.innerHTML = aptCard(a);
        const newCard = tmp.firstElementChild;
        existingCard.replaceWith(newCard);
        // Re-attach drag listeners
        newCard.addEventListener("dragstart", cardDragStart);
        newCard.addEventListener("dragover",  cardDragOver);
        newCard.addEventListener("dragleave", cardDragLeave);
        newCard.addEventListener("drop",      cardDrop);
        newCard.addEventListener("dragend",   cardDragEnd);
        return;
      }
    }
  }
  // Full grid re-render
  try { renderGrid(); } catch(e) {}
}

// ─── BOOKING IMPORT (Tesseract OCR) ─────────────────────
var _bkFile = null;
var _tesseractLoadingPromise = null;

function ensureTesseractLoaded() {
  if(window.Tesseract) return Promise.resolve(window.Tesseract);
  if(_tesseractLoadingPromise) return _tesseractLoadingPromise;
  _tesseractLoadingPromise = new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.async = true;
    s.onload = function() { window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Tesseract not available')); };
    s.onerror = function() { reject(new Error('Failed to load Tesseract')); };
    document.head.appendChild(s);
  });
  return _tesseractLoadingPromise;
}

function abrirBooking() {
  _bkFile = null;
  document.getElementById('bkEmpty').style.display = 'block';
  document.getElementById('bkPreviewWrap').style.display = 'none';
  document.getElementById('bkProgressWrap').style.display = 'none';
  document.getElementById('bkProgressBar').style.width = '0%';
  document.getElementById('bkStatus').textContent = '';
  document.getElementById('bkFields').style.display = 'none';
  document.getElementById('bkBtnGuardar').style.display = 'none';
  document.getElementById('bkFileInput').value = '';
  // Limpiar campos
  ['bk_huesped','bk_desde','bk_hasta','bk_monto','bk_cant','bk_notas','bk_contacto'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value = '';
  });
  var nacEl = document.getElementById('bk_nacionalidad');
  var nacVal = document.getElementById('bk_nacionalidad_val');
  if(nacEl) { nacEl.textContent = '—'; nacEl.style.color = 'var(--text3)'; }
  if(nacVal) nacVal.value = '';
  openModal('modalBooking');
}

function bkHandleDrop(e) {
  e.preventDefault();
  e.currentTarget.style.borderColor = 'var(--border2)';
  e.currentTarget.style.background = '';
  const file = e.dataTransfer.files[0];
  if(file && file.type.startsWith('image/')) bkLoadFile(file);
}

function bkLoadFile(file) {
  if(!file) return;
  _bkFile = file;
  const reader = new FileReader();
  reader.onload = function(ev) {
    document.getElementById('bkPreviewImg').src = ev.target.result;
    document.getElementById('bkPreviewName').textContent = file.name || 'Imagen pegada';
    document.getElementById('bkEmpty').style.display = 'none';
    document.getElementById('bkPreviewWrap').style.display = 'block';
  };
  reader.readAsDataURL(file);
  bkRunOCR(file);
}

// Pegar con Ctrl+V
document.addEventListener('paste', function(e) {
  if(!document.getElementById('modalBooking').classList.contains('open')) return;
  const items = e.clipboardData?.items;
  if(!items) return;
  for(let i=0; i<items.length; i++) {
    if(items[i].type.startsWith('image/')) {
      bkLoadFile(items[i].getAsFile());
      break;
    }
  }
});

async function bkRunOCR(file) {
  document.getElementById('bkProgressWrap').style.display = 'block';
  document.getElementById('bkProgressBar').style.width = '0%';
  document.getElementById('bkStatus').style.color = 'var(--text3)';
  document.getElementById('bkStatus').textContent = 'Iniciando OCR…';
  document.getElementById('bkFields').style.display = 'none';
  document.getElementById('bkBtnGuardar').style.display = 'none';

  try {
    await ensureTesseractLoaded();
    const result = await window.Tesseract.recognize(file, 'spa', {
      logger: function(m) {
        if(m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          document.getElementById('bkProgressBar').style.width = pct + '%';
          document.getElementById('bkStatus').textContent = 'Leyendo texto… ' + pct + '%';
        }
      }
    });

    const text = result.data.text;
    console.log('=== BOOKING OCR TEXT ===');
    console.log(text);
    console.log('=== FIN OCR ===');
    const p = bkParse(text);
    console.log('=== PARSED:', JSON.stringify(p));

    document.getElementById('bk_huesped').value = p.nombre || '';
    if(document.getElementById('bk_contacto')) document.getElementById('bk_contacto').value = p.telefono || '';
    const bkNacEl = document.getElementById('bk_nacionalidad');
    const bkNacVal = document.getElementById('bk_nacionalidad_val');
    if(bkNacEl) { bkNacEl.textContent = p.nacionalidad || '—'; bkNacEl.style.color = p.nacionalidad ? 'var(--text)' : 'var(--text3)'; }
    if(bkNacVal) bkNacVal.value = p.nacionalidad || '';
    document.getElementById('bk_desde').value   = bkFechaToISO(p.checkin);
    document.getElementById('bk_hasta').value   = bkFechaToISO(p.checkout);
    document.getElementById('bk_monto').value   = p.monto || '';
    document.getElementById('bk_cant').value    = p.personas || '1';
    document.getElementById('bk_notas').value   = p.noches ? p.noches + ' noches' : '';

    // Guardar habitaciones en dataset para usar al guardar
    // 0 = no detectado por OCR (layout 2 columnas de Booking)
    document.getElementById('bkBtnGuardar').dataset.habitaciones = p.habitaciones || 1;

    // Banner de múltiples habitaciones
    var bkWarn = document.getElementById('bkMultiHabWarn');
    if(p.habitaciones === 0) {
      bkWarn.innerHTML = '⚠️ <strong>No se pudo detectar la cantidad de habitaciones</strong> (el OCR no la captura por el diseño de Booking). Si la reserva tiene más de 1 habitación, ingresá la cantidad manualmente en el campo de abajo antes de guardar.';
      bkWarn.style.display = 'block';
      // Add manual habitaciones input if not present
      if(!document.getElementById('bk_habitaciones_wrap')) {
        var wrap = document.createElement('div');
        wrap.id = 'bk_habitaciones_wrap';
        wrap.style.cssText = 'margin-top:8px;display:flex;align-items:center;gap:10px';
        wrap.innerHTML = '<label class="form-label" style="margin:0;white-space:nowrap">Habitaciones</label><input class="form-input" type="number" id="bk_habitaciones_manual" min="1" max="10" value="1" style="width:70px">';
        bkWarn.appendChild(wrap);
      }
      document.getElementById('bkBtnGuardar').textContent = '✓ Crear reserva temporal';
    } else if(p.habitaciones >= 2) {
      var mitadMonto = p.monto ? (parseFloat(p.monto) / p.habitaciones).toFixed(2) : '—';
      var mitadPersonas = p.personas ? Math.ceil(parseInt(p.personas) / p.habitaciones) : '—';
      bkWarn.innerHTML = '<strong>⚠️ Se detectaron ' + p.habitaciones + ' habitaciones.</strong> Se crearán ' + p.habitaciones + ' reservas temporales separadas, cada una con <strong>$' + mitadMonto + '</strong> y aprox. <strong>' + mitadPersonas + ' huésped(es)</strong>. Podés ajustar los montos después.';
      bkWarn.style.display = 'block';
      document.getElementById('bkBtnGuardar').textContent = '✓ Crear ' + p.habitaciones + ' reservas temporales';
    } else {
      bkWarn.style.display = 'none';
      document.getElementById('bkBtnGuardar').textContent = '✓ Crear reserva temporal';
    }

    document.getElementById('bkFields').style.display = 'block';
    document.getElementById('bkBtnGuardar').style.display = 'inline-flex';
    document.getElementById('bkStatus').style.color = 'var(--green)';
    document.getElementById('bkStatus').textContent = '✓ Texto extraído. Revisá los campos antes de guardar.';
  } catch(err) {
    document.getElementById('bkStatus').style.color = 'var(--red)';
    document.getElementById('bkStatus').textContent = '✗ Error al procesar la imagen. Intentá con una imagen más nítida.';
  }
  setTimeout(function(){ document.getElementById('bkProgressWrap').style.display = 'none'; }, 1000);
}

// Convertir DD/MM/YYYY a YYYY-MM-DD
function bkFechaToISO(ddmmyyyy) {
  if(!ddmmyyyy) return '';
  const parts = ddmmyyyy.split('/');
  if(parts.length !== 3) return '';
  return parts[2] + '-' + parts[1] + '-' + parts[0];
}

// ── Parser (del extractor original) ──────────────────────
const BK_MESES = {ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,oct:10,nov:11,dic:12};
const BK_SKIP  = ['check-in','check-out','check in','check out','check','booking','canal','recibida','código','comisión','importe','notas','nota','hora','llegada','habitacion','huésped','precio','total','duración','número','nombre','cliente','booking.com','noche','noches','adultos','adulto','niño','niños','sáb','vie','lun','mar','mié','jue','dom'];

function bkParseFecha(raw) {
  if(!raw) return '';
  let m = raw.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if(m) return m[1].padStart(2,'0')+'/'+m[2].padStart(2,'0')+'/'+m[3];
  m = raw.match(/(\d{1,2})\s+([a-záéíóú]{3})[a-z]*\.?\s+(\d{4})/i);
  if(m) {
    const mes = BK_MESES[m[2].toLowerCase().substring(0,3)];
    if(mes) return m[1].padStart(2,'0')+'/'+String(mes).padStart(2,'0')+'/'+m[3];
  }
  return '';
}

function bkParse(text) {
  const lines = text.split(/[\n\r]/).map(function(l){ return l.trim(); }).filter(Boolean);
  let nombre = '';

  // Tomar texto después de "Nombre del cliente:", buscar 202X y tomar lo que viene después
  const webLabelLine = text.match(/[Nn]ombre del cliente[:\s]+([\s\S]+?)(?=\n\n|\nCheck|$)/);
  if(webLabelLine) {
    const raw = webLabelLine[1];
    // Buscar año 202X y tomar todo lo que viene después
    const afterYear = raw.match(/20(?:2[6-9]|3\d)\s+(.+)/);
    if(afterYear) {
      nombre = afterYear[1].replace(/[^A-Za-záéíóúñüÁÉÍÓÚÑÜ ]/g, ' ').replace(/\s+/g, ' ').trim();
    } else {
      // Fallback: tomar todo el texto después del label filtrando solo letras
      nombre = raw.replace(/[^A-Za-záéíóúñüÁÉÍÓÚÑÜ ]/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  // Intento 2: línea siguiente al label
  if(!nombre) {
    for(let i=0; i<lines.length; i++) {
      if(/nombre del cliente/i.test(lines[i])) {
        for(let j=i+1; j<Math.min(i+4,lines.length); j++) {
          const c = lines[j];
          if(!c || c.length < 3) continue;
          const afterYear = c.match(/20(?:2[6-9]|3\d)\s+(.+)/);
          if(afterYear) {
            nombre = afterYear[1].replace(/[^A-Za-záéíóúñüÁÉÍÓÚÑÜ ]/g, ' ').replace(/\s+/g, ' ').trim();
          } else {
            nombre = c.replace(/[^A-Za-záéíóúñüÁÉÍÓÚÑÜ ]/g, ' ').replace(/\s+/g, ' ').trim();
          }
          if(nombre.length >= 3) break;
        }
        break;
      }
    }
  }
  if(!nombre) {
    for(let k=0; k<Math.min(6,lines.length); k++) {
      const line = lines[k];
      if(/\d/.test(line) || line.length<5 || line.length>60) continue;
      const low = line.toLowerCase();
      if(BK_SKIP.some(function(w){ return low===w||low.startsWith(w+' ')||low.includes(' '+w+' '); })) continue;
      const words = line.split(/\s+/);
      const cap = words.filter(function(w){ return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{1,}$/.test(w); });
      if(cap.length >= 2) { nombre=line; break; }
    }
  }

  let checkin='', checkout='';
  const allFechas=[];
  const fechaRe=/(?:(?:lun|mar|mié|jue|vie|sáb|dom)[,.]?\s*)?(\d{1,2})\s+([a-záéíóú]{3})[a-z]*\.?\s+(\d{4})/gi;
  let fm;
  while((fm=fechaRe.exec(text))!==null) {
    const f=bkParseFecha(fm[0]);
    if(f&&!allFechas.includes(f)) allFechas.push(f);
  }
  if(allFechas.length>=2) { checkin=allFechas[0]; checkout=allFechas[1]; }
  else if(allFechas.length===1) { checkin=allFechas[0]; }

  // find() busca en texto corrido (una línea)
  function find(patterns) {
    for(const pat of patterns) { const m=text.match(pat); if(m&&m[1]) return m[1].trim(); }
    return '';
  }
  // findLines() busca el label en una línea y toma el número en esa línea O en la siguiente
  function findLines(labelRe) {
    for(let i=0; i<lines.length; i++) {
      if(labelRe.test(lines[i])) {
        // Número en la misma línea
        const same = lines[i].match(/(\d+)[.,]?(\d*)\s*$/);
        if(same) return same[1];
        // Número en la línea siguiente
        if(i+1 < lines.length) {
          const next = lines[i+1].match(/^(\d+)/);
          if(next) return next[1];
        }
      }
    }
    return '';
  }

  const noches = find([/(\d+)\s+noches?/i, /[Dd]uración[^\d]*(\d+)/]) || findLines(/duración/i);

  let personas = find([
    /[Nn]úmero de huéspedes[^\d]*(\d+)/,
    /[Hh]uéspedes[^\d]*(\d+)/,
    /[Nn]úmero de personas[^\d]*(\d+)/,
    /[Gg]uests?[^\d]*(\d+)/i,
    /(\d+)\s+huéspedes?/i,
    /(\d+)\s+personas?/i,
    /(\d+)\s+guests?/i,
  ]) || findLines(/n[uú]mero de hu[eé]spedes/i) || findLines(/n[uú]mero de personas/i);
  if(!personas) {
    const adultos = find([/(\d+)\s+adultos?/i, /adultos?[^\d]*(\d+)/i]) || findLines(/adultos?/i);
    const ninos   = find([/(\d+)\s+ni[ñn]/i,   /ni[ñn][^\d]*(\d+)/i])   || findLines(/ni[ñn]/i);
    if(adultos) personas = String(parseInt(adultos) + (ninos ? parseInt(ninos) : 0));
  }

  // Monto: cortar el texto antes de "comisión"/"Importe sujeto" para no agarrar valores parciales
  let monto = '';
  const textSinComision = text.split(/[Ii]mporte sujeto|[Cc]omisi[oó]n/)[0];
  const precioTotalM = textSinComision.match(/[Pp]recio total[\s\S]{0,60}?((?:US\$|AR\$)\s*[\d.,]+)/);
  if(precioTotalM) {
    const nm = precioTotalM[1].replace(/[^\d,]/g,'').replace(',','.');
    monto = nm;
  } else {
    const m1 = textSinComision.match(/((?:US\$|AR\$)\s*[\d.,]+)/);
    if(m1) {
      const nm = m1[1].replace(/[^\d,]/g,'').replace(',','.');
      monto = nm;
    }
  }
  // Teléfono: después de "por teléfono:"
  let telefono = '';
  const telMatch = text.match(/tel[eé]fono[^\r\n]*?\n?.*?([+][\d][\d\s\-(). ]{7,25}[\d])/i);
  if(telMatch) {
    telefono = telMatch[1].replace(/\s+/g,' ').trim();
  } else {
    const telGen = text.match(/([+][\d]{1,3}[\s]?[\d]{2,5}[\s]?[\d]{2,5}[\s]?[\d]{2,5}(?:[\s][\d]{2,5})?)/);
    if(telGen) telefono = telGen[1].replace(/\s+/g,' ').trim();
  }

  // Nacionalidad: código ISO de 2 letras
  const ISO = {af:"Afganistán",al:"Albania",de:"Alemania",ar:"Argentina",au:"Australia",at:"Austria",az:"Azerbaiyán",be:"Bélgica",bo:"Bolivia",ba:"Bosnia y Herzegovina",br:"Brasil",bg:"Bulgaria",ca:"Canadá",cl:"Chile",cn:"China",co:"Colombia",cr:"Costa Rica",hr:"Croacia",cu:"Cuba",dk:"Dinamarca",ec:"Ecuador",eg:"Egipto",sv:"El Salvador",ae:"Emiratos Árabes Unidos",es:"España",us:"Estados Unidos",ee:"Estonia",et:"Etiopía",ph:"Filipinas",fi:"Finlandia",fr:"Francia",ge:"Georgia",gh:"Ghana",gr:"Grecia",gt:"Guatemala",ht:"Haití",hn:"Honduras",hu:"Hungría",in:"India",id:"Indonesia",iq:"Irak",ir:"Irán",ie:"Irlanda",is:"Islandia",il:"Israel",it:"Italia",jm:"Jamaica",jp:"Japón",jo:"Jordania",kz:"Kazajistán",ke:"Kenia",kw:"Kuwait",lv:"Letonia",lb:"Líbano",ly:"Libia",lt:"Lituania",lu:"Luxemburgo",mk:"Macedonia del Norte",my:"Malasia",mt:"Malta",ma:"Marruecos",mx:"México",md:"Moldavia",mn:"Mongolia",me:"Montenegro",mz:"Mozambique",na:"Namibia",np:"Nepal",ni:"Nicaragua",ng:"Nigeria",no:"Noruega",nz:"Nueva Zelanda",nl:"Países Bajos",pk:"Pakistán",pa:"Panamá",py:"Paraguay",pe:"Perú",pl:"Polonia",pt:"Portugal",gb:"Reino Unido",cz:"República Checa",do:"República Dominicana",ro:"Rumanía",ru:"Rusia",sn:"Senegal",rs:"Serbia",sg:"Singapur",so:"Somalia",lk:"Sri Lanka",za:"Sudáfrica",sd:"Sudán",se:"Suecia",ch:"Suiza",th:"Tailandia",tz:"Tanzania",tt:"Trinidad y Tobago",tn:"Túnez",tr:"Turquía",ua:"Ucrania",ug:"Uganda",uy:"Uruguay",ve:"Venezuela",vn:"Vietnam",ye:"Yemen",zm:"Zambia",zw:"Zimbabue"};
  const ISO_SKIP = new Set(['me','no','se','in','la','de','el','al','do','es','or','be','re','le','to','as','at','by','go','he','if','is','it','of','on','so','up','we']);
  const TEL_PAIS = {"1":"Estados Unidos","7":"Rusia","20":"Egipto","27":"Sudáfrica","30":"Grecia","31":"Países Bajos","32":"Bélgica","33":"Francia","34":"España","36":"Hungría","39":"Italia","40":"Rumanía","41":"Suiza","43":"Austria","44":"Reino Unido","45":"Dinamarca","46":"Suecia","47":"Noruega","48":"Polonia","49":"Alemania","51":"Perú","52":"México","53":"Cuba","54":"Argentina","55":"Brasil","56":"Chile","57":"Colombia","58":"Venezuela","60":"Malasia","61":"Australia","62":"Indonesia","63":"Filipinas","64":"Nueva Zelanda","65":"Singapur","66":"Tailandia","81":"Japón","82":"Corea del Sur","84":"Vietnam","86":"China","90":"Turquía","91":"India","92":"Pakistán","94":"Sri Lanka","98":"Irán","212":"Marruecos","213":"Argelia","216":"Túnez","218":"Libia","221":"Senegal","234":"Nigeria","254":"Kenia","256":"Uganda","260":"Zambia","263":"Zimbabue","351":"Portugal","352":"Luxemburgo","353":"Irlanda","354":"Islandia","355":"Albania","356":"Malta","357":"Chipre","358":"Finlandia","359":"Bulgaria","370":"Lituania","371":"Letonia","372":"Estonia","373":"Moldavia","374":"Armenia","375":"Bielorrusia","380":"Ucrania","381":"Serbia","382":"Montenegro","385":"Croacia","386":"Eslovenia","387":"Bosnia y Herzegovina","389":"Macedonia del Norte","420":"República Checa","421":"Eslovaquia","595":"Paraguay","598":"Uruguay","880":"Bangladés","972":"Israel","973":"Baréin","974":"Catar","976":"Mongolia","977":"Nepal","992":"Tayikistán","993":"Turkmenistán","994":"Azerbaiyán","995":"Georgia","996":"Kirguistán","998":"Uzbekistán"};
  let nacionalidad = '';

  // Buscar código ISO de nacionalidad
  // Booking muestra bandera + código "ar","es",etc. junto al nombre.
  // Tesseract convierte la bandera en "——" u otros chars, y el código queda 
  // pegado como palabra suelta en el texto corrido.
  const lines2 = text.split(/\n/);

  // Intento 1: justo después de "——" o "—" (bandera OCR) buscar 2 letras ISO
  const mNacBandera = text.match(/[—–]{1,3}\s*([a-z]{2})(?:\s|$)/i);
  if(mNacBandera && ISO[mNacBandera[1].toLowerCase()] && !ISO_SKIP.has(mNacBandera[1].toLowerCase())) {
    nacionalidad = ISO[mNacBandera[1].toLowerCase()];
  }

  // Intento 2: palabra de 2 letras minúsculas que aparece sola entre espacios
  // justo después del nombre del huésped (primeras 200 chars tras "Nombre del cliente")
  if(!nacionalidad) {
    const afterNombre = text.match(/[Nn]ombre del cliente[:\s]+[\s\S]{0,200}/);
    if(afterNombre) {
      const words = afterNombre[0].split(/\s+/);
      for(const w of words) {
        const wl = w.replace(/[^a-z]/gi,'').toLowerCase();
        if(wl.length===2 && ISO[wl] && !ISO_SKIP.has(wl)) { nacionalidad=ISO[wl]; break; }
      }
    }
  }

  // Intento 3: línea que contenga SOLO 2 letras minúsculas
  if(!nacionalidad) {
    for(let li=0; li<lines2.length; li++) {
      const l = lines2[li].trim();
      if(/^[a-z]{2}$/.test(l) && ISO[l] && !ISO_SKIP.has(l)) { nacionalidad = ISO[l]; break; }
    }
  }

  // Intento 4: 2 letras al final de una línea
  if(!nacionalidad) {
    for(let li=0; li<Math.min(lines2.length,15); li++) {
      const l = lines2[li].trim();
      const m = l.match(/\s([a-z]{2})$/);
      if(m && ISO[m[1]] && !ISO_SKIP.has(m[1])) { nacionalidad = ISO[m[1]]; break; }
    }
  }

  // Intento 4: inferir por prefijo telefónico (+40=Rumanía, +54=Argentina)
  if(!nacionalidad && telefono) {
    const digits = telefono.replace(/[^0-9]/g,'');
    for(const len of [3,2,1]) {
      const code = digits.substring(0,len);
      if(TEL_PAIS[code]) { nacionalidad = TEL_PAIS[code]; break; }
    }
  }

  // Habitaciones — Tesseract pierde el número por el layout de 2 columnas de Booking.
  // Intentamos detectarlo, pero si no está lo dejamos en 0 (indica "no detectado").
  const _habRaw = find([
    /[Tt]otal de habitaciones[^\d]*(\d+)/,
    /[Hh]abitaciones?[:\s]+([1-9]\d*)/,
    /([1-9]\d*)\s+habitaciones?/i,
    /[Rr]ooms?[:\s]+([1-9]\d*)/,
    /([1-9]\d*)\s+rooms?/i,
  ]) || findLines(/total de habitaciones/i) || findLines(/habitaciones?/i);
  const habitaciones = parseInt(_habRaw) || 0;

  return {nombre,checkin,checkout,noches,personas,monto,telefono,nacionalidad,habitaciones};
}

async function bookingGuardar() {
  const huesped  = document.getElementById('bk_huesped').value.trim();
  const desde    = document.getElementById('bk_desde').value;
  const hasta    = document.getElementById('bk_hasta').value;
  if(!huesped || !desde || !hasta) { toast('⚠️ Completá al menos nombre y fechas', false); return; }

  const _habManual = document.getElementById('bk_habitaciones_manual');
  const habitaciones = (_habManual ? parseInt(_habManual.value) : null)
    || parseInt(document.getElementById('bkBtnGuardar').dataset.habitaciones) || 1;
  const montoTotal   = parseFloat(document.getElementById('bk_monto').value) || 0;
  const cantTotal    = parseInt(document.getElementById('bk_cant').value) || 1;
  const contacto     = document.getElementById('bk_contacto')?.value || '';
  const nacionalidad = document.getElementById('bk_nacionalidad_val')?.value || '';
  const notas        = document.getElementById('bk_notas').value;

  const cantidad = Math.max(1, habitaciones);
  const montoParc  = parseFloat((montoTotal / cantidad).toFixed(2));
  const cantParc   = Math.ceil(cantTotal / cantidad);

  let creadas = 0;
  for(let i = 0; i < cantidad; i++) {
    const notaHab = cantidad > 1 ? (notas ? notas + ' · Hab. ' + (i+1) + '/' + cantidad : 'Hab. ' + (i+1) + '/' + cantidad) : notas;
    const row = {
      apto_id:        null,
      huesped:        cantidad > 1 ? huesped + ' (hab. ' + (i+1) + ')' : huesped,
      contacto,
      fecha_desde:    desde,
      fecha_hasta:    hasta,
      monto:          montoParc,
      cant_huespedes: cantParc,
      nacionalidad,
      notas:          notaHab,
      estado:         'pendiente',
      pago:           false,
      ingreso:        false,
      horario_entrada: DEFAULT_HORARIO_ENTRADA,
      horario_salida: DEFAULT_HORARIO_SALIDA,
    };
    const cr = await supa.post('reservas', row);
    if(cr) {
      const nueva = dbRes(cr);
      nueva._temp = true;
      reservas.push(nueva);
      nextReservaId = Math.max(nextReservaId, nueva.id + 1);
      creadas++;
    }
  }

  if(creadas > 0) {
    actualizarTempBadge();
    renderTemp();
    closeModal('modalBooking');
    const msg = creadas > 1
      ? '✓ ' + creadas + ' reservas de Booking importadas como temporales'
      : '✓ Reserva de Booking importada como temporal';
    toast(msg);
    logAccion('Reserva importada desde Booking', huesped + (cantidad > 1 ? ' (' + cantidad + ' hab.)' : ''));
  } else {
    toast('✗ Error al guardar la reserva', false);
  }
}

// ─── BÚSQUEDA GLOBAL ────────────────────────────────────
var _buscarHighlights = [];

function buscarEnPagina(query) {
  // Limpiar highlights anteriores
  _buscarHighlights.forEach(function(el) {
    var parent = el.parentNode;
    if(parent) parent.replaceChild(document.createTextNode(el.dataset.original || el.textContent), el);
  });
  _buscarHighlights = [];

  var countEl = document.getElementById('buscarGlobalCount');
  if(!query || query.trim().length < 2) {
    if(countEl) countEl.style.display = 'none';
    return;
  }

  var q = query.trim().toLowerCase();
  var count = 0;
  var firstMatch = null;

  // Buscar en todas las tarjetas de departamentos
  var grid = document.getElementById('aptsGrid');
  if(!grid) return;

  // Recorrer todos los nodos de texto dentro del grid
  function resaltarNodo(node) {
    if(node.nodeType === 3) { // texto
      var txt = node.textContent;
      if(txt.toLowerCase().includes(q)) {
        var span = document.createElement('span');
        span.dataset.original = txt;
        var idx = 0;
        var html = '';
        var lower = txt.toLowerCase();
        while(true) {
          var pos = lower.indexOf(q, idx);
          if(pos === -1) { html += escHtml(txt.substring(idx)); break; }
          html += escHtml(txt.substring(idx, pos));
          html += '<mark style="background:var(--gold);color:#000;border-radius:2px;padding:0 1px">' + escHtml(txt.substring(pos, pos+q.length)) + '</mark>';
          idx = pos + q.length;
          count++;
          if(count === 1) firstMatch = span;
        }
        span.innerHTML = html;
        node.parentNode.replaceChild(span, node);
        _buscarHighlights.push(span);
      }
    } else if(node.nodeType === 1 && node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE') {
      Array.from(node.childNodes).forEach(resaltarNodo);
    }
  }

  resaltarNodo(grid);

  if(countEl) {
    if(count > 0) {
      countEl.textContent = count;
      countEl.style.display = 'block';
      if(firstMatch) firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      countEl.textContent = '0';
      countEl.style.display = 'block';
    }
  }
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── AUTOCOMPLETE PAÍSES ────────────────────────────────
const PAISES = [
  "Argentina","Albania","Alemania","Angola","Antigua y Barbuda","Arabia Saudita","Argelia","Armenia","Australia","Austria","Azerbaiyán",
  "Bahamas","Bangladés","Barbados","Baréin","Bélgica","Belice","Benín","Bielorrusia","Bolivia","Bosnia y Herzegovina","Botsuana","Brasil","Brunéi","Bulgaria","Burkina Faso","Burundi","Bután",
  "Cabo Verde","Camboya","Camerún","Canadá","Catar","Chad","Chile","China","Chipre","Colombia","Comoras","Congo","Corea del Norte","Corea del Sur","Costa de Marfil","Costa Rica","Croacia","Cuba",
  "Dinamarca","Dominica","Ecuador","Egipto","El Salvador","Emiratos Árabes Unidos","Eritrea","Eslovaquia","Eslovenia","España","Estados Unidos","Estonia","Esuatini","Etiopía",
  "Filipinas","Finlandia","Fiyi","Francia","Gabón","Gambia","Georgia","Ghana","Granada","Grecia","Guatemala","Guinea","Guinea Ecuatorial","Guinea-Bisáu","Guyana",
  "Haití","Honduras","Hungría","India","Indonesia","Irak","Irán","Irlanda","Islandia","Islas Marshall","Islas Salomón","Israel","Italia",
  "Jamaica","Japón","Jordania","Kazajistán","Kenia","Kirguistán","Kiribati","Kosovo","Kuwait",
  "Laos","Lesoto","Letonia","Líbano","Liberia","Libia","Liechtenstein","Lituania","Luxemburgo",
  "Macedonia del Norte","Madagascar","Malasia","Malaui","Maldivas","Malí","Malta","Marruecos","Mauricio","Mauritania","México","Micronesia","Moldavia","Mónaco","Mongolia","Montenegro","Mozambique","Myanmar",
  "Namibia","Nauru","Nepal","Nicaragua","Níger","Nigeria","Noruega","Nueva Zelanda",
  "Omán","Países Bajos","Pakistán","Palaos","Palestina","Panamá","Papúa Nueva Guinea","Paraguay","Perú","Polonia","Portugal",
  "Reino Unido","República Centroafricana","República Checa","República Democrática del Congo","República Dominicana","Ruanda","Rumanía","Rusia",
  "Saint Kitts y Nevis","Samoa","San Marino","Santa Lucía","Santo Tomé y Príncipe","San Vicente y las Granadinas","Senegal","Serbia","Seychelles","Sierra Leona","Singapur","Siria","Somalia","Sri Lanka","Sudáfrica","Sudán","Sudán del Sur","Suecia","Suiza","Surinam",
  "Tailandia","Tanzania","Tayikistán","Timor Oriental","Togo","Tonga","Trinidad y Tobago","Túnez","Turkmenistán","Turquía","Tuvalu",
  "Ucrania","Uganda","Uruguay","Uzbekistán","Vanuatu","Venezuela","Vietnam","Yemen","Yibuti","Zambia","Zimbabue"
];

var _paisPortal = null;
var _paisSelected = -1;

function crearPaisInput(idReserva, valorActual, extraStyle) {
  var wrap = document.createElement('div');
  wrap.className = 'pais-wrap';
  wrap.style.cssText = 'position:relative;' + (extraStyle||'');

  var input = document.createElement('input');
  input.className = 'grid-input';
  input.type = 'text';
  input.value = valorActual || '';
  input.placeholder = 'País...';
  input.dataset.id = idReserva;
  input.dataset.campo = 'nacionalidad';
  input.style.cssText = 'width:110px';

  input.addEventListener('input', function() {
    _paisSelected = -1;
    updateReservaDebounced(parseInt(this.dataset.id), 'nacionalidad', this.value);
    abrirPaisDropdown(this);
  });
  input.addEventListener('focus', function() { abrirPaisDropdown(this); });
  input.addEventListener('keydown', function(e) {
    var portal = document.getElementById('pais_portal');
    if(!portal) return;
    var opts = portal.querySelectorAll('.pais-option');
    if(e.key === 'ArrowDown') { e.preventDefault(); _paisSelected = Math.min(_paisSelected+1, opts.length-1); resaltarPais(opts); }
    else if(e.key === 'ArrowUp') { e.preventDefault(); _paisSelected = Math.max(_paisSelected-1, 0); resaltarPais(opts); }
    else if(e.key === 'Enter' && _paisSelected >= 0) { e.preventDefault(); opts[_paisSelected].click(); }
    else if(e.key === 'Escape') { cerrarPaisDropdown(); }
  });

  wrap.appendChild(input);
  return wrap;
}

function resaltarPais(opts) {
  opts.forEach(function(o, i) {
    o.classList.toggle('selected', i === _paisSelected);
    if(i === _paisSelected) o.scrollIntoView({block:'nearest'});
  });
}

function abrirPaisDropdown(input) {
  cerrarPaisDropdown();
  var query = input.value.toLowerCase().trim();
  var filtrados = query.length === 0
    ? PAISES
    : PAISES.filter(function(p){ return p.toLowerCase().includes(query); });
  if(filtrados.length === 0) return;

  var rect = input.getBoundingClientRect();
  var portal = document.createElement('div');
  portal.id = 'pais_portal';
  portal.className = 'pais-dropdown open';
  var spaceBelow = window.innerHeight - rect.bottom - 8;
  var spaceAbove = rect.top - 8;
  var maxH = Math.min(200, Math.max(spaceBelow, spaceAbove));
  portal.style.cssText = 'position:fixed;left:'+rect.left+'px;width:'+Math.max(rect.width,160)+'px;max-height:'+maxH+'px;overflow-y:auto;background:var(--bg2);border:1px solid var(--border2);border-radius:8px;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,0.5);display:block';
  if(spaceBelow >= spaceAbove || spaceBelow >= 120) {
    portal.style.top = (rect.bottom+2)+'px';
    portal.style.bottom = 'auto';
  } else {
    portal.style.bottom = (window.innerHeight-rect.top+2)+'px';
    portal.style.top = 'auto';
  }

  filtrados.forEach(function(pais) {
    var div = document.createElement('div');
    div.className = 'pais-option';
    div.textContent = pais;
    div.addEventListener('mousedown', function(e) {
      e.preventDefault();
      input.value = pais;
      updateReservaDebounced(parseInt(input.dataset.id), 'nacionalidad', pais);
      cerrarPaisDropdown();
    });
    portal.appendChild(div);
  });

  document.body.appendChild(portal);

  setTimeout(function() {
    document.addEventListener('mousedown', function closePais(e) {
      if(!portal.contains(e.target) && e.target !== input) {
        cerrarPaisDropdown();
        document.removeEventListener('mousedown', closePais);
      }
    });
  }, 10);
}

function cerrarPaisDropdown() {
  var p = document.getElementById('pais_portal');
  if(p) p.remove();
  _paisSelected = -1;
}

// ─── MODO CLARO/OSCURO ─────────────────────────────────
function abrirPendientes() {
  const todayStr = today.toISOString().slice(0,10);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
  const tomorrowStr = tomorrow.toISOString().slice(0,10);

  const impagos       = reservas.filter(r => r.estado !== "cancelada" && r.ingreso && !r.pago);
  const conDeuda      = reservas.filter(r => r.estado !== "cancelada" && r.hayDeuda);
  const checkinHoy    = reservas.filter(r => r.estado !== "cancelada" && r.desde === todayStr);
  const checkoutHoy   = reservas.filter(r => r.estado !== "cancelada" && r.hasta === todayStr);
  const checkinManana = reservas.filter(r => r.estado !== "cancelada" && r.desde === tomorrowStr);
  const checkoutManana= reservas.filter(r => r.estado !== "cancelada" && r.hasta === tomorrowStr);

  const fmtMovimiento = (r) => {
    const a = aptos.find(x => x.id === r.aptoId);
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.83rem">
      <div style="flex:1.5;font-weight:700;color:var(--text)">${r.huesped}</div>
      <div style="flex:1;color:var(--text2);font-size:0.78rem">${r.contacto ? fmtTelefono(r.contacto) : "—"}</div>
      <div style="flex:0.8;color:var(--gold);font-weight:600">${a?.nombre || "—"}</div>
      <div style="flex:0.8;color:var(--text3);font-size:0.75rem">${r.reservaDe || r.cobrador || "—"}</div>
    </div>`;
  };

  const fmtImpago = (r) => {
    const a = aptos.find(x => x.id === r.aptoId);
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.83rem">
      <div style="flex:1.5;font-weight:700;color:var(--text)">${r.huesped}</div>
      <div style="flex:1;color:var(--text2);font-size:0.78rem">${r.contacto ? fmtTelefono(r.contacto) : "—"}</div>
      <div style="flex:0.8;color:var(--gold);font-weight:600">${a?.nombre || "—"}</div>
      <div style="flex:0.8;color:var(--text3);font-size:0.75rem">${r.reservaDe || r.cobrador || "—"}</div>
    </div>`;
  };

  const fmtDeuda = (r) => {
    const a = aptos.find(x => x.id === r.aptoId);
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.83rem">
      <div style="flex:1.5;font-weight:700;color:var(--text)">${r.huesped}</div>
      <div style="flex:0.8;color:var(--gold);font-weight:600">${a?.nombre || "—"}</div>
      <div style="flex:0.8;color:var(--red);font-weight:700">${fmtMonto(r.deudaMonto || 0)}</div>
      <div style="flex:1;color:var(--text3);font-size:0.75rem">${r.deudaComentario || "—"}</div>
    </div>`;
  };

  const movHeaders = `<span style="flex:1.5">Huésped</span><span style="flex:1">Teléfono</span><span style="flex:0.8">Depto</span><span style="flex:0.8">Reserva de</span>`;

  const seccion = (titulo, color, items, fmtFn, headers) => `
    <div style="margin-bottom:20px">
      <div style="font-family:'Fraunces',serif;font-size:0.85rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${color};margin-bottom:8px">${titulo} <span style="font-size:0.7rem;opacity:0.7">(${items.length})</span></div>
      ${items.length === 0
        ? `<div style="text-align:center;padding:16px;color:var(--text3);font-size:0.82rem">Sin registros</div>`
        : `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;overflow:hidden">
            <div style="display:flex;gap:10px;padding:6px 12px;background:var(--bg2);border-bottom:1px solid var(--border);font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text3)">${headers}</div>
            ${items.map(fmtFn).join("")}
          </div>`}
    </div>`;

  mostrarDialogoSalida(
    "Pendientes",
    seccion("↑ Check-out hoy",    "var(--red)",    checkoutHoy,   fmtMovimiento, movHeaders)
    + seccion("↓ Check-in hoy",   "var(--green)",  checkinHoy,    fmtMovimiento, movHeaders)
    + seccion("↑ Check-out mañana","var(--orange)", checkoutManana,fmtMovimiento, movHeaders)
    + seccion("↓ Check-in mañana","var(--blue)",   checkinManana, fmtMovimiento, movHeaders)
    + seccion("Ingresados e impagos", "var(--red)", impagos, fmtImpago, movHeaders)
    + seccion("Hay deuda / Seña", "var(--orange)", conDeuda, fmtDeuda,
      `<span style="flex:1.5">Huésped</span><span style="flex:0.8">Depto</span><span style="flex:0.8">Deuda</span><span style="flex:1">Comentario</span>`),
    [{ label: "✕ Cerrar", action: () => {} }],
    { maxWidth: 680, width: "95vw", buttonJustify: "center" }
  );
}

function toggleModo() {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('rentaflow_modo', isLight ? 'light' : 'dark');
  actualizarBtnModo(isLight);
}

function actualizarBtnModo(isLight) {
  const icon = document.getElementById('modoIcon');
  const label = document.getElementById('modoLabel');
  if(icon) icon.textContent = isLight ? '🌙' : '☀️';
  if(label) label.textContent = isLight ? 'Modo oscuro' : 'Modo claro';
}

// Restaurar preferencia guardada
(function() {
  const saved = localStorage.getItem('rentaflow_modo');
  if(saved === 'light') {
    document.body.classList.add('light-mode');
    actualizarBtnModo(true);
  }
})();

// Poblar datalist de países
(function() {
  var dl = document.getElementById('paises_list');
  if(dl) PAISES.forEach(function(p){ var o=document.createElement('option'); o.value=p; dl.appendChild(o); });
})();

// TAB en nacionalidad: si hay una sola coincidencia, completar automáticamente
function nacAutocompletarTab(e, input) {
  if(e.key !== 'Tab') return;
  const val = input.value.trim().toLowerCase();
  if(!val) return;
  const match = PAISES.filter(function(p){ return p.toLowerCase().startsWith(val); });
  if(match.length === 1) {
    e.preventDefault();
    input.value = match[0];
    // Mover foco al siguiente campo
    const focusable = Array.from(document.querySelectorAll('input:not([type=hidden]),select,textarea,button:not([tabindex="-1"])'))
      .filter(function(el){ return !el.disabled && el.offsetParent !== null; });
    const idx = focusable.indexOf(input);
    if(idx >= 0 && focusable[idx+1]) focusable[idx+1].focus();
  }
}

// Load from Supabase on startup
cargarDatos();

// ─── DATE INPUT ENHANCER ───────────────────────────────
function enhanceDateInputs(root) {
  root = root || document;
  root.querySelectorAll('input[type="date"]:not([data-enhanced])').forEach(function(inp) {
    inp.dataset.enhanced = "1";
    if(inp.parentElement.classList.contains('date-wrap')) return;

    var wrap = document.createElement('div');
    wrap.className = 'date-wrap';
    // Copy explicit width/min-width from inline style if set
    var origWidth = inp.style.width;
    if(origWidth) { inp.style.width = ''; wrap.style.width = origWidth; }

    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(inp);

    var btn = document.createElement('button');
    btn.className = 'date-clear-btn';
    btn.type = 'button';
    btn.title = 'Borrar fecha';
    btn.textContent = '✕';
    btn.style.display = inp.value ? 'block' : 'none';

    btn.addEventListener('mousedown', function(e) {
      e.preventDefault(); // prevent blur on input
    });
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      inp.value = '';
      btn.style.display = 'none';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      inp.focus();
    });

    var updateBtn = function() {
      btn.style.display = inp.value ? 'block' : 'none';
    };
    inp.addEventListener('input', updateBtn);
    inp.addEventListener('change', updateBtn);

    // Backspace chain: when field is partially/fully cleared, keep deleting
    inp.addEventListener('keydown', function(e) {
      if(e.key !== 'Backspace' && e.key !== 'Delete') return;
      if(!inp.value) return;
      // Clear the whole value on backspace
      inp.value = '';
      btn.style.display = 'none';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      e.preventDefault();
    });

    wrap.appendChild(btn);
  });
}

// Run on load and watch for dynamic content
enhanceDateInputs();
var _dateObserver = new MutationObserver(function(mutations) {
  mutations.forEach(function(m) {
    m.addedNodes.forEach(function(n) {
      if(n.nodeType === 1) enhanceDateInputs(n);
    });
  });
});
_dateObserver.observe(document.body, { childList: true, subtree: true });

// ─── REALTIME SYNC ─────────────────────────────────────
// Auto-reload data when any table changes (other device/user)
// Suprimir realtime durante 2s después de un cambio propio
var _realtimeSuppressed = false;
function suprimirRealtime() {
  _realtimeSuppressed = true;
  clearTimeout(window._realtimeSuppressTimer);
  window._realtimeSuppressTimer = setTimeout(function(){ _realtimeSuppressed = false; }, 2000);
}

function iniciarRealtime() {
  const evtUrl = `${SUPA_URL}/realtime/v1/websocket?apikey=${SUPA_KEY}&vsn=1.0.0`;
  const ws = new WebSocket(evtUrl.replace('https','wss').replace('http','ws'));

  ws.onopen = () => {
    // Subscribe to all changes in the DB
    const msg = JSON.stringify({
      topic: "realtime:public",
      event: "phx_join",
      payload: { config: { broadcast: { self: false }, presence: { key: "" }, postgres_changes: [
        { event: "*", schema: "public", table: "aptos" },
        { event: "*", schema: "public", table: "reservas" },
        { event: "*", schema: "public", table: "historial" },
        { event: "*", schema: "public", table: "usuarios" },
        { event: "*", schema: "public", table: "medios_pago" },
        { event: "*", schema: "public", table: "notas" },
        { event: "*", schema: "public", table: "gastos" },
      ]}},
      ref: "1"
    });
    ws.send(msg);
  };

  let reloadTimer = null;
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    // Heartbeat response
    if(msg.event === "heartbeat") {
      ws.send(JSON.stringify({ topic:"phoenix", event:"heartbeat", payload:{}, ref:"hb" }));
      return;
    }
    // Any DB change from another session → reload data
    if(msg.event === "postgres_changes" || (msg.payload?.data?.type && msg.topic !== "phoenix")) {
      // Debounce: wait 500ms in case multiple changes come at once
      // Skip if this change was triggered by ourselves
      if(_realtimeSuppressed) return;
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        cargarDatosQuiet(); // reload without showing login again
      }, 500);
    }
  };

  ws.onerror = () => {}; // silent fail — app still works without realtime
  ws.onclose = () => {
    // Reconnect after 5 seconds if connection drops
    setTimeout(iniciarRealtime, 5000);
  };
}

// Reload data silently (no loading overlay, no login prompt)
async function cargarDatosQuiet() {
  try {
    const [a,res,h,u,m,n,g] = await Promise.all([
      supa.get("aptos","order=id"),
      supa.get("reservas","order=fecha_desde"),
      supa.get("historial","order=fecha_cierre.desc"),
      supa.get("usuarios","order=id"),
      supa.get("medios_pago","order=id"),
      supa.get("notas","order=id"),
      supa.get("gastos","order=fecha.desc"),
    ]);
    aptos=a.map(dbApto); syncAptoSortOrder(); reservas=res.map(dbRes); historial=h.map(dbHist);
    usuarios=u.map(dbUser); mediosPago=m.map(r=>({id:r.id,nombre:r.nombre}));
    notas=n.map(dbNota); gastos=g.map(dbGasto);
    // Dedup por si la DB tiene duplicados
    reservas = reservas.filter((r,i,arr) => arr.findIndex(x=>x.id===r.id)===i);
    render();
    actualizarTempBadge();
  } catch(e) { /* silent */ }
}

// Fecha actual en header — click to switch user
(function() {
  const dias = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const mesesCortos = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const ahora = new Date();
  const texto = `${dias[ahora.getDay()]} ${ahora.getDate()} de ${mesesCortos[ahora.getMonth()]}. ${ahora.getFullYear()}`;
  const fechaEl = document.getElementById("fechaHoy");
  if(fechaEl) {
    fechaEl.textContent = texto;
    fechaEl.style.cursor = "pointer";
    fechaEl.title = "Clic para cambiar usuario";
    fechaEl.onclick = () => abrirLogin();
  }
})();

// Sello "generado" basado en la última edición del archivo
(function() {
  const el = document.getElementById("buildStamp");
  if(!el) return;
  const src = document.lastModified ? new Date(document.lastModified) : new Date();
  const d = isNaN(src.getTime()) ? new Date() : src;
  const pad = n => String(n).padStart(2,"0");
  const stamp = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  el.textContent = stamp;
})();



