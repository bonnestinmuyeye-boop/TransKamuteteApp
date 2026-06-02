let currentUser = null;
let selectedClientChatPhone = null;

// VARIABLES PILOTES DU CAPTEUR MICROPHONE ET DU LECTEUR AUDIO
let audioRecorder = null;
let audioChunks = [];
let isRecording = false;
let globalChatUnsubscribe = null;

document.addEventListener("DOMContentLoaded", () => {
    setTimeout(async () => {
        document.getElementById('splashScreen').classList.add('hidden');
        document.getElementById('mainAppContainer').classList.remove('hidden');
        await verifyAndInitAdminRoot();

        const session = localStorage.getItem('deviceSessionUser');
        if (session) {
            currentUser = JSON.parse(session);
            redirectUserToDashboard(currentUser.role);
        } else {
            switchScreen('loginScreen');
        }
        initSystemListeners();
    }, 2000); 
});

function initSystemListeners() {
    updateKiloDisplay();
    if (window.db && window.fs) {
        window.fs.onSnapshot(window.fs.collection(window.db, "users"), (snapshot) => {
            renderStaffLists(snapshot);
            renderAdminChatUserList(snapshot);
        });
        window.fs.onSnapshot(window.fs.collection(window.db, "colis"), (snapshot) => {
            renderConvoyeurColis(snapshot);
            renderAdminGlobalColisList(snapshot);
        });
        window.fs.onSnapshot(window.fs.doc(window.db, "config", "tarifs"), (docSnap) => {
            if (docSnap.exists()) {
                const price = docSnap.data().kiloPrice || "2500";
                localStorage.setItem('kiloPrice', price);
                applyKiloDOMUpdates(price);
            }
        });
    }
}

async function verifyAndInitAdminRoot() {
    try {
        await window.fs.setDoc(window.fs.doc(window.db, "users", "+243000000000"), {
            role: 'admin', name: 'Directeur Général', email: 'admin@gmail.com', phone: '+243000000000', password: 'admin1234'
        });
    } catch (e) { console.log("L'initialisation root de sécurité a été traitée."); }
}

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
}

function togglePasswordVisibility(fieldId) {
    const input = document.getElementById(fieldId);
    input.type = input.type === "password" ? "text" : "password";
}

// ROUTAGE DES ONGLETS DE NAVIGATION PAR ACTEUR
function switchAdminTab(tabId) {
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('.admin-nav-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.remove('hidden');
    event.currentTarget.classList.add('active');
}

function switchClientTab(tabId) {
    document.querySelectorAll('.client-tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('#clientDashboard .tabs-navigation .tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.remove('hidden');
    if(tabId === 'trackTab') document.getElementById('btnTabTrack').classList.add('active');
    if(tabId === 'chatTab') { document.getElementById('btnTabChat').classList.add('active'); scrollChatToBottom('clientMessageArea'); }
}

function switchGuichetierTab(tabId) {
    document.querySelectorAll('.guichetier-tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('#guichetierDashboard .tabs-navigation .tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.remove('hidden');
    if(tabId === 'guichetFormTab') document.getElementById('btnTabGuichetForm').classList.add('active');
    if(tabId === 'guichetChatTab') { document.getElementById('btnTabGuichetChat').classList.add('active'); scrollChatToBottom('guichetierMessageArea'); }
}

function switchConvoyeurTab(tabId) {
    document.querySelectorAll('.convoyeur-tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('#convoyeurDashboard .tabs-navigation .tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.remove('hidden');
    if(tabId === 'convoyeurListTab') document.getElementById('btnTabConvoyeurList').classList.add('active');
    if(tabId === 'convoyeurChatTab') { document.getElementById('btnTabConvoyeurChat').classList.add('active'); scrollChatToBottom('convoyeurMessageArea'); }
}

// SÉCURISATION D'ACCÈS ET SYNC FIREBASE
const GMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
const RDC_PHONE_REGEX = /^\+243\d{9}$/;

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const phone = document.getElementById('loginPhone').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
        const docSnap = await window.fs.getDoc(window.fs.doc(window.db, "users", phone));
        if (docSnap.exists() && docSnap.data().email === email && docSnap.data().password === password) {
            currentUser = docSnap.data();
            localStorage.setItem('deviceSessionUser', JSON.stringify(currentUser));
            redirectUserToDashboard(currentUser.role);
        } else { alert("Accès refusé. Informations incorrectes."); }
    } catch (e) { alert("Erreur réseau de communication cloud."); }
}

async function handleRegister(event) {
    event.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value;

    if(!GMAIL_REGEX.test(email) || !RDC_PHONE_REGEX.test(phone)) { alert("Format email ou numéro de téléphone RDC invalide."); return; }

    try {
        const uDoc = { role: 'client', name, email, phone, password };
        await window.fs.setDoc(window.fs.doc(window.db, "users", phone), uDoc);
        document.getElementById('popEmail').innerText = email;
        document.getElementById('popPhone').innerText = phone;
        document.getElementById('popPass').innerText = password;
        document.getElementById('confirmationPopup').classList.remove('hidden');
    } catch(e) { alert("Le serveur Cloud Firebase a rejeté l'enregistrement."); }
}

function closeConfirmationPopup() {
    document.getElementById('confirmationPopup').classList.add('hidden');
    switchScreen('loginScreen');
}

function redirectUserToDashboard(role) {
    document.getElementById('logoutBtn').classList.remove('hidden');
    if (role === 'admin') switchScreen('adminDashboard');
    if (role === 'guichetier') { switchScreen('guichetierDashboard'); switchGuichetierTab('guichetFormTab'); initStaffChatListener('guichetierMessageArea'); }
    if (role === 'convoyeur') { switchScreen('convoyeurDashboard'); switchConvoyeurTab('convoyeurListTab'); initStaffChatListener('convoyeurMessageArea'); }
    if (role === 'client') { document.getElementById('clientNameHeader').innerText = currentUser.name; switchScreen('clientDashboard'); switchClientTab('trackTab'); initStaffChatListener('clientMessageArea'); }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('deviceSessionUser');
    document.getElementById('logoutBtn').classList.add('hidden');
    switchScreen('loginScreen');
}

// GESTION AGENTS ET CONFIGURATION DES TARIFS
async function handleStaffSubmit(event, role) {
    event.preventDefault();
    const name = document.getElementById(`${role}Name`).value.trim();
    const ville = document.getElementById(`${role}Ville`).value.trim();
    const email = document.getElementById(`${role}Email`).value.trim();
    const phone = document.getElementById(`${role}Phone`).value.trim();
    const password = document.getElementById(`${role}Password`).value;

    try {
        await window.fs.setDoc(window.fs.doc(window.db, "users", phone), { role, name, ville, email, phone, password });
        alert(`L'agent ${role} a été enregistré avec succès au registre cloud.`);
        event.target.reset();
    } catch(e) { alert("Échec de synchronisation de l'agent."); }
}

function renderStaffLists(snapshot) {
    const gList = document.getElementById('guichetierList');
    const cList = document.getElementById('convoyeurList');
    if(gList) gList.innerHTML = ''; if(cList) cList.innerHTML = '';

    snapshot.forEach(doc => {
        const u = doc.data();
        if(u.role === 'admin') return;
        const li = document.createElement('li');
        li.innerHTML = `<div style="text-align:left;"><strong>${u.name}</strong> (${u.role.toUpperCase()})<br><small>${u.phone} - Bureau: ${u.ville || 'Non spécifié'}</small></div>
            <button onclick="window.fs.deleteDoc(window.fs.doc(window.db, 'users', '${u.phone}'))" class="btn-danger" style="padding:4px 8px; font-size:0.75rem; border-radius:6px;">Suppr</button>`;
        if(u.role === 'guichetier' && gList) gList.appendChild(li);
        if(u.role === 'convoyeur' && cList) cList.appendChild(li);
    });
}

async function handleKiloSubmit(event) {
    event.preventDefault();
    const v = document.getElementById('inputPriceKilo').value;
    await window.fs.setDoc(window.fs.doc(window.db, "config", "tarifs"), { kiloPrice: v });
    event.target.reset();
}
function updateKiloDisplay() { applyKiloDOMUpdates(localStorage.getItem('kiloPrice') || '2500'); }
function applyKiloDOMUpdates(p) {
    if(document.getElementById('displayAdminKiloPrice')) document.getElementById('displayAdminKiloPrice').innerText = p;
    if(document.getElementById('currentKiloRateLabel')) document.getElementById('currentKiloRateLabel').innerText = p;
}

// LOGISTIQUE ET EMISSION DES FLUX
function calculerPrix() {
    const p = document.getElementById('colisPoids').value;
    const r = localStorage.getItem('kiloPrice') || 2500;
    document.getElementById('prixCalcule').innerText = p ? p * r : 0;
}

async function createColis(event) {
    event.preventDefault();
    const code = `TK-${Math.floor(100 + Math.random() * 900)}`;
    const docData = {
        code, nature: document.getElementById('colisNature').value,
        poids: document.getElementById('colisPoids').value,
        destinataire: document.getElementById('colisDestinataire').value,
        destPhone: document.getElementById('colisDestPhone').value,
        prix: document.getElementById('prixCalcule').innerText,
        statut: 'Enregistré au dépôt initial', timestamp: Date.now()
    };
    await window.fs.setDoc(window.fs.doc(window.db, "colis", code), docData);
    alert("Bordereau émis avec succès ! Code unique : " + code);
    event.target.reset();
}

function renderConvoyeurColis(snapshot) {
    const container = document.getElementById('convoyeurColisList');
    if(!container) return; container.innerHTML = '';
    snapshot.forEach(doc => {
        const c = doc.data();
        const d = document.createElement('div');
        d.className = 'admin-card';
        d.style.textAlign = 'left';
        d.innerHTML = `<strong>Code: ${c.code}</strong> - Nature: ${c.nature}<br><small>Statut Actuel: <b style="color:var(--primary);">${c.statut}</b></small>
            <select onchange="window.fs.updateDoc(window.fs.doc(window.db, 'colis', '${c.code}'), {statut: this.value})" style="margin-top:8px;">
                <option value="">-- Mettre à jour la feuille de route --</option>
                <option value="En transit (Sur route)">En transit (Sur route)</option>
                <option value="Arrivé au dépôt de destination">Arrivé au dépôt de destination</option>
                <option value="Livré au destinataire final">Livré au destinataire final</option>
            </select>`;
        container.appendChild(d);
    });
}

function renderAdminGlobalColisList(snapshot) {
    const container = document.getElementById('adminGlobalColisContainer');
    if(!container) return; container.innerHTML = '';
    snapshot.forEach(doc => {
        const c = doc.data();
        const div = document.createElement('div');
        div.className = 'admin-card';
        div.style.fontSize = "0.85rem";
        div.style.textAlign = "left";
        div.innerHTML = `📦 <strong>Code: ${c.code}</strong> | ${c.nature} (${c.poids} Kg)<br>Suivi de traçabilité : <b>${c.statut}</b><br>
            <button onclick="window.fs.deleteDoc(window.fs.doc(window.db, 'colis', '${c.code}'))" class="btn-danger" style="padding:4px 8px; font-size:0.7rem; margin-top:6px; border-radius:6px;">Archiver et Purger</button>`;
        container.appendChild(div);
    });
}

async function trackColis() {
    const code = document.getElementById('trackCodeInput').value.trim().toUpperCase();
    const res = document.getElementById('trackingResult');
    res.classList.remove('hidden');
    const snap = await window.fs.getDoc(window.fs.doc(window.db, "colis", code));
    if(snap.exists()) {
        const c = snap.data();
        res.innerHTML = `<h5 style="margin:0 0 6px 0; color:var(--success);">Colis Authentifié ${c.code}</h5><p style="margin:4px 0;">Nature: <b>${c.nature}</b></p><p style="margin:4px 0;">État d'avancement: <b style="color:var(--primary);">${c.statut}</b></p>`;
    } else { res.innerHTML = "<span style='color:var(--danger); font-weight:bold;'>Référence introuvable sur le réseau Trans Kamutete.</span>"; }
}

// =========================================================================
// INTERFACE DE MESSAGERIE MULTI-CANAUX ET TRAITEMENT MICROPHONE SÉCURISÉ
// =========================================================================

function initStaffChatListener(areaId) {
    if (globalChatUnsubscribe) globalChatUnsubscribe();
    if (!currentUser) return;

    const q = window.fs.query(window.fs.collection(window.db, "chats", currentUser.phone, "messages"), window.fs.orderBy("timestamp", "asc"));
    globalChatUnsubscribe = window.fs.onSnapshot(q, (snapshot) => {
        const area = document.getElementById(areaId);
        if (!area) return; area.innerHTML = '';
        snapshot.forEach(doc => renderMessageBubble(doc.data(), currentUser.phone, area));
        area.scrollTop = area.scrollHeight;
    });
}

function renderAdminChatUserList(snapshot) {
    const container = document.getElementById('adminChatUserList');
    if (!container) return; container.innerHTML = '';
    snapshot.forEach(doc => {
        const u = doc.data();
        if (u.role === 'admin') return;
        const div = document.createElement('div');
        div.className = `chat-user-item ${selectedClientChatPhone === u.phone ? 'active' : ''}`;
        div.onclick = () => openAdminChat(u.phone, u.name, u.role);
        div.innerHTML = `<span class="chat-user-item-name">${u.name}</span>
                         <span class="chat-user-item-role">${u.role.toUpperCase()} - ${u.phone}</span>`;
        container.appendChild(div);
    });
}

function openAdminChat(phone, name, role) {
    selectedClientChatPhone = phone;
    document.getElementById('adminChatPlaceholder').classList.add('hidden');
    document.getElementById('adminChatMainZone').classList.remove('hidden');
    document.getElementById('adminSelectedClientName').innerText = name + ` (${role.toUpperCase()})`;
    document.getElementById('adminSelectedClientPhone').innerText = phone;

    if (globalChatUnsubscribe) globalChatUnsubscribe();
    const q = window.fs.query(window.fs.collection(window.db, "chats", phone, "messages"), window.fs.orderBy("timestamp", "asc"));
    globalChatUnsubscribe = window.fs.onSnapshot(q, (snapshot) => {
        const area = document.getElementById('adminMessageArea');
        area.innerHTML = '';
        snapshot.forEach(doc => renderMessageBubble(doc.data(), 'admin', area));
        area.scrollTop = area.scrollHeight;
    });
}

function renderMessageBubble(m, localRole, area) {
    const b = document.createElement('div');
    const isOutgoing = (localRole === 'admin' && m.sender === 'admin') || (localRole !== 'admin' && m.sender !== 'admin');
    b.className = `msg-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`;
    const t = new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    if (m.type === 'audio') {
        b.innerHTML = `<audio src="${m.audioData}" controls style="max-width:100%; display:block; margin-bottom:4px;"></audio><span class="msg-time">${t}</span>`;
    } else {
        b.innerHTML = `${m.text}<span class="msg-time">${t}</span>`;
    }
    area.appendChild(b);
}

async function sendChatMessage(role) {
    const inputId = role === 'admin' ? 'adminChatInput' : `${role}ChatInput`;
    const input = document.getElementById(inputId);
    if (!input || !input.value.trim()) return;

    const p = role === 'admin' ? selectedClientChatPhone : currentUser.phone;
    await window.fs.addDoc(window.fs.collection(window.db, "chats", p, "messages"), {
        sender: role === 'admin' ? 'admin' : currentUser.phone,
        text: input.value.trim(), type: 'text', timestamp: Date.now()
    });
    input.value = '';
}

// CODE MAÎTRE D'ENREGISTREMENT AUDIO DIRECT DEPUIS LE MATÉRIEL MOBILE
async function toggleAudioRecording(role) {
    const btn = document.getElementById(`btnAudio-${role}`);
    const targetPhone = role === 'admin' ? selectedClientChatPhone : currentUser.phone;
    if(!targetPhone) { alert("Veuillez sélectionner un canal de discussion actif."); return; }

    if (!isRecording) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("L'enregistrement audio matériel n'est pas activé ou supporté par ce navigateur mobile.");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];
            audioRecorder = new MediaRecorder(stream);
            
            audioRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
            audioRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob); 
                reader.onloadend = async () => {
                    const base64Audio = reader.result;
                    await window.fs.addDoc(window.fs.collection(window.db, "chats", targetPhone, "messages"), {
                        sender: role === 'admin' ? 'admin' : currentUser.phone,
                        type: 'audio', audioData: base64Audio, timestamp: Date.now()
                    });
                };
                stream.getTracks().forEach(track => track.stop()); // Libère le micro physiquement
            };

            audioRecorder.start();
            isRecording = true;
            btn.classList.add('recording');
            btn.innerText = "🛑";
        } catch (err) { alert("Autorisation d'accès au micro refusée."); }
    } else {
        if (audioRecorder && audioRecorder.state !== "inactive") {
            audioRecorder.stop();
        }
        isRecording = false;
        btn.classList.remove('recording');
        btn.innerText = "🎙️";
    }
}

function scrollChatToBottom(id) { const e = document.getElementById(id); if(e) e.scrollTop = e.scrollHeight; }
