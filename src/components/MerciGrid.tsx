import { MERCI_COLS, MERCI_ROWS, isMerciCell } from '../lib/merci'

/** Repli CSS du final : la grille revient et écrit « MERCI » colonne par colonne.
 *  Purement décorative : la zone parente porte la description accessible. */
export function MerciGrid() {
  return (
    <div className="grid merci" aria-hidden="true">
      {Array.from({ length: MERCI_COLS * MERCI_ROWS }, (_, i) => (
        <span
          key={i}
          className="grid__cell"
          data-on={isMerciCell(i) || undefined}
          style={{ ['--col' as string]: Math.floor(i / MERCI_ROWS) }}
        />
      ))}
    </div>
  )
}
