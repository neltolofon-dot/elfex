/**
 * Tous les textes du site sont ici.
 * Modifie-les librement : le reste du code ne contient aucun texte affiché.
 *
 * Astuce : « M. Eurin » utilise une espace insécable ( )
 * pour que « M. » et « Eurin » ne soient jamais coupés en fin de ligne.
 */

const NOM = 'M. Eurin'

export const content = {
  /** Écran 1 — la fausse soumission */
  soumission: {
    mention: 'HashCode / Soumission de Nelkaël',
    titre: `${NOM}, j’ai une dernière mission à vous soumettre.`,
    bouton: 'Relire la mission',
  },

  /** Écran 2 — la surprise */
  surprise: {
    titre: `Joyeux anniversaire, ${NOM}.`,
    /** Description du gâteau pour les lecteurs d’écran. */
    gateauAlt: 'Un petit gâteau d’anniversaire en pixels, avec une bougie allumée.',
  },

  /**
   * La lettre. Une entrée = un paragraphe.
   * `salutation` et `signature` sont mis en forme à part.
   */
  lettre: {
    salutation: `${NOM},`,
    paragraphes: [
      'Je repense à l’audit de JoinHashCode, puis aux 48 heures sur HashVault avec l’équipe.',
      'Cette année, grâce à vous, j’ai appris à construire des projets et à travailler avec d’autres personnes. Ça compte beaucoup pour moi.',
      'Aujourd’hui, ça me faisait bizarre de vous envoyer juste “joyeux anniversaire” sur WhatsApp.',
      'Alors j’ai ouvert mon éditeur et je vous ai codé ce petit truc.',
      'Merci pour le temps que vous m’avez donné.',
      `Joyeux anniversaire, ${NOM}. Je vous souhaite la santé et encore plein de beaux projets.`,
    ],
    signature: 'Nelkaël',
  },
} as const
