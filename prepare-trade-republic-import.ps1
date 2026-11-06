param(
    [Parameter(Mandatory = $true)]
    [string]$InputCsv,

    [Parameter(Mandatory = $true)]
    [string]$OutputCsv
)

$ErrorActionPreference = 'Stop'
$culture = [Globalization.CultureInfo]::InvariantCulture

function Read-Number([string]$value) {
    if ([string]::IsNullOrWhiteSpace($value)) { return [decimal]0 }
    return [decimal]::Parse($value.Trim(), $culture)
}

$tickerMap = @{
    BTC = 'BTC-EUR'; ETH = 'ETH-EUR'; ADA = 'ADA-EUR'; SOL = 'SOL-EUR'; XLM = 'XLM-EUR'; XRP = 'XRP-EUR'
    FR0000045072 = 'ACA.PA'; FR0000121014 = 'MC.PA'; FR0000124141 = 'VIE.PA'; FR0000125486 = 'DG.PA'
    FR0010282822 = 'VU.PA'; FR0010722819 = 'ALKAL.PA'; FR0011871110 = 'L8IN.DU'; FR0013254851 = '8JD.F'
    FR0014007ND6 = 'ALHAF.PA'; FR001400MDW2 = 'ALSTI.PA'; IE00B53SZB19 = 'SXRV.DE'; IE00B5BMR087 = 'SXR8.DE'
    KYG9830T1067 = '3CP.F'; LU2290522684 = 'INPST.AS'; LU3170240538 = 'LU3170240538'
    NL0010273215 = 'ASML.AS'; NL0011585146 = '2FE.DU'; NL0011872650 = 'BFIT.AS'
    US0079031078 = 'AMD.DE'; US02079K3059 = 'ABEA.DE'; US0231351067 = 'AMZ.DE'; US0378331005 = 'APC.F'
    US09247X1019 = 'BLK'; US09290D1019 = 'BLK'; US1912161007 = 'CCC3.DE'; US30303M1027 = 'FB2A.DE'
    US57636Q1040 = 'M4I.DE'; US5949181045 = 'MSF.DE'; US64110L1061 = 'NFC.DE'; US67066G1040 = 'NVD.DE'
    US68373M1071 = 'OPRA'; US8740391003 = 'TSFA.F'; US8740541094 = 'TKE.F'; US88160R1014 = 'TL0.DE'
    US92826C8394 = '3V64.DE'; XS2800678224 = 'XS2800678224'
}

$sourceRows = @(Import-Csv -LiteralPath $InputCsv)
$bondInterest = @($sourceRows | Where-Object { $_.type -eq 'INTEREST_PAYMENT' -and $_.symbol -eq 'XS2800678224' })
$cancelledCoupons = [System.Collections.Generic.HashSet[string]]::new()

foreach ($cancellation in ($bondInterest | Where-Object { (Read-Number $_.amount) -lt 0 })) {
    $cancellationNet = (Read-Number $cancellation.amount) + (Read-Number $cancellation.fee) + (Read-Number $cancellation.tax)
    $cancellationDate = [datetime]::ParseExact($cancellation.date, 'yyyy-MM-dd', $culture)
    $matchingPayment = $bondInterest |
        Where-Object {
            $_.date -lt $cancellation.date -and
            (Read-Number $_.amount) -gt 0 -and
            [math]::Abs([double]((Read-Number $_.amount) + (Read-Number $_.fee) + (Read-Number $_.tax) + $cancellationNet)) -lt 0.005 -and
            ($cancellationDate - [datetime]::ParseExact($_.date, 'yyyy-MM-dd', $culture)).TotalDays -le 14
        } |
        Sort-Object date -Descending |
        Select-Object -First 1

    if ($matchingPayment) {
        [void]$cancelledCoupons.Add([string]$matchingPayment.transaction_id)
        [void]$cancelledCoupons.Add([string]$cancellation.transaction_id)
    }
}

$events = [System.Collections.Generic.List[object]]::new()
$sequence = 0

foreach ($row in $sourceRows) {
    $isTrade = $row.category -eq 'TRADING' -and $row.type -in @('BUY', 'SELL')
    $isDividend = $row.type -eq 'DIVIDEND' -and -not [string]::IsNullOrWhiteSpace($row.symbol)
    $isBondCoupon = $row.type -eq 'INTEREST_PAYMENT' -and $row.symbol -eq 'XS2800678224' -and
        (Read-Number $row.amount) -gt 0 -and -not $cancelledCoupons.Contains([string]$row.transaction_id)
    $isCashInterest = $row.type -eq 'INTEREST_PAYMENT' -and [string]::IsNullOrWhiteSpace($row.symbol) -and
        (Read-Number $row.amount) -gt 0

    if (-not ($isTrade -or $isDividend -or $isBondCoupon -or $isCashInterest)) { continue }

    $sourceSymbol = [string]$row.symbol
    if (-not $isCashInterest -and -not $tickerMap.ContainsKey($sourceSymbol)) {
        throw "Aucune correspondance de ticker pour le symbole source $sourceSymbol (ligne $($sequence + 2))."
    }

    $ticker = if ($isCashInterest) { 'CASH-INT' } else { $tickerMap[$sourceSymbol] }
    $type = if ($isDividend -or $isBondCoupon -or $isCashInterest) { 'DIVIDEND' } else { $row.type }
    $quantity = [decimal]1
    $unitPrice = [decimal]0
    $fees = [math]::Abs((Read-Number $row.fee)) + [math]::Abs((Read-Number $row.tax))

    if ($isTrade) {
        $quantity = [math]::Abs((Read-Number $row.shares))
        $unitPrice = Read-Number $row.price

        # L'export enregistre le bonus d'actions du split NVDA séparément.
        # On répartit donc le split 10:1 sur les achats antérieurs pour préserver le PRU.
        if ($sourceSymbol -eq 'US67066G1040' -and $row.date -lt '2024-06-08') {
            $quantity *= 10
            $unitPrice /= 10
        }
    } else {
        $unitPrice = [math]::Abs((Read-Number $row.amount))
    }

    if ($quantity -le 0 -or $unitPrice -le 0) {
        throw "Quantité ou prix invalide dans la ligne source $($sequence + 2): $sourceSymbol."
    }
    if ($type -eq 'DIVIDEND' -and $fees -gt $unitPrice) {
        throw "Retenues supérieures au revenu brut dans la ligne source $($sequence + 2): $sourceSymbol."
    }

    $transactionId = [string]$row.transaction_id
    if ([string]::IsNullOrWhiteSpace($transactionId)) {
        $transactionId = "TR-$($row.date)-$type-$sourceSymbol-$sequence"
    }

    $dateTime = [datetimeoffset]::Parse($row.datetime, $culture)
    $sortKey = '{0}|{1:D13}|{2:D5}' -f $row.date, $dateTime.ToUnixTimeMilliseconds(), $sequence
    $note = if ($isCashInterest) { 'Intérêt perçu sur les liquidités du compte' } else { "Symbole source: $sourceSymbol" }
    if ($sourceSymbol -eq 'US67066G1040' -and $row.date -lt '2024-06-08') {
        $note += '; split NVIDIA du 08/06/2024 pris en compte'
    }
    if ($isBondCoupon) { $note = "Coupon obligataire; $note" }

    $events.Add([pscustomobject][ordered]@{
        sortKey = $sortKey
        date = $row.date
        type = $type
        ticker = $ticker
        name = if ($isCashInterest) { 'Intérêts espèces' } elseif ([string]::IsNullOrWhiteSpace($row.name)) { $ticker } else { [string]$row.name }
        quantity = $quantity
        unitPrice = $unitPrice
        fees = $fees
        currency = 'EUR'
        exchangeRate = [decimal]1
        note = $note
        id = $transactionId
    })
    $sequence++
}

$sorted = @($events | Sort-Object sortKey)

# L'export peut isoler une retenue corrective sans revenu brut sur une ligne.
# On l'ajoute aux frais de l'intérêt espèces suivant afin de préserver le net.
$cashTaxCorrections = @($sourceRows | Where-Object {
    $_.type -eq 'INTEREST_PAYMENT' -and [string]::IsNullOrWhiteSpace($_.symbol) -and
    (Read-Number $_.amount) -eq 0 -and (Read-Number $_.tax) -lt 0
})
foreach ($correction in $cashTaxCorrections) {
    $target = $sorted | Where-Object { $_.ticker -eq 'CASH-INT' -and $_.date -ge $correction.date } | Select-Object -First 1
    if ($null -eq $target) {
        $target = $sorted | Where-Object { $_.ticker -eq 'CASH-INT' } | Select-Object -Last 1
    }
    if ($null -eq $target) {
        throw "Retenue corrective d'intérêt sans ligne d'intérêt espèces associable: $($correction.date)."
    }
    $correctedTax = [math]::Abs((Read-Number $correction.tax))
    $target.fees += $correctedTax
    $target.note += "; retenue corrective de $($correctedTax.ToString('0.00', $culture)) EUR du $($correction.date)"
}

$duplicates = @($sorted | Group-Object id | Where-Object { $_.Count -gt 1 })
if ($duplicates.Count -gt 0) {
    throw "Identifiants source dupliqués: $(($duplicates | ForEach-Object Name) -join ', ')"
}

$csv = $sorted |
    Select-Object date, type, ticker, name, quantity, unitPrice, fees, currency, exchangeRate, note, id |
    ConvertTo-Csv -Delimiter ';' -NoTypeInformation
Set-Content -LiteralPath $OutputCsv -Value $csv -Encoding utf8

Write-Output "Fichier créé: $OutputCsv"
Write-Output "Opérations importables: $($sorted.Count)"
Write-Output "Achats: $( @($sorted | Where-Object type -eq 'BUY').Count )"
Write-Output "Ventes: $( @($sorted | Where-Object type -eq 'SELL').Count )"
Write-Output "Dividendes, coupons et intérêts: $( @($sorted | Where-Object type -eq 'DIVIDEND').Count )"
