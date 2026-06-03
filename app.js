document.addEventListener('DOMContentLoaded', () => {
    const formColis = document.getElementById('formColis');

    if (formColis) {
        formColis.addEventListener('submit', (e) => {
            e.preventDefault(); // Empêche le rechargement de la page

            // Récupération des valeurs du formulaire (Expéditeur inclus)
            const nomExpediteur = document.getElementById('nomExpediteur').value.trim();
            const natureMarchandise = document.getElementById('natureMarchandise').value.trim();
            const poidsColis = document.getElementById('poidsColis').value;
            const nomDestinataire = document.getElementById('nomDestinataire').value.trim();
            const telephoneDestinataire = document.getElementById('telephoneDestinataire').value.trim();

            // Structure complète des données du colis
            const nouveauColis = {
                id: 'TK-' + Math.floor(100000 + Math.random() * 900000), // ID unique
                expediteur: nomExpediteur,
                nature: natureMarchandise,
                poids: poidsColis + ' Kg',
                destinataire: nomDestinataire,
                telephone_destinataire: telephoneDestinataire,
                dateEnregistrement: new Date().toLocaleString('fr-FR')
            };

            // Ici, tu peux pousser l'objet vers ton Backend, Firebase ou LocalStorage
            console.log('Colis enregistré avec succès !', nouveauColis);
            
            // Simulation de l'émission du bordereau de transport
            genererBordereau(nouveauColis);

            // Optionnel : Réinitialiser le formulaire après soumission
            formColis.reset();
        });
    }
});

/**
 * Fonction de simulation d'affichage ou d'impression du bordereau
 */
function genererBordereau(colis) {
    alert(`
    =========================================
               TRANS KAMUTETE
            BORDEREAU DE TRANSPORT
    =========================================
    Code Colis : ${colis.id}
    Date       : ${colis.dateEnregistrement}
    -----------------------------------------
    EXPÉDITEUR : ${colis.expediteur}
    -----------------------------------------
    DESTINATAIRE : ${colis.destinataire}
    Téléphone    : ${colis.telephone_destinataire}
    -----------------------------------------
    DÉTAILS DU COLIS :
    Nature : ${colis.nature}
    Poids  : ${colis.poids}
    =========================================
    Enregistré avec succès dans le système.
    `);
}
