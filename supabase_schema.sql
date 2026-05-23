-- ==========================================================================
-- Supabase Schema & Seeding File for Mellow Tracker
-- Copy and run this script in your Supabase SQL Editor
-- ==========================================================================

-- 1. Create subjects table (ตารางเก็บรายวิชา/หมวดหมู่)
create table if not exists subjects (
  id text primary key,
  name text not null,
  emoji text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS) for subjects
alter table subjects enable row level security;

-- Create policies for public access (allowing anyone to read, edit for simplicity in local test)
create policy "Allow public read access on subjects" on subjects for select using (true);
create policy "Allow public write access on subjects" on subjects for all using (true) with check (true);

-- Seed default subjects (เพิ่มวิชาเริ่มต้น)
insert into subjects (id, name, emoji) values
  ('general', 'ทั่วไป', '☕'),
  ('math', 'คณิตศาสตร์', '📐'),
  ('science', 'วิทยาศาสตร์', '🔬'),
  ('english', 'ภาษาอังกฤษ', '🇬🇧'),
  ('thai', 'ภาษาไทย', '🇹🇭'),
  ('design', 'ศิลปะ/ดีไซน์', '🎨'),
  ('computer', 'คอมพิวเตอร์', '💻')
on conflict (id) do update 
set name = excluded.name, emoji = excluded.emoji;

-- 2. Create tasks table (ตารางบันทึกรายการงาน)
create table if not exists tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  due_date date not null,
  subject text not null default 'general' references subjects(id) on delete set default,
  completed boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS) for tasks
alter table tasks enable row level security;

-- Create policies for public access
create policy "Allow public access on tasks" on tasks for all using (true) with check (true);

-- 3. Enable Realtime for tasks table (เปิดใช้งานระบบ Realtime Sync)
alter publication supabase_realtime add table tasks;
