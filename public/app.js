// Interface web (sans framework) : création, relecture du script, suivi des étapes, historique, réglages.
const $ = (s) => document.querySelector(s);
const state = { jobId: null, script: null, poll: null, editing: false };

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: opts.body instanceof FormData ? {} : { "Content-Type": "application/json" }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || { message: `Erreur ${res.status}` };
    throw Object.assign(new Error(e.message), e);
  }
  return data;
}

function toast(msg, ms = 3500) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add("hidden"), ms);
}
function showError(e) {
  toast(`❌ ${e.message}${e.hint ? " — " + e.hint : ""}`, 7000);
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------- statut / clés ----------
async function loadStatus() {
  const s = await api("/api/status");
  const miss = [];
  if (!s.keys.anthropic) miss.push("ANTHROPIC_API_KEY (script)");
  if (!s.keys.elevenlabs) miss.push("ELEVENLABS_API_KEY (voix)");
  const w = $("#keyWarn");
  if (miss.length) {
    w.innerHTML = `⚠️ Clé(s) manquante(s) : <b>${miss.join(", ")}</b>. Ajoutez-les dans le fichier <code>.env</code> (ou dans les variables de l'hébergeur) puis redémarrez. Voir le README.`;
    w.classList.remove("hidden");
  } else w.classList.add("hidden");
}

// ---------- création ----------
$("#btnCreate").onclick = async () => {
  const fact = $("#fact").value.trim();
  if (!fact) return toast("Écrivez d'abord un fait insolite 🙂");
  $("#btnCreate").disabled = true;
  try {
    const job = await api("/api/jobs", { method: "POST", body: JSON.stringify({ fact }) });
    $("#fact").value = "";
    openJob(job.id);
  } catch (e) {
    showError(e);
  } finally {
    $("#btnCreate").disabled = false;
  }
};

// ---------- job ----------
function openJob(id) {
  state.jobId = id;
  state.editing = false;
  state.filledFor = null;
  location.hash = `job/${id}`;
  $("#jobCard").classList.remove("hidden");
  $("#jobCard").scrollIntoView({ behavior: "smooth", block: "start" });
  refreshJob(true);
}
$("#btnCloseJob").onclick = () => {
  state.jobId = null;
  clearTimeout(state.poll);
  $("#jobCard").classList.add("hidden");
  location.hash = "";
};

const ACTIVE = ["scripting", "voicing", "rendering"];

async function refreshJob(first = false) {
  clearTimeout(state.poll);
  if (!state.jobId) return;
  let data;
  try {
    data = await api(`/api/jobs/${state.jobId}`);
  } catch (e) {
    showError(e);
    return;
  }
  const { job, script } = data;
  renderJob(job, script, first);
  if (ACTIVE.includes(job.status)) state.poll = setTimeout(() => refreshJob(), 1500);
  else loadHistory();
}

function renderJob(job, script, first) {
  $("#jobTitle").textContent = job.title || job.fact;
  const order = ["script", "voice", "render"];
  for (const li of document.querySelectorAll(".steps li")) {
    const st = li.dataset.step;
    const p = job.progress[st] || 0;
    li.querySelector("i").style.width = `${Math.round(p * 100)}%`;
    li.classList.toggle("done", p >= 1);
    li.classList.toggle("active", job.step === st && ACTIVE.includes(job.status));
  }
  $("#jobMsg").textContent = job.status === "error" ? "" : job.message;
  $("#jobWarnings").innerHTML = (job.warnings || []).map((w) => `<div class="warn">⚠️ ${esc(w)}</div>`).join("");

  const err = $("#jobError");
  if (job.status === "error" && job.error) {
    const step = { script: "le script", voice: "la voix", render: "le rendu" }[job.error.step] || "";
    let actions = "";
    if (job.error.step === "script") actions = `<button onclick="retryScript()">🔁 Relancer le script</button>`;
    else if (job.error.step === "render") actions = `<button onclick="rerender()">🔁 Relancer le rendu</button>`;
    err.innerHTML = `<b>Problème pendant ${step} : ${esc(job.error.message)}</b>${job.error.hint ? esc(job.error.hint) : ""}<div class="actions">${actions}</div>`;
    err.classList.remove("hidden");
  } else err.classList.add("hidden");

  const canEdit = script && (job.status === "script_ready" || (job.status === "error" && job.error?.step !== "script") || state.editing);
  $("#review").classList.toggle("hidden", !canEdit);
  if (canEdit && (first || state.filledFor !== job.id)) fillReview(script, job);

  const done = job.status === "done" && !state.editing;
  $("#result").classList.toggle("hidden", !done);
  if (done) {
    const v = `/files/${job.id}/video.mp4?v=${encodeURIComponent(job.updatedAt)}`;
    if ($("#player").dataset.src !== v) {
      $("#player").src = v;
      $("#player").dataset.src = v;
    }
    $("#dlVideo").href = `/files/${job.id}/video.mp4?dl=1`;
    $("#dlCaption").href = `/files/${job.id}/caption.txt?dl=1`;
    $("#captionText").textContent = script ? `${script.caption}\n\n${script.hashtags.join(" ")}` : "";
  }
}

window.retryScript = async () => {
  const job = (await api(`/api/jobs/${state.jobId}`)).job;
  try {
    const j = await api("/api/jobs", { method: "POST", body: JSON.stringify({ fact: job.fact }) });
    await api(`/api/jobs/${job.id}`, { method: "DELETE" }).catch(() => {});
    openJob(j.id);
  } catch (e) {
    showError(e);
  }
};
window.rerender = async () => {
  try {
    await api(`/api/jobs/${state.jobId}/rerender`, { method: "POST" });
    refreshJob();
  } catch (e) {
    showError(e);
  }
};
$("#btnRerender").onclick = () => window.rerender();
$("#btnEditAgain").onclick = () => {
  state.editing = true;
  refreshJob(true);
};
$("#btnCopy").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("#captionText").textContent);
    toast("Légende copiée ✅");
  } catch {
    toast("Copie impossible : sélectionnez le texte à la main.");
  }
};

// ---------- relecture du script ----------
const VERDICT = {
  correcto: "✅ Fait vérifié : correct",
  exagerado: "⚠️ Fait exagéré : reformulé correctement",
  falso: "❌ Fait faux : le script raconte la version correcte",
};

function fillReview(script, job) {
  state.script = script;
  state.filledFor = job.id;
  const v = script.verification || {};
  const vd = $("#verdict");
  vd.className = `verdict ${v.verdict || ""}`;
  vd.innerHTML = v.verdict
    ? `<b>${VERDICT[v.verdict] || v.verdict}</b><br>${esc(v.notes)}${v.correctedFact ? `<br><i>${esc(v.correctedFact)}</i>` : ""}`
    : "";
  $("#edTitle").value = script.title || "";
  $("#edCaption").value = script.caption || "";
  $("#edTags").value = (script.hashtags || []).join(" ");
  const box = $("#scenes");
  box.innerHTML = "";
  script.scenes.forEach((s, i) => box.appendChild(sceneEl(s, i)));
  updateWordInfo();
}

function sceneEl(s, i) {
  const d = document.createElement("div");
  d.className = "scene";
  d._scene = s;
  d.innerHTML = `
    <div class="top">
      <span class="num">${i + 1}</span>
      <input class="kw" value="${esc(s.keyword)}" placeholder="Mot-clé" />
      <input class="em" value="${esc(s.emoji)}" placeholder="😀" />
      <button class="del" title="Supprimer">🗑️</button>
    </div>
    <textarea class="tx" rows="2">${esc(s.text)}</textarea>
    <div class="ill">🎨 ${esc(s.illustration || "(pas d'illustration)")}</div>`;
  d.querySelector(".del").onclick = () => {
    d.remove();
    renumber();
  };
  d.querySelector(".tx").oninput = updateWordInfo;
  return d;
}
function renumber() {
  document.querySelectorAll("#scenes .scene .num").forEach((n, i) => (n.textContent = i + 1));
  updateWordInfo();
}
$("#btnAddScene").onclick = () => {
  $("#scenes").appendChild(sceneEl({ text: "", keyword: "", emoji: "✨", illustration: "", svg: "", number: null }, $("#scenes").children.length));
};

function collectScript() {
  const scenes = [...document.querySelectorAll("#scenes .scene")].map((d) => ({
    ...d._scene,
    text: d.querySelector(".tx").value.trim(),
    keyword: d.querySelector(".kw").value.trim(),
    emoji: d.querySelector(".em").value.trim() || "✨",
  }));
  return {
    ...state.script,
    title: $("#edTitle").value.trim(),
    caption: $("#edCaption").value.trim(),
    hashtags: $("#edTags").value.split(/[\s,]+/).filter(Boolean),
    scenes,
  };
}
function updateWordInfo() {
  const words = [...document.querySelectorAll("#scenes .tx")].map((t) => t.value.trim()).join(" ").split(/\s+/).filter(Boolean).length;
  const sec = Math.round(words / 2.8);
  $("#wordInfo").textContent = `${words} mots ≈ ${sec} s de voix${sec < 60 ? " (si l'audio fait moins de 60 s, le script sera rallongé automatiquement)" : ""}`;
}

document.querySelectorAll('input[name="vmode"]').forEach((r) => (r.onchange = () => $("#audioFile").classList.toggle("hidden", r.value !== "upload" || !r.checked)));

$("#btnProduce").onclick = async () => {
  const btn = $("#btnProduce");
  btn.disabled = true;
  try {
    await api(`/api/jobs/${state.jobId}/script`, { method: "PUT", body: JSON.stringify(collectScript()) });
    const mode = document.querySelector('input[name="vmode"]:checked').value;
    const fd = new FormData();
    fd.append("mode", mode);
    if (mode === "upload") {
      const f = $("#audioFile").files[0];
      if (!f) throw new Error("Choisissez d'abord votre fichier MP3.");
      fd.append("audio", f);
    }
    await api(`/api/jobs/${state.jobId}/produce`, { method: "POST", body: fd });
    state.editing = false;
    state.filledFor = null;
    refreshJob();
  } catch (e) {
    showError(e);
  } finally {
    btn.disabled = false;
  }
};

// ---------- historique ----------
const STATUS = { scripting: "script…", script_ready: "à relire", voicing: "voix…", rendering: "rendu…", done: "prête", error: "erreur" };
async function loadHistory() {
  const jobs = await api("/api/jobs").catch(() => []);
  const h = $("#history");
  if (!jobs.length) {
    h.innerHTML = `<p class="muted">Aucune vidéo pour l'instant.</p>`;
    return;
  }
  h.innerHTML = jobs
    .map(
      (j) => `<div class="hist" data-id="${j.id}">
        ${j.files?.thumb ? `<img loading="lazy" src="/files/${j.id}/thumb.jpg?v=${encodeURIComponent(j.updatedAt)}" alt="">` : `<div class="ph">🧪</div>`}
        <div class="meta"><b>${esc(j.title || j.fact)}</b>
        <span class="badge ${j.status}">${STATUS[j.status] || j.status}</span>
        ${j.duration ? ` ${j.duration.toFixed(0)} s` : ""}<br><span class="muted">${new Date(j.createdAt).toLocaleString()}</span>
        <br><button class="ghost small" data-del="${j.id}">Supprimer</button></div></div>`,
    )
    .join("");
  h.querySelectorAll(".hist").forEach((el) => (el.onclick = (ev) => {
    if (ev.target.dataset.del) return;
    openJob(el.dataset.id);
  }));
  h.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Supprimer cette vidéo ?")) return;
    try {
      await api(`/api/jobs/${b.dataset.del}`, { method: "DELETE" });
      if (state.jobId === b.dataset.del) $("#btnCloseJob").onclick();
      loadHistory();
    } catch (e) {
      showError(e);
    }
  }));
}

// ---------- réglages ----------
const form = $("#settingsForm");
function syncLabels() {
  $("#durVal").textContent = `${form.targetDuration.value} s`;
  $("#volVal").textContent = `${Math.round(form.musicVolume.value * 100)} %`;
  $("#speedVal").textContent = `x${form.voiceSpeed.value}`;
}
form.oninput = syncLabels;
$("#btnSettings").onclick = async () => {
  const s = await api("/api/settings");
  for (const [k, v] of Object.entries(s)) {
    const el = form.elements[k];
    if (!el) continue;
    if (el.type === "checkbox") el.checked = !!v;
    else el.value = v;
  }
  syncLabels();
  $("#settings").showModal();
};
$("#btnVoices").onclick = async () => {
  try {
    const voices = await api("/api/voices");
    const sel = $("#voiceList");
    sel.innerHTML = `<option value="">— choisir une voix (${voices.length}) —</option>` + voices.map((v) => `<option value="${esc(v.id)}">${esc(v.name)} — ${esc(v.labels)}</option>`).join("");
    sel.classList.remove("hidden");
    sel.onchange = () => sel.value && (form.voiceId.value = sel.value);
  } catch (e) {
    showError(e);
  }
};
$("#settings").addEventListener("close", async () => {
  if ($("#settings").returnValue !== "save") return;
  const body = {
    voiceId: form.voiceId.value.trim(),
    voiceModel: form.voiceModel.value,
    voiceSpeed: Number(form.voiceSpeed.value),
    targetDuration: Number(form.targetDuration.value),
    music: form.music.checked,
    musicVolume: Number(form.musicVolume.value),
    sfx: form.sfx.checked,
  };
  try {
    await api("/api/settings", { method: "PUT", body: JSON.stringify(body) });
    toast("Réglages enregistrés ✅");
  } catch (e) {
    showError(e);
  }
});

// ---------- démarrage ----------
loadStatus().catch(() => {});
loadHistory();
function fromHash() {
  const m = location.hash.match(/^#job\/([\w-]+)/);
  if (m && m[1] !== state.jobId) openJob(m[1]);
}
window.addEventListener("hashchange", fromHash);
fromHash();
