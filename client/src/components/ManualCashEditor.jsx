import { useEffect, useState } from 'react'
import { PiggyBank, Save } from 'lucide-react'
import { formatCurrency, parseNumber } from '../lib/portfolio'

export default function ManualCashEditor({ values = {}, onSave }) {
    const [draft, setDraft] = useState({ livretA: '', lep: '' })
    const [error, setError] = useState('')
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        setDraft({
            livretA: values.livretA === undefined || values.livretA === null ? '' : String(values.livretA),
            lep: values.lep === undefined || values.lep === null ? '' : String(values.lep),
        })
    }, [values.livretA, values.lep])

    function handleSubmit(event) {
        event.preventDefault()
        const livretA = draft.livretA.trim() === '' ? 0 : parseNumber(draft.livretA, Number.NaN)
        const lep = draft.lep.trim() === '' ? 0 : parseNumber(draft.lep, Number.NaN)
        if (!Number.isFinite(livretA) || !Number.isFinite(lep) || livretA < 0 || lep < 0) {
            setError('Renseigne des soldes valides, supérieurs ou égaux à zéro.')
            setSaved(false)
            return
        }

        onSave?.({ livretA, lep, updatedAt: new Date().toISOString() })
        setError('')
        setSaved(true)
    }

    const total = Math.max(0, parseNumber(draft.livretA, 0)) + Math.max(0, parseNumber(draft.lep, 0))

    return (
        <section className="card dashboard-card full-span savings-editor-card" aria-labelledby="manual-cash-title">
            <div className="card-header-flex">
                <div>
                    <h3 id="manual-cash-title" className="card-title"><PiggyBank size={17} /> Livrets</h3>
                    <p className="card-subtitle">Saisis seulement les soldes actuels. Ils sont ajoutés au patrimoine total, sans calcul de performance.</p>
                </div>
                {values.updatedAt && <span className="savings-updated-at">Mis à jour le {new Date(values.updatedAt).toLocaleDateString('fr-FR')}</span>}
            </div>

            <form className="manual-cash-form" onSubmit={handleSubmit}>
                <label className="form-field">
                    <span>Livret A (€)</span>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={draft.livretA}
                        onChange={(event) => { setDraft((current) => ({ ...current, livretA: event.target.value })); setError(''); setSaved(false) }}
                        placeholder="ex. 8 500,00"
                        aria-label="Solde du Livret A en euros"
                    />
                </label>
                <label className="form-field">
                    <span>LEP (€)</span>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={draft.lep}
                        onChange={(event) => { setDraft((current) => ({ ...current, lep: event.target.value })); setError(''); setSaved(false) }}
                        placeholder="ex. 3 000,00"
                        aria-label="Solde du LEP en euros"
                    />
                </label>
                <div className="manual-cash-total">
                    <span>Total des livrets</span>
                    <strong>{formatCurrency(total, 'EUR')}</strong>
                </div>
                <button className="btn-primary savings-save-button" type="submit"><Save size={15} /> Enregistrer</button>
            </form>
            {error && <p className="savings-editor-feedback error" role="alert">{error}</p>}
            {saved && <p className="savings-editor-feedback success" role="status">Soldes enregistrés.</p>}
        </section>
    )
}
