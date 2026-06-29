import { formatCurrency, formatPercent } from '../lib/portfolio'

export default function StatCard({ label, value, delta, tone = 'neutral', percentage }) {
    return (
        <article className="stat-card">
            <p className="stat-label">{label}</p>
            <p className={`stat-value ${tone}`}>{formatCurrency(value)}</p>
            {typeof delta === 'number' && (
                <p className={`stat-delta ${delta >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(delta)} {typeof percentage === 'number' ? `• ${formatPercent(percentage)}` : ''}
                </p>
            )}
        </article>
    )
}