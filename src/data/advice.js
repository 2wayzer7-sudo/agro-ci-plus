/* Fiches de conseil pré-enregistrées, embarquées dans le bundle.
   Elles sont donc disponibles au premier lancement, hors-ligne, sans
   requête réseau ni écriture en base : elles servent de référence de
   terrain, pas de diagnostic. En cas de doute, le planteur doit
   consulter un conseiller agricole. */

export const adviceSheets = [
  {
    id: 'pourriture-brune',
    disease: 'Pourriture brune',
    agent: 'Phytophthora palmivora',
    icon: '◍',
    symptoms: 'Taches brunes huileuses sur la cabosse, pourriture du lobe, odeur de moisi.',
    actions: [
      'Ramasser et sortir du champ les cabosses infectées, ne jamais les laisser au sol.',
      'Élaguer les branches basses pour aérer le houppier.',
      'Appliquer un fongicide de contact (metalaxyl + mancozèbe) en prévention, avant les pluies.'
    ],
    warning: 'Ne jamais conserver une cabosse atteinte dans le tas de récolte.'
  },
  {
    id: 'swollen-shoot',
    disease: 'Swollen shoot',
    agent: 'CSSV — virus',
    icon: '◈',
    symptoms: 'Tiges renflées et fourchues, feuilles chlorotiques, absence de fleurs et de cabosses.',
    actions: [
      'Arracher et détruire le plant atteint, racines comprises, sans le laisser sur place.',
      'Éliminer les rejets de base qui propagent l’infection.',
      'Installer des plants issus de souches saines et certifiées, et surveiller les jeunes plants.'
    ],
    warning: 'Maladie virale : aucun traitement curatif. La prévention est le seul levier.'
  },
  {
    id: 'insectes',
    disease: 'Insectes foreurs',
    agent: 'Conopomorpha / Helopeltis',
    icon: '⬡',
    symptoms: 'Trous de sortie sur les fruits, dégâts sur la pulpe, grains noirs et fripés.',
    actions: [
      'Récolter à maturité physiologique, sans laisser mûrir sur pied.',
      'Élaguer et détruire les rameaux morts où les larves passent l’hiver.',
      'Poser des pièges à phéromones pour suivre les vols et déclencher au seuil.'
    ],
    warning: 'Distinguer les dégâts d’insectes de ceux de la pourriture pour éviter un traitement inutile.'
  }
]
