import { motion } from 'framer-motion'
import EntryForm from '../components/EntryForm'
import ThemeToggle from '../components/ThemeToggle'
import { useEntries } from '../hooks/useEntries'

function formatAmount(value) {
  return `${new Intl.NumberFormat('fr-FR').format(value)} FCFA`
}

function formatDate(date) {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`))
}

function JournalScreen() {
  const { entries, totals, addEntry, deleteEntry, error } = useEntries()
  const isProfit = totals.balance >= 0

  return (
    <section className="screen">
      <header className="simple-header">
        <div>
          <p className="kicker">Vos chiffres, simplement</p>
          <h1>Carnet de champ</h1>
        </div>
        <div className="header-cluster">
          <span className="header-leaf">▤</span>
          <ThemeToggle />
        </div>
      </header>
      <motion.section
        className="leaf-card summary-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        aria-label="Synthèse de la campagne"
      >
        <div className="summary-head">
          <div>
            <span className="eyebrow">Synthèse</span>
            <h2>Ma campagne en un coup d’œil</h2>
          </div>
          <span className={`status ${isProfit ? 'sent' : 'pending'}`}>{isProfit ? 'Bénéfice' : 'Perte'}</span>
        </div>
        <div className="totals-grid summary-totals">
          <div><span>Total ventes</span><strong className="income-text">{formatAmount(totals.earned)}</strong></div>
          <div><span>Total dépenses</span><strong className="expense-text">{formatAmount(totals.spent)}</strong></div>
          <div className="balance-total"><span>Bénéfice net</span><strong className={isProfit ? 'income-text' : 'expense-text'}>{formatAmount(totals.balance)}</strong></div>
        </div>
        <p className="entry-count">
          {totals.earned > 0
            ? `Marge nette : ${new Intl.NumberFormat('fr-FR').format(Math.round((totals.balance / totals.earned) * 100))} % sur vos ventes.`
            : 'Enregistrez une première vente pour voir votre marge apparaître ici.'}
        </p>
      </motion.section>
      <EntryForm onSubmit={addEntry} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="section-heading journal-heading">
        <div>
          <span className="eyebrow">Dernières écritures</span>
          <h2>Votre activité</h2>
        </div>
        <span className="entry-count">{entries.length}/20</span>
      </div>
      <div className="entry-list">
        {entries.length === 0 ? (
          <div className="empty-state">Ajoutez votre première dépense ou vente pour commencer.</div>
        ) : entries.map((entry) => (
          <motion.article className="entry-item" key={entry.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
            <div className={`entry-type-icon ${entry.type}`}>{entry.type === 'income' ? '↗' : '↘'}</div>
            <div className="entry-info">
              <strong>{entry.category}</strong>
              <span>{entry.plot || 'Parcelle non précisée'} · {formatDate(entry.date)}</span>
            </div>
            <div className="entry-value">
              <strong className={entry.type === 'income' ? 'income-text' : 'expense-text'}>{entry.type === 'income' ? '+' : '-'}{formatAmount(entry.amount)}</strong>
              <button type="button" aria-label={`Supprimer ${entry.category}`} onClick={() => deleteEntry(entry.id)}>Supprimer</button>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  )
}

export default JournalScreen