/* Calendrier saisonnier et conseils agronomiques — CACAO et CAFÉ
   exclusivement (bassins de production ivoiriens).
   Données EMBARQUÉES : disponibles au premier lancement, hors-ligne,
   sans requête réseau. Ce sont des repères de terrain, pas un diagnostic :
   en cas de doute, le planteur consulte un conseiller agricole.

   `theme` alimente les filtres (4 thématiques), `crop` distingue les deux
   cultures, `reminder` (facultatif) porte la date du rappel PWA local. */

export const SEASON_THEMES = [
  { id: 'calendrier', icon: '📅', label: 'Saison' },
  { id: 'meteo', icon: '🌧️', label: 'Météo & incidents' },
  { id: 'sante', icon: '🐛', label: 'Santé & ravageurs' },
  { id: 'recolte', icon: '🧺', label: 'Qualité post-récolte' }
]

export const SEASON_CROPS = [
  { id: 'all', label: 'Toutes' },
  { id: 'cacao', label: 'Cacao' },
  { id: 'cafe', label: 'Café' }
]

export const SEASON_TIPS = [
  /* ---------- SAISON / CALENDRIER ---------- */
  {
    id: 'cacao-taille',
    theme: 'calendrier',
    crop: 'cacao',
    title: 'Taille de réflexion',
    period: 'Mars → Juin',
    body: 'Élaguer les branches basses, supprimer les chupons et les rameaux morts : un houppier aéré sèche vite après la pluie et contracte moins la pourriture brune.',
    reminder: {
      month: 3,
      day: 15,
      title: 'Taille du cacaoyer — c’est parti',
      body: 'Mars ouvre la fenêtre de taille : élaguez bas, supprimez les chupons, aérez le houppier avant les premières pluies.'
    }
  },
  {
    id: 'cacao-egourmandage',
    theme: 'calendrier',
    crop: 'cacao',
    title: 'Égourmandage et charge de fruits',
    period: 'Mai → Juillet',
    body: 'Éliminer les fruits groupés, difformes ou trop tardifs pour concentrer la sève sur les cabosses bien remplies : trop de fruits sur un même pied donnent de petits grains et font baisser la matière grasse.'
  },
  {
    id: 'cacao-desherbage',
    theme: 'calendrier',
    crop: 'cacao',
    title: 'Désherbage et rond de pied',
    period: 'Janvier → Mai · Juillet → Septembre',
    body: 'Maintenir un rond propre d’un mètre cinquante autour de chaque pied, puis pailler avec les feuilles mortes duhui-même : l’adventice et la Mousson se disputent la même réserve d’eau.'
  },
  {
    id: 'cafe-taille',
    theme: 'calendrier',
    crop: 'cafe',
    title: 'Taille du café',
    period: 'Mars → Juillet (après récolte)',
    body: 'Tailler après la récolte stimule la future floraison : on garde les tiges les plus vigoureuses, on aère le centre de l’arbuste et on retire les branches mortes porteuses de mineuses.',
    reminder: {
      month: 3,
      day: 20,
      title: 'Taille du café — fenêtre ouverte',
      body: 'Mars à juillet : taillez votre café après récolte pour préparer la floraison suivante.'
    }
  },
  {
    id: 'cafe-desherbage',
    theme: 'calendrier',
    crop: 'cafe',
    title: 'Désherbage et régénération',
    period: 'Avril → Août',
    body: 'Arracher les adventices avant qu’elles ne grainent en laissant les lignes de café propres : le sol nu entre les pieds encourage l’érosion dès la première grosse pluie.'
  },

  /* ---------- METEO & INCIDENTS ---------- */
  {
    id: 'cacao-pluies',
    theme: 'meteo',
    crop: 'cacao',
    title: 'Pluies intenses et asphyxie',
    period: 'Mai → Juillet',
    body: 'Une pluie diluvienne en quelques heures sature l’horizon : les racines asphyxient et Phytophthora remonte. Creuser des drains de délestage et ne jamais labourer un sol détrempé.'
  },
  {
    id: 'cacao-harmattan',
    theme: 'meteo',
    crop: 'cacao',
    title: 'Harmattan et sécheresse',
    period: 'Décembre → Février',
    body: 'Vent sec et faible écart de température : les jeunes plants débourrent mal et perdent en eau. Pailler généreusement, arroser au petit matin, éviter une taille qui expose.'
  },
  {
    id: 'cacao-sols',
    theme: 'meteo',
    crop: 'cacao',
    title: 'Couverture morte des sols',
    period: 'Toute l’année',
    body: 'La litière de feuilles est l’engrais gratuit du planteur : gardez cinq à huit centimètres de matière organique au pied et rechargez après chaque récolte. Elle nourrit, limite l’érosion et casse la battance.'
  },
  {
    id: 'cafe-secheresse',
    theme: 'meteo',
    crop: 'cafe',
    title: 'Sécheresse et remplissage',
    period: 'Décembre → Février',
    body: 'En Harmattan, le café cesse de remplir les grains : la récolte de janvier pèse moins. Maintenir un paillage épais, laisser les adventices couvrir le sol en fin de cycle, ne pas élaguer en pleine floraison.',
    reminder: {
      month: 12,
      day: 15,
      title: 'Café — surveiller le remplissage',
      body: 'Harmattan : le remplissage des grains ralentit. Paillage épais et aucun élagage tant que la floraison n’est pas finie.'
    }
  },
  {
    id: 'cafe-erosion',
    theme: 'meteo',
    crop: 'cafe',
    title: 'Érosion des lignes',
    period: 'Avril → Juillet',
    body: 'Sur pente, une averse décapelle les interlignes et le café prend l’eau avec la terre. Pailler les interlignes, installer des bandes enherbées perpendiculaires à la pente, planter suivant les courbes de niveau.'
  },

  /* ---------- SANTE & RAVAGEURS ---------- */
  {
    id: 'cacao-mirides',
    theme: 'sante',
    crop: 'cacao',
    title: 'Mirides (capsules brunes)',
    period: 'Mars → Mai · Septembre → Novembre',
    body: 'Petites punaises brunes qui piquent la jeune baie et détruisent la fécondation. Inspectez les jeunes pousses, comptez les capsules piquées et traitez au seuil, jamais au calendrier.',
    reminder: {
      month: 9,
      day: 15,
      title: 'Mirides du cacao — surveillance',
      body: 'Septembre ouvre le second pic de mirides : inspectez les jeunes pousses et comptez les capsules piquées avant tout traitement.'
    }
  },
  {
    id: 'cacao-pourriture',
    theme: 'sante',
    crop: 'cacao',
    title: 'Pourriture brune (Phytophthora)',
    period: 'Toute l’année, pics en Mai → Juillet',
    body: 'Taches brunes huileuses sur la cabosse, odeur de moisi. Ramassez et sortez du champ les fruits touchés, taillez pour aérer, traitez en prévention avant les pluies.',
    reminder: {
      month: 5,
      day: 10,
      title: 'Phytophthora — agir avant les pluies',
      body: 'Mai : traitant en prévention AVANT les pluies et éliminez les cabosses infectées du champ. La pourriture brune se décide en amont.'
    }
  },
  {
    id: 'cacao-swollen',
    theme: 'sante',
    crop: 'cacao',
    title: 'Swollen shoot (CSSV)',
    period: 'Toute l’année',
    body: 'Virus sans traitement curatif : tiges renflées et fourchues, feuilles chlorotiques, absence de fleurs. Arracher et détruire le plant racines comprises, éliminer les rejets de base, replanter avec du matériel certifié.'
  },
  {
    id: 'cafe-rouille',
    theme: 'sante',
    crop: 'cafe',
    title: 'Rouille du café (Hemileia)',
    period: 'November → Février',
    body: 'Taches orange poudreuses sous la feuille et chute du feuillage. Une caféière trop ombragée multiplicateur l’infection : ouvrez les lignes, aérez, fertilisez et éliminez les débris contaminés.',
    reminder: {
      month: 11,
      day: 15,
      title: 'Rouille du café — début de campagne',
      body: 'Novembre : surveillez le revers des feuilles. La rouille prospère dès que la caféière est trop ombragée.'
    }
  },
  {
    id: 'cafe-scolytes',
    theme: 'sante',
    crop: 'cafe',
    title: 'Brûleurs et mineuses',
    period: 'Juillet → Octobre',
    body: 'Les scolytes percent le bois et le grain logé dedans : les grains creusés, noircis et fripés. Détruisez les rameaux morts, leur seul abri d’hiver, surveillez les pièges à phéromones et récoltez à maturité physiologique.',
    reminder: {
      month: 7,
      day: 20,
      title: 'Café — vigilance brûleurs',
      body: 'Juillet : détruisez les rameaux morts, seul abri d’hiver des scolytes. Du bois empilé au champ, c’est un foyer.'
    }
  },

  /* ---------- QUALITE POST-RECOLTE ---------- */
  {
    id: 'cacao-fermentation',
    theme: 'recolte',
    crop: 'cacao',
    title: 'Fermentation contrôlée',
    period: '6 à 7 jours, retournement J+2 et J+4',
    body: 'Cabosses mûres en tas ou en caisses, couvertes de feuilles, avec des retournements réguliers : la chaleur de fermentation fixe le taux de matière grasse. Une fermentation bâclé sent l’ammoniac, une fermentation trop courte ne sent rien.',
    reminder: {
      month: 1,
      day: 15,
      title: 'Fermentation — le cacao se joue ici',
      body: 'Six à sept jours, retournement à J+2 et J+4. La matière grasse se fixe pendant la fermentation, pas au séchage.'
    }
  },
  {
    id: 'cacao-sechage',
    theme: 'recolte',
    crop: 'cacao',
    title: 'Séchage à 7 %',
    period: '5 à 8 jours, sur bâches',
    body: 'Jamais à même le sol : le cacao prend l’humidité du terreau. Étaler en couche mince, ramasser à mi-séjour et viser sept pour cent d’humidité — au-delà, moisissures et pénalité à l’achat.',
    reminder: {
      month: 2,
      day: 15,
      title: 'Séchage — viser 7 %',
      body: 'Février : séchez sur bâches, couche mince, ramassage à mi-séjour. Au-dessus de 7 %, l’acheteur applique une pénalité.'
    }
  },
  {
    id: 'cacao-stockage',
    theme: 'recolte',
    crop: 'cacao',
    title: 'Stockage et conservation',
    period: 'Toute l’année',
    body: 'Sacs sur palettes, dix centimètres de toute paroi, jamais à même le sol : c’est la chaudière de tous les insectes. Contrôlez la température et l’humidité du magasin avant chaque campagne.'
  },
  {
    id: 'cafe-sechage',
    theme: 'recolte',
    crop: 'cafe',
    title: 'Séchage sur parche',
    period: 'Novembre → Février',
    body: 'Le café sèche sur sa parche, jamais décortiqué : le parchemin protège le grain et isole l’humidité. Étaler sur aire propre, retourner régulièrement, viser onze à douze pour cent avant stockage.'
  },
  {
    id: 'cafe-stockage',
    theme: 'recolte',
    crop: 'cafe',
    title: 'Stockage du café vert',
    period: 'Août → Octobre',
    body: 'Sacs de jute ou de polypropylène sur palettes, aérés et à l’ombre : le café absorbe vite les odeurs. Un passage en magasin sec avant le décorticage, sinon le simple moulin parfume toute la pièce.'
  }
]

/* Conseil du jour : rotation stable sur la journée (index = quantième).
   Un tirage au sort dans le rendu changerait de carte à chaque rendu et
   provoquerait un clignotement ; la date garantit un conseil différent
   chaque jour, sans effet de bord au remontage de composant. */
export function tipOfTheDay(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((date - start) / 86400000)
  return SEASON_TIPS[dayOfYear % SEASON_TIPS.length]
}
