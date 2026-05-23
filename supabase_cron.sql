-- ==========================================================================
-- Supabase SQL Cron Scheduler (pg_cron)
-- Run this in your Supabase SQL Editor to automate daily notifications
-- ==========================================================================

-- 1. เปิดใช้ extension ที่จำเป็น
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. สร้างรายการตั้งเวลาส่ง Line OA ทุกวันตอน 8:00 น. (เวลาประเทศไทย UTC+7 ตรงกับ 01:00 น. UTC)
select cron.schedule(
  'mellow-daily-digest',
  '0 1 * * *', -- รันทุกวันเวลา 01:00 น. UTC (08:00 น. ประเทศไทย)
  $$
  select net.http_post(
    -- เปลี่ยน 'your-project-id' เป็น Project ID ของคุณ
    url := 'https://your-project-id.supabase.co/functions/v1/daily-digest',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'
  )
  $$
);

-- ==========================================================================
-- วิธีการลบการตั้งเวลาหากไม่ต้องการใช้งานแล้ว:
-- select cron.unschedule('mellow-daily-digest');
-- ==========================================================================
