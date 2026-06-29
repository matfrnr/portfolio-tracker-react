import { useMemo, useState } from 'react'
import { formatCurrency } from '../lib/portfolio'

const initialState = {
    type: 'BUY',
    ticker: '',
    name: '',
    date: new Date().toISOString().split('T')[0],
    quantity: '',
    unitPrice: '',
    currentPrice: '',
    fees: '0',
    note: '',
}

export default function TransactionForm({ onSubmit }) {
    const [form, setForm] = useState(initialState)

    const total = useMemo(() => {
        const quantity = Number(form.quantity || 0)
        const unitPrice = Number(form.unitPrice || 0)
        const fees = Number(form.fees || 0)
        return quantity * unitPrice + fees
    }, [form])

    function updateField(key, value) {
        setForm((current) => ({ ...current, [key]: value }))
    }

    function handleSubmit(event) {
        event.preventDefault()
        onSubmit({
            ...form,
            ticker: form.ticker.trim().toUpperCase(),
            quantity: Number(form.quantity),
            unitPrice: Number(form.unitPrice),
            currentPrice: form.currentPrice === '' ? null : Number(form.currentPrice),
            fees: Number(form.fees || 0),
        })
        setForm(initialState)
    }

    return (
        <section className="panel">
            <div className="panel-heading">
                <div>
                    <p className="eyebrow">Transaction</p>
                    <h2>Enregistrer une opération</h2>
                </div>
            </div>

            <div className="toggle-group" role="tablist" aria-label="Type de transaction">
                {['BUY', 'SELL'].map((type) => (
                    <button
                        key={type}
                        type="button"
                        className={form.type === type ? 'toggle active' : 'toggle'}
                        onClick={() => updateField('type', type)}
                    >
                        {type === 'BUY' ? 'Achat' : 'Vente'}
                    </button>
                ))}
            </div>

            <form className="form-grid" onSubmit={handleSubmit}>
                <label>
                    Ticker
                    <input value={form.ticker} onChange={(e) => updateField('ticker', e.target.value)} placeholder="AAPL" required />
                </label>
                <label>
                    Nom
                    <input value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Apple Inc." />
                </label>
                <label>
                    Date
                    <input type="date" value={form.date} onChange={(e) => updateField('date', e.target.value)} required />
                </label>
                <label>
                    Quantité
                    <input type="number" min="0" step="any" value={form.quantity} onChange={(e) => updateField('quantity', e.target.value)} required />
                </label>
                <label>
                    {form.type === 'BUY' ? "Prix d'achat unitaire" : 'Prix de vente unitaire'}
                    <input type="number" min="0" step="any" value={form.unitPrice} onChange={(e) => updateField('unitPrice', e.target.value)} required />
                </label>
                <label>
                    Cours actuel
                    <input type="number" min="0" step="any" value={form.currentPrice} onChange={(e) => updateField('currentPrice', e.target.value)} placeholder="Optionnel" />
                </label>
                <label>
                    Frais
                    <input type="number" min="0" step="any" value={form.fees} onChange={(e) => updateField('fees', e.target.value)} />
                </label>
                <label>
                    Note
                    <input value={form.note} onChange={(e) => updateField('note', e.target.value)} placeholder="PEA, dividende réinvesti..." />
                </label>

                <div className="form-summary">
                    <span>Total brut</span>
                    <strong>{formatCurrency(total)}</strong>
                </div>

                <div className="form-actions">
                    <button type="button" className="button secondary" onClick={() => setForm(initialState)}>
                        Effacer
                    </button>
                    <button type="submit" className="button primary">
                        Enregistrer
                    </button>
                </div>
            </form>
        </section>
    )
}