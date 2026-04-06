-- NEXUS Initial Schema

-- Users
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  timezone text default 'Asia/Kolkata',
  created_at timestamptz default now()
);

-- Messages (chat history)
create table messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Courses
create table courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  code text,
  professor text,
  grading_policy jsonb default '{}',
  semester text,
  sentiment text,
  difficulty int,
  created_at timestamptz default now()
);

-- Marks
create table marks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  component text not null,
  score numeric not null,
  max_score numeric not null,
  date date,
  created_at timestamptz default now()
);

-- Recurring Schedule
create table recurring_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text not null,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time,
  type text default 'class',
  course_id uuid references courses(id) on delete set null,
  created_at timestamptz default now()
);

-- Events (one-off)
create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text not null,
  date date not null,
  time time,
  type text default 'event',
  course_id uuid references courses(id) on delete set null,
  priority text default 'medium',
  status text default 'upcoming',
  notes text,
  created_at timestamptz default now()
);

-- Tasks
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text not null,
  due_date date,
  status text default 'pending',
  priority text default 'medium',
  reminded_count int default 0,
  source_message text,
  created_at timestamptz default now()
);

-- Reminders
create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  message text not null,
  fire_at timestamptz not null,
  status text default 'scheduled',
  recurrence text,
  created_at timestamptz default now()
);

-- People
create table people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  relationship text,
  context text,
  sentiment text,
  created_at timestamptz default now()
);

-- Goals
create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  goal text not null,
  timeframe text default 'medium_term',
  current_value text,
  target_value text,
  status text default 'active',
  strategy text,
  blockers text[],
  last_mentioned_at timestamptz,
  created_at timestamptz default now()
);

-- Reasoning Cache
create table reasoning_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  cache_type text not null,
  data jsonb not null,
  computed_at timestamptz default now()
);

-- Indexes
create index idx_messages_user on messages(user_id, created_at desc);
create index idx_events_user_date on events(user_id, date);
create index idx_tasks_user_status on tasks(user_id, status);
create index idx_reminders_fire on reminders(fire_at, status);
create index idx_schedule_user_day on recurring_schedule(user_id, day_of_week);
create index idx_courses_user on courses(user_id);
create index idx_marks_course on marks(course_id);
create index idx_goals_user on goals(user_id, status);
create index idx_people_user on people(user_id);

-- Row Level Security
alter table users enable row level security;
alter table messages enable row level security;
alter table courses enable row level security;
alter table marks enable row level security;
alter table recurring_schedule enable row level security;
alter table events enable row level security;
alter table tasks enable row level security;
alter table reminders enable row level security;
alter table people enable row level security;
alter table goals enable row level security;
alter table reasoning_cache enable row level security;

-- RLS Policies: users can only access their own data
create policy "Users can view own data" on users for select using (auth.uid() = id);
create policy "Users can update own data" on users for update using (auth.uid() = id);

create policy "Users can view own messages" on messages for select using (auth.uid() = user_id);
create policy "Users can insert own messages" on messages for insert with check (auth.uid() = user_id);

create policy "Users can manage own courses" on courses for all using (auth.uid() = user_id);
create policy "Users can manage own marks" on marks for all using (auth.uid() = user_id);
create policy "Users can manage own schedule" on recurring_schedule for all using (auth.uid() = user_id);
create policy "Users can manage own events" on events for all using (auth.uid() = user_id);
create policy "Users can manage own tasks" on tasks for all using (auth.uid() = user_id);
create policy "Users can manage own reminders" on reminders for all using (auth.uid() = user_id);
create policy "Users can manage own people" on people for all using (auth.uid() = user_id);
create policy "Users can manage own goals" on goals for all using (auth.uid() = user_id);
create policy "Users can manage own cache" on reasoning_cache for all using (auth.uid() = user_id);

-- Service role bypass for API routes (cron jobs, extraction pipeline)
create policy "Service role full access messages" on messages for all using (true) with check (true);
create policy "Service role full access courses" on courses for all using (true) with check (true);
create policy "Service role full access marks" on marks for all using (true) with check (true);
create policy "Service role full access schedule" on recurring_schedule for all using (true) with check (true);
create policy "Service role full access events" on events for all using (true) with check (true);
create policy "Service role full access tasks" on tasks for all using (true) with check (true);
create policy "Service role full access reminders" on reminders for all using (true) with check (true);
create policy "Service role full access people" on people for all using (true) with check (true);
create policy "Service role full access goals" on goals for all using (true) with check (true);
create policy "Service role full access cache" on reasoning_cache for all using (true) with check (true);

-- Auto-create user record on auth signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
