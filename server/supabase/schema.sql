create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  profile_photo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.buyers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  location text not null,
  budget_min numeric,
  budget_max numeric,
  property_type text not null default 'Apartment',
  bedrooms text,
  purpose text not null default 'Buy',
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  property_address text not null,
  price numeric not null,
  budget_details text not null default '',
  area numeric,
  property_type text not null default 'Apartment',
  bedrooms text,
  description text not null default '',
  extra_details text not null default '',
  media jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists buyers_created_at_idx on public.buyers (created_at desc);
create index if not exists sellers_created_at_idx on public.sellers (created_at desc);
create index if not exists sellers_user_id_idx on public.sellers (user_id);

alter table public.users enable row level security;
alter table public.buyers enable row level security;
alter table public.sellers enable row level security;

alter table public.users add column if not exists profile_photo text not null default '';