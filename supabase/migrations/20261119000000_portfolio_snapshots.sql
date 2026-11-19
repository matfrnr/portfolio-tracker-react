-- Daily portfolio performance snapshots. Rows are isolated per user and scope.
create table if not exists public.portfolio_snapshots (
    user_id uuid not null references auth.users(id) on delete cascade,
    snapshot_date date not null,
    portfolio_scope text not null check (portfolio_scope in ('stocks', 'crypto', 'all')),
    current_value double precision not null default 0,
    invested double precision not null default 0,
    realized_pnl double precision not null default 0,
    unrealized_pnl double precision not null default 0,
    dividends_net double precision not null default 0,
    total_pnl double precision not null default 0,
    transaction_count integer not null default 0 check (transaction_count >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, snapshot_date, portfolio_scope)
);

create index if not exists portfolio_snapshots_user_scope_date_idx
    on public.portfolio_snapshots (user_id, portfolio_scope, snapshot_date desc);

alter table public.portfolio_snapshots enable row level security;
revoke all on public.portfolio_snapshots from public, anon, authenticated;
grant select, insert, update, delete on public.portfolio_snapshots to authenticated;

drop policy if exists "Users access only their portfolio snapshots" on public.portfolio_snapshots;
create policy "Users access only their portfolio snapshots"
    on public.portfolio_snapshots for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
