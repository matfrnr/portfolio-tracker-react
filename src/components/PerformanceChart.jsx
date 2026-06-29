import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Line } from 'recharts'
import { formatCurrency } from '../lib/portfolio'

export default function PerformanceChart({ data }) {
    return (
        <section className="panel chart-panel">
            <div className="panel-heading">
                <div>
                    <p className="eyebrow">Évolution</p>
                    <h2>Capital investi vs valeur estimée</h2>
                </div>
            </div>

            <div className="chart-area">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#4f98a3" stopOpacity={0.35} />
                                <stop offset="95%" stopColor="#4f98a3" stopOpacity={0.02} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(122,121,116,0.15)" vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} />
                        <YAxis tickFormatter={formatCurrency} tickLine={false} axisLine={false} width={90} />
                        <Tooltip formatter={(value) => formatCurrency(value)} />
                        <Area type="monotone" dataKey="value" stroke="#4f98a3" fill="url(#valueFill)" strokeWidth={2} />
                        <Line type="monotone" dataKey="invested" stroke="#5591c7" strokeWidth={2} dot={false} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </section>
    )
}