import { useState } from 'react'
import { motion } from 'framer-motion'
import { getTodayIsoDate } from '../db'

const categories = ['Engrais', 'Main-d’œuvre', 'Intrants', 'Vente récolte']

function EntryForm({ onSubmit }) {
  const [type, setType] = useState('expense')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(categories[0])
  const [plot, setPlot] = useState('')
  const [date, setDate] = useState(getTodayIsoDate())
  const [formError, setFormError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!amount || Number(amount) <= 0) {
      setFormError('Indiquez un montant supérieur à zéro.')
      return
    }
    const result = await onSubmit({ type, amount, category, plot, date })
    if (!result.success) {
      setFormError(result.error)
      return
    }
    setAmount('')
    setPlot('')
    setFormError('')
  }

  return (
    <form className="entry-form leaf-card" onSubmit={handleSubmit}>
      <div className="form-type-toggle" role="group" aria-label="Type d’écriture">
        <button type="button" className={type === 'expense' ? 'selected expense' : ''} onClick={() => setType('expense')}>
          Dépense
          {type === 'expense' && (
            <motion.span
              layoutId="toggle-glide"
              className="toggle-glide"
              transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.6 }}
            />
          )}
        </button>
        <button type="button" className={type === 'income' ? 'selected income' : ''} onClick={() => setType('income')}>
          Revenu
          {type === 'income' && (
            <motion.span
              layoutId="toggle-glide"
              className="toggle-glide"
              transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.6 }}
            />
          )}
        </button>
      </div>
      <label>
        Montant (FCFA)
        <input type="number" inputMode="numeric" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ex. 15 000" required />
      </label>
      <div className="form-grid">
        <label>
          Catégorie
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </label>
      </div>
      <label>
        Parcelle <span className="optional">(facultatif)</span>
        <input type="text" value={plot} onChange={(event) => setPlot(event.target.value)} placeholder="Ex. Champ derrière la maison" />
      </label>
      {formError && <p className="form-error" role="alert">{formError}</p>}
      <motion.button className="primary-button" type="submit" whileTap={{ scale: 0.97 }}>
        Enregistrer dans le carnet
      </motion.button>
    </form>
  )
}

export default EntryForm