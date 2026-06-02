// ==========================================
// CENTRALISATION ET SYNCHRONISATION CLOUD (FIRESTORE)
// ==========================================
let currentUser = null;
let isEditingStaff = false;
let selectedClientChatPhone = null; // Stocke l'ID utilisateur ouvert dans la discussion admin

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
                role: 'admin',
                name: 'Directeur Général',
                email: 'admin@gmail.com',
                phone: '+243000000000',
                password: 'admin1234'
            });
        }
    } catch (e) { console.error("Mode déconnecté ou erreur d'init root."); }
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
    } else if (role === 'convoyeur') {
        switchScreen('convoyeurDashboard');
    } else if (role === 'client') {
        document.getElementById('clientNameHeader').innerText = currentUser.name;
        switchScreen('clientDashboard');
        switchClientTab('trackTab'); // Initialiser par défaut sur le premier onglet
        initClientChatListener();   // Lancer l'écouteur du chat client
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('deviceSessionUser');
    document.getElementById('logoutBtn').classList.add('hidden');
    switchScreen('loginScreen');
}

// MANAGEMENT DES TABS ADMINISTRATEURS
function switchAdminTab(tabId) {
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('.admin-nav-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(tabId).classList.remove('hidden');
    event.currentTarget.classList.add('active');
}

// MANAGEMENT DES TABS CLIENTS (NOUVEAUTÉ)
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

async function prepareEditStaff(phone, role) {
    isEditingStaff = true;
    const pfx = role;
    const cap = role.charAt(0).toUpperCase() + role.slice(1);

    try {
        const docSnap = await window.fs.getDoc(window.fs.doc(window.db, "users", phone));
        if (!docSnap.exists()) return;
        const agent = docSnap.data();

        document.getElementById(`${pfx}FormTitle`).innerText = `Modifier le ${cap}`;
        document.getElementById(`btn${cap}Form`).innerText = "Sauvegarder les modifications";
        document.getElementById(`btnCancel${cap}Edit`).classList.remove('hidden');
        document.getElementById(`edit${cap}OldPhone`).value = agent.phone;

        document.getElementById(`${pfx}Name`).value = agent.name;
        document.getElementById(`${pfx}Ville`).value = agent.ville;
        document.getElementById(`${pfx}Email`).value = agent.email;
        document.getElementById(`${pfx}Phone`).value = agent.phone;
        document.getElementById(`${pfx}Password`).value = agent.password;
    } catch (e) { alert("Erreur d'acquisition des données."); }
}

function cancelStaffEdit(role) {
    isEditingStaff = false;
    const pfx = role;
    const cap = role.charAt(0).toUpperCase() + role.slice(1);
    document.getElementById(`${pfx}FormTitle`).innerText = `Ajouter un ${cap}`;
    document.getElementById(`btn${cap}Form`).innerText = `Enregistrer le ${cap}`;
    document.getElementById(`btnCancel${cap}Edit`).classList.add('hidden');
    document.querySelector(`#${pfx}Tab form`).reset();
}

async function deleteStaff(phone) {
    if (confirm("Supprimer définitivement les accès cloud de cet agent ?")) {
        try {
            await window.fs.deleteDoc(window.fs.doc(window.db, "users", phone));
            alert("Compte détruit de la base de données.");
        } catch(e) { alert("Action refusée par le serveur."); }
    }
}

function renderStaffLists(snapshot) {
    const gList = document.getElementById('guichetierList');
    const cList = document.getElementById('convoyeurList');
    
    if (gList) gList.innerHTML = '';
    if (cList) cList.innerHTML = '';

    snapshot.forEach((doc) => {
        const u = doc.data();
        const li = document.createElement('li');
        li.innerHTML = `<div><strong>${u.name}</strong><br><small>${u.ville || 'Non spécifiée'} | ${u.phone}</small></div>
            <div class="action-group">
                <button onclick="prepareEditStaff('${u.phone}', '${u.role}')" class="btn-primary btn-small">Modifier</button>
                <button onclick="deleteStaff('${u.phone}')" class="btn-danger btn-small">Suppr</button>
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

    try {
        await window.fs.setDoc(window.fs.doc(window.db, "config", "tarifs"), { kiloPrice: newPrice });
        alert("Le nouveau tarif cloud a été répercuté partout.");
        event.target.reset();
    } catch(e) { alert("Erreur de mise à jour du tarif unitaire."); }
}

async function deleteKiloPrice() {
    try {
        await window.fs.setDoc(window.fs.doc(window.db, "config", "tarifs"), { kiloPrice: "0" });
        alert("Tarif cloud ramené à 0 FC.");
    } catch(e) { alert("Action indisponible."); }
}

function updateKiloDisplay() {
    const currentPrice = localStorage.getItem('kiloPrice') || '2500';
    applyKiloDOMUpdates(currentPrice);
}

function applyKiloDOMUpdates(price) {
    if(document.getElementById('displayAdminKiloPrice')) document.getElementById('displayAdminKiloPrice').innerText = price;
    if(document.getElementById('currentKiloRateLabel')) document.getElementById('currentKiloRateLabel').innerText = price;

    const btnDelete = document.getElementById('btnDeleteKilo');
    if(btnDelete) {
        if(price !== '0') btnDelete.classList.remove('hidden');
        else btnDelete.classList.add('hidden');
    }
}

// TRAÇABILITÉ LOGISTIQUE & ENREGISTREMENT COLIS
function calculerPrix() {
    const poids = document.getElementById('colisPoids').value;
    const rate = localStorage.getItem('kiloPrice') || 2500;
    document.getElementById('prixCalcule').innerText = poids ? poids * rate : 0;
}

async function createColis(event) {
    event.preventDefault();
    const nature = document.getElementById('colisNature').value;
    const poids = document.getElementById('colisPoids').value;
    const destinataire = document.getElementById('colisDestinataire').value;
    const destPhone = document.getElementById('colisDestPhone').value;

    if (!RDC_PHONE_REGEX.test(destPhone)) {
        alert("Numéro du destinataire non réglementaire (+243...)");
        return;
    }

    const newId = `TK-${Math.floor(100 + Math.random() * 900)}`;

    try {
        await window.fs.setDoc(window.fs.doc(window.db, "colis", newId), {
            code: newId, 
            nature, 
            poids, 
            destinataire, 
            destPhone, 
            prix: document.getElementById('prixCalcule').innerText, 
            statut: 'Enregistré au dépôt initial',
            timestamp: Date.now()
        });

        alert(`Bordereau cloud émis ! Code unique obligatoire de suivi : ${newId}`);
        event.target.reset(); 
        document.getElementById('prixCalcule').innerText = '0';
    } catch(e) { alert("Erreur d'injection du colis."); }
}

function renderConvoyeurColis(snapshot) {
    const container = document.getElementById('convoyeurColisList');
    if (!container) return;
    container.innerHTML = '';
    let hasColis = false;

    snapshot.forEach((doc) => {
        hasColis = true;
        const c = doc.data();
        const card = document.createElement('div');
        card.className = 'admin-card';
        card.innerHTML = `
            <strong>Code : ${c.code}</strong> (${c.nature})<br>
            État : <span style="color:var(--primary); font-weight:700;">${c.statut}</span>
            <select onchange="updateStatutCloud('${c.code}', this.value)" style="margin-top:6px; padding:6px; border-radius:8px; width:100%;">
                <option value="">-- Muter l'état --</option>
                <option value="En transit (Sur route)">En transit (Sur route)</option>
                <option value="Arrivé au dépôt de destination">Arrivé au dépôt</option>
                <option value="Livré au destinataire">Livré au destinataire</option>
            </select>`;
        container.appendChild(card);
    });

    if (!hasColis) {
        container.innerHTML = '<p style="color:gray; font-size:0.85rem; padding:10px; margin:0;">Aucun chargement enregistré sur le Cloud.</p>';
    }
}

async function updateStatutCloud(code, newStatut) {
    if (!newStatut) return;
    try {
        await window.fs.updateDoc(window.fs.doc(window.db, "colis", code), { statut: newStatut });
        alert(`Le colis ${code} est maintenant : ${newStatut}`);
    } catch(e) { alert("Erreur lors de la mise à jour du statut."); }
}

// SUIVI CLIENT
async function trackColis() {
    const code = document.getElementById('trackCodeInput').value.trim().toUpperCase();
    const resultDiv = document.getElementById('trackingResult');
    
    if (!code) {
        alert("Veuillez saisir un code de suivi valide.");
        return;
    }

    try {
        const docRef = window.fs.doc(window.db, "colis", code);
        const docSnap = await window.fs.getDoc(docRef);
        resultDiv.classList.remove('hidden');

        if (docSnap.exists()) {
            const colis = docSnap.data();
            resultDiv.innerHTML = `
                <h5>Résultat pour : ${colis.code}</h5>
                <p><strong>Marchandise :</strong> ${colis.nature}</p>
                <p><strong>Poids :</strong> ${colis.poids} Kg</p>
                <p><strong>Destinataire :</strong> ${colis.destinataire}</p>
                <p><strong>Frais payés :</strong> ${colis.prix} FC</p>
                <div class="price-box" style="margin-top:10px; background-color:rgba(0,123,255,0.1); color:var(--primary);">
                    <strong>Statut actuel :</strong> ${colis.statut}
                </div>`;
        } else {
            resultDiv.innerHTML = `<p style="color:red; font-weight:bold; margin:0;">Aucun colis trouvé avec le code "${code}".</p>`;
        }
    } catch (e) { alert("Erreur de récupération des informations."); }
}

// ==========================================
// NOUVEAU PROCESSEUR DE DISCUSSION WHATSAPP EN TEMPS RÉEL
// ==========================================

// Écouteur de discussion pour le client
let clientChatUnsubscribe = null;
function initClientChatListener() {
    if (clientChatUnsubscribe) clientChatUnsubscribe();
    if (!currentUser || !window.db) return;

    const chatRef = window.fs.collection(window.db, "chats", currentUser.phone, "messages");
    const q = window.fs.query(chatRef, window.fs.orderBy("timestamp", "asc"));

    clientChatUnsubscribe = window.fs.onSnapshot(q, (snapshot) => {
        const area = document.getElementById('clientMessageArea');
        if (!area) return;
        area.innerHTML = '';

        snapshot.forEach((doc) => {
            const m = doc.data();
            const bubble = document.createElement('div');
            bubble.className = `msg-bubble ${m.sender === currentUser.phone ? 'outgoing' : 'incoming'}`;
            
            const timeStr = new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            bubble.innerHTML = `${m.text} <span class="msg-time">${timeStr}</span>`;
            area.appendChild(bubble);
        });
        scrollChatToBottom('clientMessageArea');
    });
}

// Liste des clients inscrits pour l'administrateur
function renderAdminChatUserList(snapshot) {
    const listContainer = document.getElementById('adminChatUserList');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    snapshot.forEach((doc) => {
        const u = doc.data();
        if (u.role === 'client') {
            const div = document.createElement('div');
            div.className = `chat-user-item ${selectedClientChatPhone === u.phone ? 'active' : ''}`;
            div.onclick = () => openAdminChatWithClient(u.phone, u.name);
            div.innerHTML = `
                <div class="chat-user-item-avatar">👤</div>
                <div class="chat-user-item-details">
                    <span class="chat-user-item-name">${u.name}</span>
                    <span class="chat-user-item-preview">${u.phone}</span>
                </div>`;
            listContainer.appendChild(div);
        }
    });
}

// Ouverture de la discussion d'un client spécifique par l'admin
let adminChatUnsubscribe = null;
function openAdminChatWithClient(clientPhone, clientName) {
    selectedClientChatPhone = clientPhone;
    
    document.getElementById('adminChatPlaceholder').classList.add('hidden');
    const mainZone = document.getElementById('adminChatMainZone');
    mainZone.classList.remove('hidden');

    document.getElementById('adminSelectedClientName').innerText = clientName;
    document.getElementById('adminSelectedClientPhone').innerText = `Client: ${clientPhone} | Sécurisé`;

    // Mettre à jour la classe active de la liste latérale
    document.querySelectorAll('.chat-user-item').forEach(item => {
        item.classList.remove('active');
        if (item.querySelector('.chat-user-item-preview').innerText === clientPhone) {
            item.classList.add('active');
        }
    });

    if (adminChatUnsubscribe) adminChatUnsubscribe();

    const chatRef = window.fs.collection(window.db, "chats", clientPhone, "messages");
    const q = window.fs.query(chatRef, window.fs.orderBy("timestamp", "asc"));

    adminChatUnsubscribe = window.fs.onSnapshot(q, (snapshot) => {
        const area = document.getElementById('adminMessageArea');
        if (!area) return;
        area.innerHTML = '';

        snapshot.forEach((doc) => {
            const m = doc.data();
            const bubble = document.createElement('div');
            bubble.className = `msg-bubble ${m.sender === 'admin' ? 'outgoing' : 'incoming'}`;
            
            const timeStr = new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            bubble.innerHTML = `${m.text} <span class="msg-time">${timeStr}</span>`;
            area.appendChild(bubble);
        });
        scrollChatToBottom('adminMessageArea');
    });
}

// Envoi d'un message (Texte)
async function sendChatMessage(role) {
    const inputId = role === 'admin' ? 'adminChatInput' : 'clientChatInput';
    const inputEl = document.getElementById(inputId);
    const text = inputEl.value.trim();
    if (!text) return;

    let targetClientPhone = role === 'admin' ? selectedClientChatPhone : currentUser.phone;
    if (!targetClientPhone) return;

    try {
        const messageCollection = window.fs.collection(window.db, "chats", targetClientPhone, "messages");
        await window.fs.addDoc(messageCollection, {
            sender: role === 'admin' ? 'admin' : currentUser.phone,
            text: text,
            timestamp: Date.now()
        });
        inputEl.value = '';
    } catch(e) { alert("Échec d'envoi du message."); }
}

// Simulation intuitive d'enregistrement Audio
async function simulateAudioRecord(role) {
    let targetClientPhone = role === 'admin' ? selectedClientChatPhone : currentUser.phone;
    if (!targetClientPhone) return;

    if (confirm("🎙️ Voulez-vous envoyer une note vocale pré-enregistrée (Simulation Audio) ?")) {
        try {
            const messageCollection = window.fs.collection(window.db, "chats", targetClientPhone, "messages");
            await window.fs.addDoc(messageCollection, {
                sender: role === 'admin' ? 'admin' : currentUser.phone,
                text: "🎵 Message Audio (0:12) 🔊",
                timestamp: Date.now()
            });
        } catch(e) { alert("Erreur d'injection audio."); }
    }
}

function scrollChatToBottom(areaId) {
    const el = document.getElementById(areaId);
    if(el) el.scrollTop = el.scrollHeight;
}

// ==========================================
// NOUVEAU : EN-COING DE GESTION ADMINISTRATIVE DES COLIS
// ==========================================
function renderAdminGlobalColisList(snapshot) {
    const container = document.getElementById('adminGlobalColisContainer');
    if (!container) return;
    container.innerHTML = '';
    
    const ul = document.createElement('ul');
    ul.className = "custom-scroll list-container";
    ul.style.maxHeight = "100%";
    
    let counter = 0;

    snapshot.forEach((doc) => {
        counter++;
        const c = doc.data();
        const li = document.createElement('li');
        li.style.flexDirection = "column";
        li.style.alignItems = "flex-start";
        li.style.gap = "6px";
        li.style.padding = "12px 0";
        
        // Uniquement afficher le bouton supprimer si le statut contient "Livré"
        const isLivre = c.statut && c.statut.toLowerCase().includes('livré');
        const deleteButtonHtml = isLivre 
            ? `<button onclick="deleteColisPermanently('${c.code}')" class="btn-danger btn-small">Supprimer le colis</button>` 
            : `<small style="color:gray; font-style:italic;">Destruction impossible (En cours)</small>`;

        li.innerHTML = `
            <div style="width:100%; display:flex; justify-content:space-between; align-items:center;">
                <strong>📦 Code : ${c.code}</strong>
                <span class="price-box" style="padding:4px 8px; font-size:0.75rem;">${c.prix} FC</span>
            </div>
            <div style="font-size:0.8rem; color:#475569; width:100%;">
                Nature: ${c.nature} | Poids: ${c.poids} Kg <br>
                Destinataire: ${c.destinataire} (${c.destPhone}) <br>
                Statut actuel : <strong style="color:var(--primary);">${c.statut}</strong>
            </div>
            <div style="width:100%; text-align:right; margin-top:4px;">
                ${deleteButtonHtml}
            </div>`;
        ul.appendChild(li);
    });

    if(counter === 0) {
        container.innerHTML = `<p style="color:gray; font-size:0.85rem; padding:10px; text-align:center;">Aucun colis dans la base de données centrale.</p>`;
    } else {
        container.appendChild(ul);
    }
}

// Suppression définitive du colis s'il est déjà livré
async function deleteColisPermanently(code) {
    if (confirm(`⚠️ Voulez-vous supprimer définitivement le colis ${code} de la base de données cloud ? Cette action est irréversible.`)) {
        try {
            await window.fs.deleteDoc(window.fs.doc(window.db, "colis", code));
            alert(`Le colis ${code} a été nettoyé et retiré du cloud avec succès.`);
        } catch(e) { alert("Erreur d'accès réseau lors de la suppression."); }
    }
}
