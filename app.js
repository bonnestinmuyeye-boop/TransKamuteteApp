// ==========================================
// CENTRALISATION ET SYNCHRONISATION CLOUD (FIRESTORE)
// ==========================================
let currentUser = null;
let isEditingStaff = false;
let selectedClientChatPhone = null; // ID de la discussion active coté admin

// VARIABLES LOGICIELLES CAPTURE AUDIO HARWARE RÉEL
let hardwareAudioRecorder = null;
let compiledAudioChunks = [];
let isHardwareRecordingActive = false;

// INTERCEPTOR : APPLICATION LIFECYCLE
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
    }, 2500); 
});

// ÉCOUTEURS TEMPS RÉEL GLOBALISÉS (FIRESTORE STREAMING)
function initSystemListeners() {
    updateKiloDisplay();
    
    if (window.db && window.fs) {
        // Écoute dynamique globale des agents et clients
        window.fs.onSnapshot(window.fs.collection(window.db, "users"), (snapshot) => {
            renderStaffLists(snapshot);
            renderAdminChatUserList(snapshot);
        });

        // Écoute dynamique globale des colis
        window.fs.onSnapshot(window.fs.collection(window.db, "colis"), (snapshot) => {
            renderConvoyeurColis(snapshot);
            renderAdminGlobalColisList(snapshot);
        });

        // Écoute dynamique des variations du prix du kilo
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
        const adminDoc = await window.fs.getDoc(window.fs.doc(window.db, "users", "+243000000000"));
        if (!adminDoc.exists()) {
            await window.fs.setDoc(window.fs.doc(window.db, "users", "+243000000000"), {
                role: 'admin', name: 'Directeur Général', email: 'admin@gmail.com', phone: '+243000000000', password: 'admin1234'
            });
        }
    } catch (e) { console.error("Erreur d'init root."); }
}

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
}

// ENGINE DE VALIDATION
const GMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
const RDC_PHONE_REGEX = /^\+243\d{9}$/;

function validateField(fieldId, regex, errorMessage) {
    const input = document.getElementById(fieldId);
    const errorSpan = document.getElementById(`error-${fieldId}`);
    if (!input || !errorSpan) return true;

    if (!regex.test(input.value.trim())) {
        input.classList.add('input-error');
        errorSpan.innerText = errorMessage;
        return false;
    } else {
        input.classList.remove('input-error');
        errorSpan.innerText = '';
        return true;
    }
}

function togglePasswordVisibility(fieldId) {
    const input = document.getElementById(fieldId);
    input.type = input.type === "password" ? "text" : "password";
}

// AUTHENTIFICATION
async function handleLogin(event) {
    event.preventDefault();
    if (!validateField('loginEmail', GMAIL_REGEX, "Format requis : @gmail.com") ||
        !validateField('loginPhone', RDC_PHONE_REGEX, "Format requis : +243XXXXXXXXX")) return;

    const email = document.getElementById('loginEmail').value.trim();
    const phone = document.getElementById('loginPhone').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
        const docRef = window.fs.doc(window.db, "users", phone);
        const docSnap = await window.fs.getDoc(docRef);

        if (docSnap.exists()) {
            const user = docSnap.data();
            if (user.email === email && user.password === password) {
                currentUser = user;
                localStorage.setItem('deviceSessionUser', JSON.stringify(user));
                redirectUserToDashboard(user.role);
                document.querySelectorAll('form').forEach(f => f.reset()); 
                return;
            }
        }
        alert("Accès refusé. Les identifiants saisis ne concordent pas sur le serveur central.");
    } catch (e) { alert("Erreur de connexion réseau avec la base de données."); }
}

async function handleRegister(event) {
    event.preventDefault();
    if (!validateField('regEmail', GMAIL_REGEX, "Utiliser un compte @gmail.com") ||
        !validateField('regPhone', RDC_PHONE_REGEX, "Numéro invalide (13 caractères)")) return;

    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value;

    try {
        const docRef = window.fs.doc(window.db, "users", phone);
        const docSnap = await window.fs.getDoc(docRef);

        if (docSnap.exists()) {
            alert("Ce numéro de téléphone est déjà relié à un compte.");
            return;
        }

        const newClient = { role: 'client', name, email, phone, password };
        await window.fs.setDoc(docRef, newClient);

        document.getElementById('popEmail').innerText = email;
        document.getElementById('popPhone').innerText = phone;
        document.getElementById('popPass').innerText = password;
        document.getElementById('confirmationPopup').classList.remove('hidden');
        
        document.querySelectorAll('form').forEach(f => f.reset());
    } catch(e) { alert("Impossible d'atteindre le serveur Cloud."); }
}

function closeConfirmationPopup() {
    document.getElementById('confirmationPopup').classList.add('hidden');
    switchScreen('loginScreen');
}

function redirectUserToDashboard(role) {
    document.getElementById('logoutBtn').classList.remove('hidden');
    if (role === 'admin') {
        switchScreen('adminDashboard');
    } else if (role === 'guichetier') {
        updateKiloDisplay();
        switchScreen('guichetierDashboard');
        switchGuichetierTab('guichetFormTab');
        initUnifiedChatStreaming('guichetierMessageArea');
    } else if (role === 'convoyeur') {
        switchScreen('convoyeurDashboard');
        switchConvoyeurTab('convoyeurListTab');
        initUnifiedChatStreaming('convoyeurMessageArea');
    } else if (role === 'client') {
        document.getElementById('clientNameHeader').innerText = currentUser.name;
        switchScreen('clientDashboard');
        switchClientTab('trackTab');
        initUnifiedChatStreaming('clientMessageArea');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('deviceSessionUser');
    document.getElementById('logoutBtn').classList.add('hidden');
    switchScreen('loginScreen');
}

// NAVIGATION DES TABS INTERNES
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
    if(tabId === 'chatTab') {
        document.getElementById('btnTabChat').classList.add('active');
        scrollChatToBottom('clientMessageArea');
    }
}

function switchGuichetierTab(tabId) {
    document.querySelectorAll('.guichetier-tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('#guichetierDashboard .tabs-navigation .tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.remove('hidden');
    if(tabId === 'guichetFormTab') document.getElementById('btnTabGuichetForm').classList.add('active');
    if(tabId === 'guichetChatTab') {
        document.getElementById('btnTabGuichetChat').classList.add('active');
        scrollChatToBottom('guichetierMessageArea');
    }
}

function switchConvoyeurTab(tabId) {
    document.querySelectorAll('.convoyeur-tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('#convoyeurDashboard .tabs-navigation .tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.remove('hidden');
    if(tabId === 'convoyeurListTab') document.getElementById('btnTabConvoyeurList').classList.add('active');
    if(tabId === 'convoyeurChatTab') {
        document.getElementById('btnTabConvoyeurChat').classList.add('active');
        scrollChatToBottom('convoyeurMessageArea');
    }
}

// AGENTS MANAGEMENT LOGIC
async function handleStaffSubmit(event, targetRole) {
    event.preventDefault();
    const pfx = targetRole;
    
    const name = document.getElementById(`${pfx}Name`).value.trim();
    const ville = document.getElementById(`${pfx}Ville`).value.trim();
    const email = document.getElementById(`${pfx}Email`).value.trim();
    const phone = document.getElementById(`${pfx}Phone`).value.trim();
    const password = document.getElementById(`${pfx}Password`).value;

    if (!GMAIL_REGEX.test(email) || !RDC_PHONE_REGEX.test(phone)) {
        alert("Contraintes de saisie non respectées.");
        return;
    }

    try {
        if (isEditingStaff) {
            const oldPhone = document.getElementById(`edit${pfx.charAt(0).toUpperCase() + pfx.slice(1)}OldPhone`).value;
            if (oldPhone !== phone) {
                await window.fs.deleteDoc(window.fs.doc(window.db, "users", oldPhone));
            }
        }

        await window.fs.setDoc(window.fs.doc(window.db, "users", phone), {
            role: targetRole, name, ville, email, phone, password
        });

        alert("Données de l'agent synchronisées avec succès.");
        cancelStaffEdit(targetRole);
        event.target.reset();
    } catch(e) { alert("Erreur lors de la synchronisation avec le Cloud."); }
}

function cancelStaffEdit(role) {
    isEditingStaff = false;
    const pfx = role;
    const cap = role.charAt(0).toUpperCase() + role.slice(1);
    document.getElementById(`${pfx}FormTitle`).innerText = `Ajouter un ${cap}`;
    document.querySelector(`#${pfx}Tab form`).reset();
}

function renderStaffLists(snapshot) {
    const gList = document.getElementById('guichetierList');
    const cList = document.getElementById('convoyeurList');
    
    if (gList) gList.innerHTML = '';
    if (cList) cList.innerHTML = '';

    snapshot.forEach((doc) => {
        const u = doc.data();
        if(u.role === 'admin') return;
        const li = document.createElement('li');
        li.innerHTML = `<div><strong>${u.name}</strong><br><small>${u.ville || 'Non spécifiée'} | ${u.phone}</small></div>
            <div class="action-group">
                <button onclick="window.fs.deleteDoc(window.fs.doc(window.db, 'users', '${u.phone}'))" class="btn-danger btn-small">Suppr</button>
            </div>`;
        
        if (u.role === 'guichetier' && gList) gList.appendChild(li);
        if (u.role === 'convoyeur' && cList) cList.appendChild(li);
    });
}

// CONFIGURATION TARIFS
async function handleKiloSubmit(event) {
    event.preventDefault();
    const newPrice = document.getElementById('inputPriceKilo').value;
    if(newPrice <= 0) return;
    await window.fs.setDoc(window.fs.doc(window.db, "config", "tarifs"), { kiloPrice: newPrice });
    event.target.reset();
}

async function deleteKiloPrice() {
    await window.fs.setDoc(window.fs.doc(window.db, "config", "tarifs"), { kiloPrice: "0" });
}

function updateKiloDisplay() {
    applyKiloDOMUpdates(localStorage.getItem('kiloPrice') || '2500');
}

function applyKiloDOMUpdates(price) {
    if(document.getElementById('displayAdminKiloPrice')) document.getElementById('displayAdminKiloPrice').innerText = price;
    if(document.getElementById('currentKiloRateLabel')) document.getElementById('currentKiloRateLabel').innerText = price;
}

// TRAÇABILITÉ LOGISTIQUE & ENREGISTREMENT COLIS
function calculerPrix() {
    const poids = document.getElementById('colisPoids').value;
    const rate = localStorage.getItem('kiloPrice') || 2500;
    document.getElementById('prixCalcule').innerText = poids ? poids * rate : 0;
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
    alert(`Bordereau cloud émis ! Code de suivi : ${code}`);
    event.target.reset(); 
    document.getElementById('prixCalcule').innerText = '0';
}

function renderConvoyeurColis(snapshot) {
    const container = document.getElementById('convoyeurColisList');
    if (!container) return; container.innerHTML = '';
    snapshot.forEach((doc) => {
        const c = doc.data();
        if(c.statut.includes('Livré')) return;
        const card = document.createElement('div');
        card.className = 'admin-card';
        card.innerHTML = `<strong>Code : ${c.code}</strong> (${c.nature})<br>État : <span style="color:var(--primary); font-weight:700;">${c.statut}</span>
            <select onchange="window.fs.updateDoc(window.fs.doc(window.db, 'colis', '${c.code}'), {statut: this.value})" style="margin-top:6px;">
                <option value="">-- Muter l'état --</option>
                <option value="En transit (Sur route)">En transit (Sur route)</option>
                <option value="Arrivé au dépôt de destination">Arrivé au dépôt</option>
                <option value="Livré au destinataire">Livré au destinataire</option>
            </select>`;
        container.appendChild(card);
    });
}

async function trackColis() {
    const code = document.getElementById('trackCodeInput').value.trim().toUpperCase();
    const resultDiv = document.getElementById('trackingResult');
    if (!code) return;
    resultDiv.classList.remove('hidden');
    const docSnap = await window.fs.getDoc(window.fs.doc(window.db, "colis", code));
    if (docSnap.exists()) {
        const colis = docSnap.data();
        resultDiv.innerHTML = `<h5>Résultat pour : ${colis.code}</h5><p><strong>Marchandise :</strong> ${colis.nature}</p><p><strong>Poids :</strong> ${colis.poids} Kg</p><p><strong>Statut :</strong> ${colis.statut}</p>`;
    } else { resultDiv.innerHTML = "<p style='color:red;'>Aucun colis trouvé.</p>"; }
}

// ==========================================
// MOTEUR DE DISCUSSION ET ENREGISTREMENT AUDIO CAPTURE MATÉRIELLE
// ==========================================
let currentActiveStreamingUnsubscribe = null;

// Écouteur temps réel pour terminaux Clients, Guichetiers et Convoyeurs
function initUnifiedChatStreaming(areaElementId) {
    if (currentActiveStreamingUnsubscribe) currentActiveStreamingUnsubscribe();
    if (!currentUser) return;

    const chatCollectionRef = window.fs.collection(window.db, "chats", currentUser.phone, "messages");
    const q = window.fs.query(chatCollectionRef, window.fs.orderBy("timestamp", "asc"));

    currentActiveStreamingUnsubscribe = window.fs.onSnapshot(q, (snapshot) => {
        const area = document.getElementById(areaElementId);
        if (!area) return; area.innerHTML = '';
        
        let lastDisplayedDateString = "";
        snapshot.forEach((doc) => {
            const msgData = doc.data();
            lastDisplayedDateString = injectDateSeparatorIfNeeded(msgData.timestamp, lastDisplayedDateString, area);
            renderUnifiedMessageBubble(msgData, doc.id, currentUser.phone, area);
        });
        area.scrollTop = area.scrollHeight;
    });
}

// Liste latérale Admin unifiée (Affiche Clients, Guichetiers, Convoyeurs)
let cachedUserDocuments = [];
function renderAdminChatUserList(snapshot) {
    cachedUserDocuments = [];
    snapshot.forEach(doc => {
        if (doc.data().role !== 'admin') cachedUserDocuments.push(doc.data());
    });
    filterAdminUserList(); // Applique le rendu filtré de base
}

function filterAdminUserList() {
    const queryText = document.getElementById('adminSearchUser').value.toLowerCase().trim();
    const listContainer = document.getElementById('adminChatUserList');
    if (!listContainer) return; listContainer.innerHTML = '';

    cachedUserDocuments.forEach((u) => {
        if (u.name.toLowerCase().includes(queryText) || u.phone.includes(queryText) || u.role.toLowerCase().includes(queryText)) {
            const div = document.createElement('div');
            div.className = `chat-user-item ${selectedClientChatPhone === u.phone ? 'active' : ''}`;
            div.onclick = () => openAdminSelectedChatChannel(u.phone, u.name, u.role);
            div.innerHTML = `<span class="chat-user-item-name">${u.name}</span>
                             <span class="chat-user-item-preview">${u.role.toUpperCase()} | ${u.phone}</span>`;
            listContainer.appendChild(div);
        }
    });
}

function openAdminSelectedChatChannel(userPhone, userName, userRole) {
    selectedClientChatPhone = userPhone;
    document.getElementById('adminChatPlaceholder').classList.add('hidden');
    document.getElementById('adminChatMainZone').classList.remove('hidden');
    document.getElementById('adminSelectedClientName').innerText = `${userName} (${userRole.toUpperCase()})`;
    document.getElementById('adminSelectedClientPhone').innerText = `Canal : ${userPhone} | Sécurisé`;

    document.querySelectorAll('.chat-user-item').forEach(i => i.classList.remove('active'));

    if (currentActiveStreamingUnsubscribe) currentActiveStreamingUnsubscribe();

    const chatCollectionRef = window.fs.collection(window.db, "chats", userPhone, "messages");
    const q = window.fs.query(chatCollectionRef, window.fs.orderBy("timestamp", "asc"));

    currentActiveStreamingUnsubscribe = window.fs.onSnapshot(q, (snapshot) => {
        const area = document.getElementById('adminMessageArea');
        if (!area) return; area.innerHTML = '';
        
        let lastDisplayedDateString = "";
        snapshot.forEach((doc) => {
            const msgData = doc.data();
            lastDisplayedDateString = injectDateSeparatorIfNeeded(msgData.timestamp, lastDisplayedDateString, area);
            renderUnifiedMessageBubble(msgData, doc.id, 'admin', area);
        });
        area.scrollTop = area.scrollHeight;
    });
}

// CONSTRUCTEUR SÉMANTIQUE DES BULLES STYLE WHATSAPP AVEC ENVOL DE SUPPRESSION
function renderUnifiedMessageBubble(msg, msgId, localProfileRole, containerArea) {
    const wrapper = document.createElement('div');
    wrapper.className = "msg-wrapper";

    const bubble = document.createElement('div');
    const isOutgoing = (localProfileRole === 'admin' && msg.sender === 'admin') || (localProfileRole !== 'admin' && msg.sender !== 'admin');
    bubble.className = `msg-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`;

    const timeString = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    // Bouton de suppression visible uniquement si le message émane de l'utilisateur connecté
    const allowDeletion = (localProfileRole === 'admin' && msg.sender === 'admin') || (localProfileRole !== 'admin' && msg.sender === currentUser.phone);
    const deleteBtnHtml = allowDeletion ? `<button class="btn-msg-delete" onclick="deleteCloudMessage('${msgId}')">🗑️</button>` : '';

    if (msg.type === 'audio') {
        bubble.innerHTML = `
            <audio src="${msg.audioContent}" controls style="max-width:210px; height:40px;"></audio>
            <div class="msg-meta-zone">
                ${deleteBtnHtml} <span class="msg-time">${timeString}</span>
            </div>`;
    } else {
        bubble.innerHTML = `
            <span>${msg.text}</span>
            <div class="msg-meta-zone">
                ${deleteBtnHtml} <span class="msg-time">${timeString}</span>
            </div>`;
    }

    wrapper.appendChild(bubble);
    containerArea.appendChild(wrapper);
}

// INJECTEUR DE TIMELINE DATE SÉPARATEUR
function injectDateSeparatorIfNeeded(msgTimestamp, lastDateStr, container) {
    const msgDateObj = new Date(msgTimestamp);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    let currentDateStr = msgDateObj.toLocaleDateString('fr-FR', options);
    
    const todayStr = new Date().toLocaleDateString('fr-FR', options);
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('fr-FR', options);

    if (currentDateStr === todayStr) currentDateStr = "Aujourd'hui";
    else if (currentDateStr === yesterdayStr) currentDateStr = "Hier";

    if (currentDateStr !== lastDateStr) {
        const sep = document.createElement('div');
        sep.className = "chat-date-separator";
        sep.innerText = currentDateStr;
        container.appendChild(sep);
        return currentDateStr;
    }
    return lastDateStr;
}

// ENVOI MESSAGE TEXTE NATIF
async function sendChatMessage(role) {
    const inputId = role === 'admin' ? 'adminChatInput' : `${role}ChatInput`;
    const el = document.getElementById(inputId);
    if (!el || !el.value.trim()) return;

    const channelId = role === 'admin' ? selectedClientChatPhone : currentUser.phone;
    await window.fs.addDoc(window.fs.collection(window.db, "chats", channelId, "messages"), {
        sender: role === 'admin' ? 'admin' : currentUser.phone,
        text: el.value.trim(), type: 'text', timestamp: Date.now()
    });
    el.value = '';
}

// SUPPRESSION EFFECTIVE DES MESSAGES DEPUIS LE CLOUD (FIRESTORE)
async function deleteCloudMessage(messageDocId) {
    const channelId = currentUser.role === 'admin' ? selectedClientChatPhone : currentUser.phone;
    if (confirm("Supprimer ce message pour tout le monde ?")) {
        try {
            await window.fs.deleteDoc(window.fs.doc(window.db, "chats", channelId, "messages", messageDocId));
        } catch(e) { alert("Action non synchronisée."); }
    }
}

// MOTEUR AUDIO AUDIO REEL (CAPTURE AUDIO HARDWARE)
async function toggleAudioRecording(role) {
    const btn = document.getElementById(`mic-${role}`);
    const channelId = role === 'admin' ? selectedClientChatPhone : currentUser.phone;
    if (!channelId) return;

    if (!isHardwareRecordingActive) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("L'enregistrement audio n'est pas pris en charge sur ce terminal."); return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            compiledAudioChunks = [];
            hardwareAudioRecorder = new MediaRecorder(stream);

            hardwareAudioRecorder.ondataavailable = (e) => { if (e.data.size > 0) compiledAudioChunks.push(e.data); };
            hardwareAudioRecorder.onstop = async () => {
                const audioBlob = new Blob(compiledAudioChunks, { type: 'audio/mp3' });
                const fileReader = new FileReader();
                fileReader.readAsDataURL(audioBlob);
                fileReader.onloadend = async () => {
                    const base64AudioDataString = fileReader.result;
                    await window.fs.addDoc(window.fs.collection(window.db, "chats", channelId, "messages"), {
                        sender: role === 'admin' ? 'admin' : currentUser.phone,
                        type: 'audio', audioContent: base64AudioDataString, timestamp: Date.now()
                    });
                };
                stream.getTracks().forEach(t => t.stop());
            };

            hardwareAudioRecorder.start();
            isHardwareRecordingActive = true;
            btn.classList.add('recording'); btn.innerText = "🛑";
        } catch (err) { alert("Accès matériel au micro refusé."); }
    } else {
        if (hardwareAudioRecorder && hardwareAudioRecorder.state !== "inactive") hardwareAudioRecorder.stop();
        isHardwareRecordingActive = false;
        btn.classList.remove('recording'); btn.innerText = "🎙️";
    }
}

// ENGINE DE RECHERCHE ET FILTRAGE GLOBAL DES COLIS (ADMIN)
let cachedColisDocuments = [];
function renderAdminGlobalColisList(snapshot) {
    cachedColisDocuments = [];
    snapshot.forEach(doc => cachedColisDocuments.push(doc.data()));
    filterAdminColisList();
}

function filterAdminColisList() {
    const filterText = document.getElementById('adminSearchColis').value.toLowerCase().trim();
    const container = document.getElementById('adminGlobalColisContainer');
    if (!container) return; container.innerHTML = '';

    const ul = document.createElement('ul');
    ul.className = "custom-scroll list-container";

    cachedColisDocuments.forEach((c) => {
        const matches = c.code.toLowerCase().includes(filterText) || 
                        c.nature.toLowerCase().includes(filterText) || 
                        c.destinataire.toLowerCase().includes(filterText) || 
                        c.statut.toLowerCase().includes(filterText);
        
        if (matches) {
            const li = document.createElement('li');
            li.style.flexDirection = "column"; li.style.alignItems = "flex-start"; li.style.padding = "10px 0";
            
            const isLivre = c.statut && c.statut.toLowerCase().includes('livré');
            const actionButton = isLivre 
                ? `<button onclick="deleteColisPermanently('${c.code}')" class="btn-danger btn-small">Supprimer le colis</button>` 
                : `<small style="color:gray; font-style:italic;">En cours de transit...</small>`;

            li.innerHTML = `
                <div style="width:100%; display:flex; justify-content:space-between;">
                    <strong>📦 Code : ${c.code}</strong><span class="price-box" style="padding:4px 8px; font-size:0.75rem;">${c.prix} FC</span>
                </div>
                <div style="font-size:0.8rem; color:#475569; margin-top:4px;">
                    Nature : ${c.nature} | Poids : ${c.poids} Kg <br>Dest : ${c.destinataire} (${c.destPhone})<br>Statut : <strong style="color:var(--primary);">${c.statut}</strong>
                </div>
                <div style="width:100%; text-align:right; margin-top:4px;">${actionButton}</div>`;
            ul.appendChild(li);
        }
    });
    container.appendChild(ul);
}

async function deleteColisPermanently(code) {
    if (confirm(`⚠️ Supprimer définitivement le colis ${code} du Cloud ?`)) {
        await window.fs.deleteDoc(window.fs.doc(window.db, "colis", code));
    }
}

function scrollChatToBottom(id) { const el = document.getElementById(id); if(el) el.scrollTop = el.scrollHeight; }
