export default function Tabs({ currentTab, onChange }) {
    const tabs = [
        ['dashboard', 'Tableau de bord'],
        ['positions', 'Positions'],
        ['transaction', 'Transaction'],
        ['history', 'Historique'],
    ]

    return (
        <div className="tabs" role="tablist" aria-label="Navigation du portefeuille">
            {tabs.map(([id, label]) => (
                <button
                    key={id}
                    type="button"
                    className={currentTab === id ? 'tab active' : 'tab'}
                    onClick={() => onChange(id)}
                >
                    {label}
                </button>
            ))}
        </div>
    )
}