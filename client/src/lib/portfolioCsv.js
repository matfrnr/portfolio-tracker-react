import { defaultCurrencyForTicker, uid } from './portfolio'

function normalizeHeader(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
}

function detectDelimiter(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] || ''
    const counts = { ';': 0, ',': 0, '\t': 0 }
    let quoted = false
    for (let i = 0; i < firstLine.length; i += 1) {
        if (firstLine[i] === '"') {
            if (quoted && firstLine[i + 1] === '"') i += 1
            else quoted = !quoted
        } else if (!quoted && Object.prototype.hasOwnProperty.call(counts, firstLine[i])) {
            counts[firstLine[i]] += 1
        }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

function parseRows(text, delimiter) {
    const rows = []
    let row = []
    let cell = ''
    let quoted = false
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i]
        if (char === '"') {
            if (quoted && text[i + 1] === '"') {
                cell += '"'
                i += 1
            } else quoted = !quoted
        } else if (!quoted && char === delimiter) {
            row.push(cell.trim())
            cell = ''
        } else if (!quoted && (char === '\n' || char === '\r')) {
            if (char === '\r' && text[i + 1] === '\n') i += 1
            row.push(cell.trim())
            if (row.some((value) => value !== '')) rows.push(row)
            row = []
            cell = ''
        } else {
            cell += char
        }
    }
    row.push(cell.trim())
    if (row.some((value) => value !== '')) rows.push(row)
    if (quoted) throw new Error('Le fichier CSV contient un guillemet qui ne se referme pas.')
    return rows
}

function columnIndex(headers, names) {
    const normalized = headers.map(normalizeHeader)
    for (const name of names) {
        const exact = normalized.indexOf(normalizeHeader(name))
        if (exact >= 0) return exact
    }
    return -1
}

function readCell(row, index) {
    return index >= 0 ? String(row[index] || '').trim() : ''
}

function parseLocalizedNumber(value) {
    const clean = String(value || '')
        .replace(/[\s\u00a0]/g, '')
        .replace(/[€$£¥]/g, '')
        .replace(/[()]/g, (char) => (char === '(' ? '-' : ''))
    if (!clean) return null
    const comma = clean.lastIndexOf(',')
    const dot = clean.lastIndexOf('.')
    let normalized = clean
    if (comma >= 0 && dot >= 0) {
        const decimalSeparator = comma > dot ? ',' : '.'
        normalized = clean.replace(decimalSeparator === ',' ? /\./g : /,/g, '').replace(decimalSeparator, '.')
    } else if (comma >= 0) {
        normalized = clean.replace(/\./g, '').replace(',', '.')
    }
    const number = Number(normalized)
    return Number.isFinite(number) ? number : null
}

function parseDate(value, rowNumber) {
    const text = String(value || '').trim()
    if (!text) return null
    const french = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
    if (french) {
        const [, day, month, year, hour = '12', minute = '00', second = '00'] = french
        return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), rowNumber)).toISOString()
    }
    const parsed = new Date(text)
    if (Number.isNaN(parsed.getTime())) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) parsed.setUTCHours(12, 0, rowNumber, 0)
    else parsed.setTime(parsed.getTime() + rowNumber)
    return parsed.toISOString()
}

function parseType(value) {
    const normalized = normalizeHeader(value)
    if (/divid|coupon|distribution/.test(normalized)) return 'DIVIDEND'
    if (/^(sell|sale|vente|cession|vendre)$/.test(normalized) || normalized.startsWith('vente') || normalized.startsWith('sell') || normalized.startsWith('sale')) return 'SELL'
    if (/^(buy|achat|purchase|acquisition|acquerir)$/.test(normalized) || normalized.startsWith('achat') || normalized.startsWith('buy') || normalized.startsWith('purchase')) return 'BUY'
    return null
}

const ALIASES = {
    date: ['date', 'tradedate', 'executiondate', 'operationdate', 'dateoperation', 'dateexecution', 'datedetransaction', 'datedoperation', 'settlementdate'],
    type: ['type', 'typeoperation', 'operation', 'operationtype', 'transaction', 'side', 'sens', 'sensoperation', 'nature'],
    ticker: ['ticker', 'symbol', 'symbole', 'instrument', 'codevaleur'],
    name: ['name', 'nom', 'asset', 'security', 'libelle', 'description'],
    quantity: ['quantity', 'qty', 'quantite', 'shares', 'units', 'parts', 'volume'],
    unitPrice: ['unitprice', 'priceperunit', 'executionprice', 'prixdexecution', 'price', 'prixunitaire', 'cours'],
    amount: ['amount', 'grossamount', 'totalamount', 'montant', 'montantbrut', 'total'],
    fees: ['fees', 'fee', 'commission', 'commissions', 'frais', 'tax', 'withholdingtax', 'retenue', 'retenuefiscale'],
    currency: ['currency', 'devise', 'ccy'],
    exchangeRate: ['exchangerate', 'fxrate', 'forexrate', 'tauxdechange', 'tauxchange'],
    note: ['note', 'memo', 'reference', 'comment', 'commentaire'],
    id: ['id', 'transactionid', 'orderid', 'tradeid', 'referenceid'],
}

export function parsePortfolioCSV(text) {
    const cleanText = String(text || '').replace(/^\uFEFF/, '').trim()
    if (!cleanText) throw new Error('Le fichier CSV est vide.')
    const rows = parseRows(cleanText, detectDelimiter(cleanText))
    if (rows.length < 2) throw new Error('Ajoutez au moins une opération sous la ligne des en-têtes.')
    const headers = rows[0]
    const columns = Object.fromEntries(Object.entries(ALIASES).map(([key, aliases]) => [key, columnIndex(headers, aliases)]))
    if (columns.date < 0 || columns.type < 0 || columns.ticker < 0) {
        throw new Error('Colonnes obligatoires introuvables. Il faut au minimum date, type et ticker. Téléchargez le modèle CSV pour voir le format attendu.')
    }
    if (columns.unitPrice < 0 && columns.amount < 0) {
        throw new Error('Colonne de prix ou montant introuvable. Ajoutez unitPrice ou amount au fichier.')
    }

    const transactions = []
    const rowErrors = []
    const seenIds = new Set()
    rows.slice(1).forEach((row, index) => {
        const lineNumber = index + 2
        const ticker = readCell(row, columns.ticker).toUpperCase()
        const type = parseType(readCell(row, columns.type))
        const date = parseDate(readCell(row, columns.date), index)
        const quantityValue = parseLocalizedNumber(readCell(row, columns.quantity))
        const unitPriceValue = parseLocalizedNumber(readCell(row, columns.unitPrice))
        const amountValue = parseLocalizedNumber(readCell(row, columns.amount))
        const feesValue = parseLocalizedNumber(readCell(row, columns.fees)) ?? 0
        if (!ticker || !type || !date) {
            rowErrors.push(`Ligne ${lineNumber} : ticker, type ou date manquant/invalide.`)
            return
        }
        const quantity = type === 'DIVIDEND' ? 1 : (quantityValue ?? 0)
        const unitPrice = type === 'DIVIDEND'
            ? Math.abs(amountValue ?? ((quantityValue || 1) * (unitPriceValue || 0)))
            : (unitPriceValue ?? (amountValue !== null && quantity > 0 ? Math.abs(amountValue) / quantity : 0))
        const currency = readCell(row, columns.currency).toUpperCase() || defaultCurrencyForTicker(ticker)
        const exchangeRate = parseLocalizedNumber(readCell(row, columns.exchangeRate))
        const importedId = readCell(row, columns.id)
        if (quantity <= 0 || unitPrice <= 0 || feesValue < 0 || !/^[A-Z]{3}$/.test(currency) || (type === 'DIVIDEND' && feesValue > unitPrice)) {
            rowErrors.push(`Ligne ${lineNumber} : quantité, montant, frais ou devise invalide.`)
            return
        }
        if (importedId && seenIds.has(importedId)) {
            rowErrors.push(`Ligne ${lineNumber} : identifiant de transaction dupliqué (${importedId}).`)
            return
        }
        if (importedId) seenIds.add(importedId)
        transactions.push({
            id: importedId || uid(),
            type,
            ticker,
            name: readCell(row, columns.name) || ticker,
            date,
            quantity,
            unitPrice,
            fees: feesValue,
            currency,
            exchangeRate: currency === 'EUR' ? 1 : (exchangeRate > 0 ? exchangeRate : null),
            note: readCell(row, columns.note),
            createdAt: date,
        })
    })

    if (transactions.length === 0) throw new Error(rowErrors[0] || 'Aucune opération valide trouvée dans ce fichier.')
    return { transactions, rowErrors, headers, rowCount: rows.length - 1 }
}

export function downloadPortfolioCSVTemplate() {
    const content = '\uFEFFdate;type;ticker;name;quantity;unitPrice;fees;currency;exchangeRate;note\r\n'
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'modele-transactions-portefeuille.csv'
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}
