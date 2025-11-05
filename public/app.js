const $ = (s)=>document.querySelector(s);
const $$ = (s)=>document.querySelectorAll(s);

// toasts
function toast(msg, type=""){
  const box = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(()=> el.remove(), 3000);
}

function toISOFromLocalInput(value){
  if(!value) return null;
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString();
}

/* ---------- Tabs (Rooms/New Room) ---------- */
function switchTab(key){
  const roomsTab = $("#roomsTab");
  const newRoomTab = $("#newRoomTab");
  $$(".tab").forEach(t=>t.classList.toggle("active", t.dataset.tab === key));
  roomsTab.hidden = key !== "rooms";
  newRoomTab.hidden = key !== "new-room";
}
$$(".tab").forEach(t=> t.addEventListener("click", ()=> switchTab(t.dataset.tab)));

/* ---------- Ressourcen ---------- */
async function loadResources(){
  const ul = $("#resList");
  ul.innerHTML = `<li class="item"><span class="item-sub">Lade…</span></li>`;
  try{
    const res = await fetch("/api/resources");
    if(!res.ok) throw new Error("HTTP "+res.status);
    const data = await res.json();
    ul.innerHTML = "";
    const selNew = $("#b-resource");
    const selFilter = $("#f-resource");
    selNew.innerHTML = "";
    selFilter.innerHTML = `<option value="">Alle Ressourcen</option>`;

    if(!Array.isArray(data) || data.length===0){
      ul.innerHTML = `<li class="item"><span class="item-sub">Noch keine Räume angelegt.</span></li>`;
    } else {
      data.forEach(r=>{
        const li = document.createElement("li");
        li.className = "item";
        li.innerHTML = `
          <div>
            <div class="item-title">${r.name}</div>
            <div class="item-sub">${r.location ?? "–"} • ${r.capacity ?? "–"} Plätze • ID ${r.id}</div>
          </div>
          <span class="badge ${r.active?'ok':'muted'}">${r.active?'aktiv':'inaktiv'}</span>
        `;
        ul.appendChild(li);

        const opt = document.createElement("option");
        opt.value = r.id; opt.textContent = `${r.name} (ID ${r.id})`;
        selNew.appendChild(opt);

        const opt2 = opt.cloneNode(true);
        selFilter.appendChild(opt2);
      });
      if (!selNew.value && selNew.options.length>0) selNew.selectedIndex = 0;
    }
  }catch(e){
    console.error(e);
    ul.innerHTML = `<li class="item"><span class="item-sub">Fehler beim Laden.</span></li>`;
    toast("Räume konnten nicht geladen werden","err");
  }
}

$("#resourceForm")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const name = $("#r-name").value.trim();
  const location = $("#r-location").value.trim() || null;
  const capacity = $("#r-capacity").value ? Number($("#r-capacity").value) : null;
  if(!name) return toast("Name ist erforderlich","err");

  const res = await fetch("/api/resources",{
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ name, location, capacity })
  });
  if(!res.ok){
    const err = await res.json().catch(()=>({}));
    return toast(`Fehler: ${err.error || res.status}`,"err");
  }
  toast("Raum angelegt","ok");
  e.target.reset();
  switchTab("rooms");
  await loadResources();
});
$("#resRefresh").addEventListener("click", loadResources);

/* ---------- Buchungen ---------- */
async function loadBookings(){
  const ul = $("#bkList");
  ul.innerHTML = `<li class="item"><span class="item-sub">Lade…</span></li>`;

  const rid  = $("#f-resource").value;
  const from = $("#f-from").value ? new Date($("#f-from").value).toISOString() : "";
  const to   = $("#f-to").value   ? new Date($("#f-to").value).toISOString()   : "";

  const qs = new URLSearchParams();
  if (rid)  qs.set("rid", rid);
  if (from) qs.set("from", from);
  if (to)   qs.set("to", to);
  if ($("#f-cancelled").checked) qs.set("includeCancelled", "1");

  try{
    const res = await fetch("/api/bookings" + (qs.toString()?`?${qs.toString()}`:""));
    if(!res.ok) throw new Error("HTTP "+res.status);
    const data = await res.json();
    ul.innerHTML = "";

    if(!Array.isArray(data) || data.length===0){
      ul.innerHTML = `<li class="item"><span class="item-sub">Keine Buchungen gefunden.</span></li>`;
      return;
    }

    data.forEach(b=>{
      const li = document.createElement("li");
      li.className = "item";
      const isCancelled = b.status !== "confirmed";
      const start = new Date(b.startAt).toLocaleString();
      const end   = new Date(b.endAt).toLocaleString();
      if(isCancelled) li.style.opacity = .6;

      li.innerHTML = `
        <div>
          <div class="item-title">${b.title}</div>
          <div class="item-sub">Ressource ${b.resourceId} • ${start} – ${end} • Status:
            <span class="badge ${isCancelled?'muted':'ok'}">${b.status}</span>
          </div>
        </div>
        <div style="display:flex;gap:.45rem;">
          <button class="btn-ghost" data-cancel="${b.id}" ${isCancelled?"disabled":""}>Stornieren</button>
        </div>
      `;
      ul.appendChild(li);
    });

    // Stornieren
    $$("#bkList [data-cancel]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const id = btn.getAttribute("data-cancel");
        if(!confirm("Buchung wirklich stornieren?")) return;
        const res = await fetch(`/api/bookings/${id}`, { method:"DELETE" });
        if(res.ok){ toast("Buchung storniert","ok"); loadBookings(); }
        else { const err = await res.json().catch(()=>({})); toast(`Fehler: ${err.error || res.status}`,"err"); }
      });
    });
  }catch(e){
    console.error(e);
    ul.innerHTML = `<li class="item"><span class="item-sub">Fehler beim Laden.</span></li>`;
    toast("Buchungen konnten nicht geladen werden","err");
  }
}

$("#bkRefresh").addEventListener("click", loadBookings);
$("#reloadBtn").addEventListener("click", ()=>{ loadResources(); loadBookings(); });

/* ---------- Dialog „Neue Buchung“ ---------- */
const dlg = $("#bookingDlg");
$("#newBookingBtn").addEventListener("click", ()=>{
  // Defaults setzen (jetzt und +1h)
  const now = new Date(); now.setMinutes(0,0,0);
  const plus1 = new Date(now.getTime()+60*60*1000);
  $("#b-start").value = new Date(now.getTime() - now.getTimezoneOffset()*60000).toISOString().slice(0,16);
  $("#b-end").value   = new Date(plus1.getTime() - plus1.getTimezoneOffset()*60000).toISOString().slice(0,16);
  dlg.showModal();
});
$("#dlgClose").addEventListener("click", ()=> dlg.close());
$("#dlgCancel").addEventListener("click", ()=> dlg.close());

$("#bookingForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const resourceId = Number($("#b-resource").value);
  const title = $("#b-title").value.trim();
  const startAt = toISOFromLocalInput($("#b-start").value);
  const endAt   = toISOFromLocalInput($("#b-end").value);
  const createdBy = $("#b-user").value.trim();

  if(!resourceId || !title || !startAt || !endAt || !createdBy){
    return toast("Bitte alle Pflichtfelder ausfüllen.","err");
  }
  if(new Date(endAt) <= new Date(startAt)){
    return toast("Ende muss nach Start liegen.","err");
  }

  const res = await fetch("/api/bookings", {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ resourceId, title, startAt, endAt, createdBy })
  });

  if(res.status===409){
    const err = await res.json().catch(()=>({}));
    return toast(`Konflikt: ${err.error || "Zeit überschneidet sich."}`,"err");
  }
  if(!res.ok){
    const err = await res.json().catch(()=>({}));
    return toast(`Fehler: ${err.error || res.status}`,"err");
  }

  toast("Buchung erstellt","ok");
  dlg.close();
  $("#bookingForm").reset();
  await loadBookings();
});

/* ---------- Initial ---------- */
document.addEventListener("DOMContentLoaded", async ()=>{
  switchTab("rooms");
  await loadResources();
  await loadBookings();
});
