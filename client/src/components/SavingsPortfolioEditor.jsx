import { useEffect, useState } from 'react'
import { PiggyBank, Save } from 'lucide-react'
import { formatCurrency, parseNumber } from '../lib/portfolio'

export default function SavingsPortfolioEditor({ values = {}, onSave }) {
    const [draft, setDraft] = useState({ currentValue: '', unrealizedPnL: '' })
    const [error, setError] = useState('')
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        const savedPerformance = values.unrealizedPnL
        setDraft({
            currentValue: values.currentValue === undefined ? '' : String(values.currentValue),
            unrealizedPnL: savedPerformance === undefined || savedPerformance === null || Number(savedPerformance) === 0 ? '' : String(savedPerformance),
        })
    }, [values.currentValue, values.unrealizedPnL])

    function handleSubmit(event) {
        event.preventDefault()
        const currentValue = parseNumber(draft.currentValue, Number.NaN)
        const hasPerformance = draft.unrealizedPnL.trim() !== ''
        const unrealizedPnL = hasPerformance ? parseNumber(draft.unrealizedPnL, Number.NaN) : null
        if (!Number.isFinite(currentValue) || (hasPerformance && !Number.isFinite(unrealizedPnL))) {
            setError('Renseigne une valeur actuelle et, si tu la connais, une plus-value ou moins-value valide.')
            setSaved(false)
            return
        }
        if (currentValue < 0 || (currentValue === 0 && unrealizedPnL !== null && unrealizedPnL !== 0) || (unrealizedPnL !== null && unrealizedPnL > currentValue)) {
            setError('Vérifie les montants : la valeur actuelle ne peut pas être négative et le capital de référence ne peut pas l’être non plus.')
            setSaved(false)
            return
        }

        onSave?.({ currentValue, unrealizedPnL, updatedAt: new Date().toISOString() })
        setError('')
        setSaved(true)
    }

    const currentValue = parseNumber(draft.currentValue, 0)
    const hasPerformance = draft.unrealizedPnL.trim() !== ''
    const unrealizedPnL = hasPerformance ? parseNumber(draft.unrealizedPnL, 0) : null
    const invested = hasPerformance ? Math.max(0, currentValue - unrealizedPnL) : null

    return (
        <section className="card dashboard-card full-span savings-editor-card" aria-labelledby="savings-editor-title">
            <div className="card-header-flex">
                <div>
                    <h3 id="savings-editor-title" className="card-title"><PiggyBank size={17} /> Solde de ton épargne salariale</h3>
                    <p className="card-subtitle">Une seule ligne pour tous tes fonds. La valeur compte dans « Tout » ; la performance est facultative.</p>
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
                    <span>Plus-value / moins-value cumulée (€) · facultatif</span>
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
                    <strong>{invested === null ? '—' : formatCurrency(invested, 'EUR')}</strong>
                </div>
                <button className="btn-primary savings-save-button" type="submit"><Save size={15} /> Enregistrer</button>
            </form>
            {error && <p className="savings-editor-feedback error" role="alert">{error}</p>}
            {saved && <p className="savings-editor-feedback success" role="status">Solde enregistré.</p>}
        </section>
    )
}
