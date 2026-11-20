import { useEffect, useState } from 'react'
import { PiggyBank, Save } from 'lucide-react'
import { formatCurrency, parseNumber } from '../lib/portfolio'

export default function SavingsPortfolioEditor({ values = {}, onSave }) {
    const [draft, setDraft] = useState({ currentValue: '', unrealizedPnL: '' })
    const [error, setError] = useState('')
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        setDraft({
            currentValue: values.currentValue === undefined ? '' : String(values.currentValue),
            unrealizedPnL: values.unrealizedPnL === undefined ? '' : String(values.unrealizedPnL),
        })
    }, [values.currentValue, values.unrealizedPnL])

    function handleSubmit(event) {
        event.preventDefault()
        const currentValue = parseNumber(draft.currentValue, Number.NaN)
        const unrealizedPnL = draft.unrealizedPnL.trim() === '' ? 0 : parseNumber(draft.unrealizedPnL, Number.NaN)
        if (!Number.isFinite(currentValue) || !Number.isFinite(unrealizedPnL)) {
            setError('Renseigne une valeur actuelle et une plus-value ou moins-value valide.')
            setSaved(false)
            return
        }
        if (currentValue < 0 || (currentValue === 0 && unrealizedPnL !== 0) || unrealizedPnL > currentValue) {
            setError('Vérifie les montants : la valeur actuelle ne peut pas être négative et le capital de référence ne peut pas l’être non plus.')
            setSaved(false)
            return
        }

        onSave?.({ currentValue, unrealizedPnL, updatedAt: new Date().toISOString() })
        setError('')
        setSaved(true)
    }

    const currentValue = parseNumber(draft.currentValue, 0)
    const unrealizedPnL = parseNumber(draft.unrealizedPnL, 0)
    const invested = Math.max(0, currentValue - unrealizedPnL)

    return (
        <section className="card dashboard-card full-span savings-editor-card" aria-labelledby="savings-editor-title">
            <div className="card-header-flex">
                <div>
                    <h3 id="savings-editor-title" className="card-title"><PiggyBank size={17} /> Solde de ton épargne salariale</h3>
                    <p className="card-subtitle">Une seule ligne pour tous tes fonds. La valeur et la performance sont saisies depuis ton relevé et incluses dans « Tout ».</p>
                </div>
                {values.updatedAt && <span className="savings-updated-at">Mis à jour le {new Date(values.updatedAt).toLocaleDateString('fr-FR')}</span>}
            </div>

            <form className="savings-editor-form" onSubmit={handleSubmit}>
                <label className="form-field">
                    <span>Valeur actuelle totale (€)</span>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={draft.currentValue}
                        onChange={(event) => { setDraft((current) => ({ ...current, currentValue: event.target.value })); setError(''); setSaved(false) }}
                        placeholder="ex. 8 500,00"
                        aria-label="Valeur actuelle totale de l'épargne salariale en euros"
                    />
                </label>
                <label className="form-field">
                    <span>Plus-value / moins-value cumulée (€)</span>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={draft.unrealizedPnL}
                        onChange={(event) => { setDraft((current) => ({ ...current, unrealizedPnL: event.target.value })); setError(''); setSaved(false) }}
                        placeholder="ex. 420,00 ou -120,00"
                        aria-label="Plus-value ou moins-value cumulée de l'épargne salariale en euros"
                    />
                </label>
                <div className="savings-invested-preview">
                    <span>Capital de référence calculé</span>
                    <strong>{formatCurrency(invested, 'EUR')}</strong>
                </div>
                <button className="btn-primary savings-save-button" type="submit"><Save size={15} /> Enregistrer</button>
            </form>
            {error && <p className="savings-editor-feedback error" role="alert">{error}</p>}
            {saved && <p className="savings-editor-feedback success" role="status">Solde enregistré.</p>}
        </section>
    )
}
