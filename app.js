// ==========================================
// CONFIGURATION DE LA BASE DE DONNÉES LOCALESTORAGE
// ==========================================
if (!localStorage.getItem('usersDB')) {
    const defaultAdmin = [
        {
            role: 'admin',
            name: 'Directeur Général',
            email: 'admin@gmail.com',
            phone: '+243000000000',
            password: 'admin1234'
        }
    ];
    localStorage.setItem('usersDB', JSON.stringify(defaultAdmin));
}
if (!localStorage.getItem('colisDB')) localStorage.setItem('colisDB', JSON.stringify([]));
if (!localStorage.getItem('kiloPrice')) localStorage.setItem('kiloPrice', '2500');

let currentUser = null;
let isEditingStaff = false;

// INTERCEPTOR : CYCLE DE VIE DU SPLASH SCREEN
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        document.getElementById('splashScreen').classList.add('hidden');
        document.getElementById('mainAppContainer').classList.remove('hidden');
        
        const session = localStorage.getItem('deviceSessionUser');
        if (session) {
            currentUser = JSON.parse(session);
            redirectUserToDashboard(currentUser.role);
        } else {
            switchScreen('loginScreen');
        }
        initSystemData();
    }, 2500); 
});

function initSystemData() {
    renderStaffLists();
    renderConvoyeurColis();
    updateKiloDisplay();
}

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
}

// ENGINE DE VALIDATION PAR EXPRESSIONS RÉGULIÈRES
const GMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
const RDC_PHONE_REGEX = /^\+243\d{9}$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;

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

// GESTION AUTHENTIFICATION ET INSCRIPTION CLIENT
function handleLogin(event) {
    event.preventDefault();
    if (!validateField('loginEmail', GMAIL_REGEX, "Format requis : @gmail.com") ||
        !validateField('loginPhone', RDC_PHONE_REGEX, "Format requis : +243XXXXXXXXX")) return;

    const email = document.getElementById('loginEmail').value.trim();
    const phone = document.getElementById('loginPhone').value.trim();
    const password = document.getElementById('loginPassword').value;

    const users = JSON.parse(localStorage.getItem('usersDB'));
    const user = users.find(u => u.email === email && u.phone === phone && u.password === password);

    if (user) {
        currentUser = user;
        if (user.role === 'client') localStorage.setItem('deviceSessionUser', JSON.stringify(user));
        redirectUserToDashboard(user.role);
        document.querySelectorAll('form').forEach(f => f.reset()); 
    } else {
        alert("Identifiants incorrects ou inconnus.");
    }
}

function handleRegister(event) {
    event.preventDefault();
    if (!validateField('regEmail', GMAIL_REGEX, "Utiliser un compte @gmail.com") ||
        !validateField('regPhone', RDC_PHONE_REGEX, "Numéro invalide (13 caractères)") ||
        !validateField('regPassword', PASSWORD_REGEX, "Requis: 8 car. min (Lettres + Chiffres)")) return;

    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value;

    const users = JSON.parse(localStorage.getItem('usersDB'));
    if (users.some(u => u.email === email || u.phone === phone)) {
        alert("Ce profil ou numéro existe déjà.");
        return;
    }

    users.push({ role: 'client', name, email, phone, password });
    localStorage.setItem('usersDB', JSON.stringify(users));

    // INJECTION DATA POPUP DE CONFIRMATION
    document.getElementById('popEmail').innerText = email;
    document.getElementById('popPhone').innerText = phone;
    document.getElementById('popPass').innerText = password;
    document.getElementById('confirmationPopup').classList.remove('hidden');
    
    document.querySelectorAll('form').forEach(f => f.reset()); // Remise à zéro complète demandée
}

function closeConfirmationPopup() {
    document.getElementById('confirmationPopup').classList.add('hidden');
    switchScreen('loginScreen');
}

function redirectUserToDashboard(role) {
    document.getElementById('logoutBtn').classList.remove('hidden');
    if (role === 'admin') switchScreen('adminDashboard');
    else if (role === 'guichetier') { updateKiloDisplay(); switchScreen('guichetierDashboard'); }
    else if (role === 'convoyeur') { renderConvoyeurColis(); switchScreen('convoyeurDashboard'); }
    else if (role === 'client') {
        document.getElementById('clientNameHeader').innerText = currentUser.name;
        switchScreen('clientDashboard');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('deviceSessionUser');
    document.getElementById('logoutBtn').classList.add('hidden');
    switchScreen('loginScreen');
}

// CONSOLE ADMINISTRATIVE ET PASSAGE D'ONGLETS
function switchAdminTab(tabId) {
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(tabId).classList.remove('hidden');
    event.currentTarget.classList.add('active');
}

function handleStaffSubmit(event, targetRole) {
    event.preventDefault();
    const pfx = targetRole;
    
    const name = document.getElementById(`${pfx}Name`).value.trim();
    const ville = document.getElementById(`${pfx}Ville`).value.trim();
    const email = document.getElementById(`${pfx}Email`).value.trim();
    const phone = document.getElementById(`${pfx}Phone`).value.trim();
    const password = document.getElementById(`${pfx}Password`).value;

    if (!GMAIL_REGEX.test(email) || !RDC_PHONE_REGEX.test(phone) || !PASSWORD_REGEX.test(password)) {
        alert("Sécurité : Contraintes de saisie non respectées.");
        return;
    }

    let users = JSON.parse(localStorage.getItem('usersDB'));

    if (isEditingStaff) {
        const oldPhone = document.getElementById(`edit${pfx.charAt(0).toUpperCase() + pfx.slice(1)}OldPhone`).value;
        const idx = users.findIndex(u => u.phone === oldPhone);
        if (idx !== -1) {
            users[idx] = { role: targetRole, name, ville, email, phone, password };
            localStorage.setItem('usersDB', JSON.stringify(users));
            alert("Compte agent mis à jour.");
            cancelStaffEdit(targetRole);
        }
    } else {
        if (users.some(u => u.phone === phone || u.email === email)) {
            alert("Identifiants déjà attribués à un autre agent.");
            return;
        }
        users.push({ role: targetRole, name, ville, email, phone, password });
        localStorage.setItem('usersDB', JSON.stringify(users));
        alert("Nouvel agent enregistré au système.");
    }
    
    event.target.reset(); // Vider le formulaire automatiquement
    renderStaffLists();
}

function prepareEditStaff(phone, role) {
    isEditingStaff = true;
    const users = JSON.parse(localStorage.getItem('usersDB'));
    const agent = users.find(u => u.phone === phone);
    const pfx = role;
    const cap = role.charAt(0).toUpperCase() + role.slice(1);

    document.getElementById(`${pfx}FormTitle`).innerText = `Modifier le ${cap}`;
    document.getElementById(`btn${cap}Form`).innerText = "Sauvegarder les modifications";
    document.getElementById(`btnCancel${cap}Edit`).classList.remove('hidden');
    document.getElementById(`edit${cap}OldPhone`).value = agent.phone;

    document.getElementById(`${pfx}Name`).value = agent.name;
    document.getElementById(`${pfx}Ville`).value = agent.ville;
    document.getElementById(`${pfx}Email`).value = agent.email;
    document.getElementById(`${pfx}Phone`).value = agent.phone;
    document.getElementById(`${pfx}Password`).value = agent.password;
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

function deleteStaff(phone) {
    if (confirm("Supprimer définitivement les accès de cet agent ?")) {
        let users = JSON.parse(localStorage.getItem('usersDB'));
        users = users.filter(u => u.phone !== phone);
        localStorage.setItem('usersDB', JSON.stringify(users));
        renderStaffLists();
    }
}

function renderStaffLists() {
    const users = JSON.parse(localStorage.getItem('usersDB'));
    
    const gList = document.getElementById('guichetierList');
    if (gList) {
        gList.innerHTML = '';
        users.filter(u => u.role === 'guichetier').forEach(u => {
            const li = document.createElement('li');
            li.innerHTML = `<div><strong>${u.name}</strong><br><small>${u.ville} | ${u.phone}</small></div>
                <div class="action-group">
                    <button onclick="prepareEditStaff('${u.phone}', 'guichetier')" class="btn-primary btn-small">Modifier</button>
                    <button onclick="deleteStaff('${u.phone}')" class="btn-danger btn-small">Suppr</button>
                </div>`;
            gList.appendChild(li);
        });
    }

    const cList = document.getElementById('convoyeurList');
    if (cList) {
        cList.innerHTML = '';
        users.filter(u => u.role === 'convoyeur').forEach(u => {
            const li = document.createElement('li');
            li.innerHTML = `<div><strong>${u.name}</strong><br><small>${u.ville} | ${u.phone}</small></div>
                <div class="action-group">
                    <button onclick="prepareEditStaff('${u.phone}', 'convoyeur')" class="btn-primary btn-small">Modifier</button>
                    <button onclick="deleteStaff('${u.phone}')" class="btn-danger btn-small">Suppr</button>
                </div>`;
            cList.appendChild(li);
        });
    }
}

// PARAMÉTRAGE DE LA TARIFICATION DU KILO
function handleKiloSubmit(event) {
    event.preventDefault();
    const newPrice = document.getElementById('inputPriceKilo').value;
    if(newPrice <= 0) return;

    localStorage.setItem('kiloPrice', newPrice);
    alert("Le nouveau tarif unitaire a été appliqué.");
    event.target.reset(); 
    updateKiloDisplay();
}

function deleteKiloPrice() {
    localStorage.setItem('kiloPrice', '0');
    alert("Le tarif a été remis à 0 FC.");
    updateKiloDisplay();
}

function updateKiloDisplay() {
    const currentPrice = localStorage.getItem('kiloPrice') || '0';
    if(document.getElementById('displayAdminKiloPrice')) document.getElementById('displayAdminKiloPrice').innerText = currentPrice;
    if(document.getElementById('currentKiloRateLabel')) document.getElementById('currentKiloRateLabel').innerText = currentPrice;

    const btnDelete = document.getElementById('btnDeleteKilo');
    if(btnDelete) {
        if(currentPrice !== '0') btnDelete.classList.remove('hidden');
        else btnDelete.classList.add('hidden');
    }
}

// LOGISTIQUE, TRACAGE ET EMISSION DES BORDEREAUX
function calculerPrix() {
    const poids = document.getElementById('colisPoids').value;
    const rate = localStorage.getItem('kiloPrice') || 0;
    document.getElementById('prixCalcule').innerText = poids ? poids * rate : 0;
}

function createColis(event) {
    event.preventDefault();
    const nature = document.getElementById('colisNature').value;
    const poids = document.getElementById('colisPoids').value;
    const destinataire = document.getElementById('colisDestinataire').value;
    const destPhone = document.getElementById('colisDestPhone').value;

    if (!RDC_PHONE_REGEX.test(destPhone)) {
        alert("Le numéro du destinataire doit faire 13 caractères (+243...)");
        return;
    }

    const colisList = JSON.parse(localStorage.getItem('colisDB'));
    const newId = `TK-${100 + colisList.length + 1}`;

    colisList.push({ code: newId, nature, poids, destinataire, destPhone, prix: document.getElementById('prixCalcule').innerText, statut: 'Enregistré au dépôt initial' });
    localStorage.setItem('colisDB', JSON.stringify(colisList));

    alert(`Bordereau créé avec succès ! Code unique du colis : ${newId}`);
    event.target.reset(); 
    document.getElementById('prixCalcule').innerText = '0';
}

function renderConvoyeurColis() {
    const colisList = JSON.parse(localStorage.getItem('colisDB'));
    const container = document.getElementById('convoyeurColisList');
    if (!container) return;
    container.innerHTML = '';

    if (colisList.length === 0) {
        container.innerHTML = '<p style="color:gray; font-size:0.85rem; padding:10px; margin:0;">Aucun chargement en cours.</p>';
        return;
    }

    colisList.forEach((c, idx) => {
        const card = document.createElement('div');
        card.className = 'admin-card';
        card.innerHTML = `
            <strong>Code : ${c.code}</strong> (${c.nature})<br>
            État : <span style="color:var(--primary); font-weight:700;">${c.statut}</span>
            <select onchange="updateStatut(${idx}, this.value)" style="margin-top:6px; padding:6px; border-radius:8px;">
                <option value="">-- Muter l'état --</option>
                <option value="En transit (Sur route)">En transit (Sur route)</option>
                <option value="Arrivé au dépôt de destination">Arrivé au dépôt</option>
                <option value="Livré au destinataire">Livré au destinataire</option>
            </select>`;
        container.appendChild(card);
    });
}

function updateStatut(index, newStatut) {
    if (!newStatut) return;
    const colisList = JSON.parse(localStorage.getItem('colisDB'));
    colisList[index].statut = newStatut;
    localStorage.setItem('colisDB', JSON.stringify(colisList));
    renderConvoyeurColis();
}

function trackColis() {
    const code = document.getElementById('trackCodeInput').value.trim();
    const resDiv = document.getElementById('trackingResult');
    resDiv.classList.remove('hidden');

    if (!code) {
        resDiv.innerHTML = "<p style='color:var(--danger); margin:0;'>Veuillez entrer un code.</p>";
        return;
    }

    const colisList = JSON.parse(localStorage.getItem('colisDB'));
    const colis = colisList.find(c => c.code.toLowerCase() === code.toLowerCase());

    if (colis) {
        resDiv.innerHTML = `
            <h4 style="margin:0 0 6px 0;">Colis localisé : ${colis.code}</h4>
            <p style="margin:2px 0; font-size:0.85rem;"><strong>Marchandise :</strong> ${colis.nature} (${colis.poids} kg)</p>
            <p style="margin:2px 0; font-size:0.85rem;"><strong>Destinataire :</strong> ${colis.destinataire}</p>
            <div style="margin-top:8px; padding:8px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; color:#15803d; font-size:0.85rem;">
                <strong>Position actuelle :</strong> ${colis.statut}
            </div>`;
    } else {
        resDiv.innerHTML = `<p style="color:var(--danger); margin:0;">Code "${code}" introuvable.</p>`;
    }
}