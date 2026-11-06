-- Private portfolio data: every row belongs to the authenticated Supabase user.
create table if not exists public.transactions (
    user_id uuid not null references auth.users(id) on delete cascade,
    id text not null,
    type text not null check (type in ('BUY', 'SELL', 'DIVIDEND')),
    ticker text not null,
    name text not null,
    date timestamptz not null,
    quantity double precision not null,
    unit_price double precision not null,
    fees double precision not null default 0,
    note text,
    currency text not null default 'EUR',
    exchange_rate double precision not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, id)
);

create index if not exists transactions_user_date_idx
    on public.transactions (user_id, date desc);

create table if not exists public.asset_prices (
    user_id uuid not null references auth.users(id) on delete cascade,
    ticker text not null,
    current_price double precision not null check (current_price > 0),
    currency text not null default 'EUR',
    updated_at timestamptz not null default now(),
    primary key (user_id, ticker)
);

create table if not exists public.portfolio_settings (
    user_id uuid primary key references auth.users(id) on delete cascade,
    currencies jsonb not null default '{}'::jsonb,
    asset_metadata jsonb not null default '{}'::jsonb,
    tag_catalog jsonb not null default '["Action", "ETF", "PEA", "CTO"]'::jsonb,
    updated_at timestamptz not null default now()
);

alter table public.transactions enable row level security;
alter table public.asset_prices enable row level security;
alter table public.portfolio_settings enable row level security;

revoke all on public.transactions, public.asset_prices, public.portfolio_settings from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.transactions, public.asset_prices, public.portfolio_settings to authenticated;

drop policy if exists "Users access only their transactions" on public.transactions;
create policy "Users access only their transactions"
    on public.transactions for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Users access only their asset prices" on public.asset_prices;
create policy "Users access only their asset prices"
    on public.asset_prices for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Users access only their portfolio settings" on public.portfolio_settings;
create policy "Users access only their portfolio settings"
    on public.portfolio_settings for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- A single database transaction for full imports/replacements.
create or replace function public.import_portfolio(
    p_transactions jsonb,
    p_prices jsonb default '{}'::jsonb,
    p_currencies jsonb default '{}'::jsonb,
    p_replace boolean default false,
    p_replace_prices boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
    current_user_id uuid := auth.uid();
begin
    if current_user_id is null then
        raise exception 'Authentication required';
    end if;

    if p_replace then
        delete from public.transactions where user_id = current_user_id;
    end if;
    if p_replace_prices then
        delete from public.asset_prices where user_id = current_user_id;
    end if;

    insert into public.transactions (
        user_id, id, type, ticker, name, date, quantity, unit_price,
        fees, note, currency, exchange_rate, created_at, updated_at
    )
    select
        current_user_id,
        row_data->>'id',
        row_data->>'type',
        upper(row_data->>'ticker'),
        coalesce(nullif(row_data->>'name', ''), row_data->>'ticker'),
        (row_data->>'date')::timestamptz,
        (row_data->>'quantity')::double precision,
        (row_data->>'unit_price')::double precision,
        coalesce((row_data->>'fees')::double precision, 0),
        nullif(row_data->>'note', 'null'),
        coalesce(nullif(row_data->>'currency', ''), 'EUR'),
        coalesce((row_data->>'exchange_rate')::double precision, 1),
        coalesce((row_data->>'created_at')::timestamptz, now()),
        now()
    from jsonb_array_elements(coalesce(p_transactions, '[]'::jsonb)) as rows(row_data)
    on conflict (user_id, id) do update set
        type = excluded.type,
        ticker = excluded.ticker,
        name = excluded.name,
        date = excluded.date,
        quantity = excluded.quantity,
        unit_price = excluded.unit_price,
        fees = excluded.fees,
        note = excluded.note,
        currency = excluded.currency,
        exchange_rate = excluded.exchange_rate,
        updated_at = now();

    insert into public.asset_prices (user_id, ticker, current_price, currency, updated_at)
    select current_user_id, upper(price.ticker), price.value::double precision,
           coalesce(nullif(p_currencies->>price.ticker, ''), 'EUR'), now()
    from jsonb_each_text(coalesce(p_prices, '{}'::jsonb)) as price(ticker, value)
    where price.value::double precision > 0
    on conflict (user_id, ticker) do update set
        current_price = excluded.current_price,
        currency = excluded.currency,
        updated_at = now();
end;
$$;

revoke all on function public.import_portfolio(jsonb, jsonb, jsonb, boolean, boolean) from public, anon;
grant execute on function public.import_portfolio(jsonb, jsonb, jsonb, boolean, boolean) to authenticated;
