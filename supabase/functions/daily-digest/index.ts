// ==========================================================================
// Supabase Edge Function: Daily Digest LINE Notification
// Path: supabase/functions/daily-digest/index.ts
// ==========================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. ดึงคีย์เชื่อมต่อฐานข้อมูลในระบบหลังบ้าน (Injected automatically by Supabase)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ""
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ""
    
    // 2. ดึงคีย์เชื่อมต่อ Line OA (ต้องตั้งค่าใน Dashboard -> Edge Functions -> Variables)
    const lineAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? ""
    const lineUserId = Deno.env.get('LINE_USER_ID') ?? ""

    if (!lineAccessToken || !lineUserId) {
      throw new Error("LINE_CHANNEL_ACCESS_TOKEN หรือ LINE_USER_ID ยังไม่ได้ตั้งค่าใน Environment Variables ของ Supabase")
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 3. ดึงรายวิชาเพื่อเตรียมอ้างอิง Emoji และชื่อภาษาไทย
    const { data: subjects, error: subjError } = await supabase
      .from('subjects')
      .select('*')

    if (subjError) throw subjError

    const subjectsMap = new Map(subjects.map(s => [s.id, s]));

    // Helper ในการประกอบชื่อวิชาและ Emoji
    const getSubjectLabel = (subjectId: string) => {
      const sub = subjectsMap.get(subjectId);
      return sub ? `${sub.name} ${sub.emoji}` : 'ทั่วไป ☕';
    }

    // 4. ดึงเฉพาะงานที่ยังไม่ได้เช็คเสร็จ (completed = false)
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .eq('completed', false)
      .order('due_date', { ascending: true })

    if (tasksError) throw tasksError

    // 5. คำนวณวันคงเหลืออิงตามเขตเวลาประเทศไทย (GMT+7)
    const today = new Date();
    // ปรับเทียบเวลาเป็นเวลาปัจจุบันที่กรุงเทพฯ
    const bangkokTimezoneOffset = 7 * 60; // 7 ชั่วโมงเป็นนาที
    const bangkokToday = new Date(today.getTime() + bangkokTimezoneOffset * 60 * 1000);
    bangkokToday.setUTCHours(0, 0, 0, 0);

    const getRemainingDaysText = (dueDateStr: string) => {
      const parts = dueDateStr.split('-');
      if (parts.length !== 3) return "";
      
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const day = parseInt(parts[2]);
      
      const due = new Date(Date.UTC(year, month, day));
      const diffTime = due.getTime() - bangkokToday.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        return "ส่งวันนี้! 🚨";
      } else if (diffDays < 0) {
        return `เลยกำหนดส่ง ${Math.abs(diffDays)} วัน! ⚠️`;
      } else {
        return `เหลือเวลาอีก ${diffDays} วัน 📅`;
      }
    }

    // 6. รวบรวมและจัดรูปแบบข้อความแจ้งเตือนภาษาไทย
    let messageText = "☕ Mellow Tracker: รายงานการบ้านคงเหลือประจำวัน ☕\n";
    messageText += "----------------------------------------\n\n";

    if (tasks.length === 0) {
      messageText += "🎉 ยินดีด้วยครับ! ไม่มีงานค้างอยู่ในรายการในขณะนี้\n";
      messageText += "สามารถจิบกาแฟ พักผ่อนได้เต็มที่เลยครับ! ☕";
    } else {
      tasks.forEach((task, index) => {
        const subjectLabel = getSubjectLabel(task.subject);
        const statusText = getRemainingDaysText(task.due_date);
        
        messageText += `${index + 1}. 📝 ชื่องาน: ${task.title}\n`;
        messageText += `    🏷️ วิชา: ${subjectLabel}\n`;
        messageText += `    ⏳ สถานะ: ${statusText}\n\n`;
      });
      messageText += "----------------------------------------\n";
      messageText += `รวมงานค้างทั้งหมด: ${tasks.length} งาน\n`;
      messageText += "ค่อยๆ เคลียร์ไปทีละนิด เป็นกำลังใจให้นะครับ! 💪☕";
    }

    // 7. ยิงส่ง Push Message ไปยังไลน์ของยูสเซอร์ผ่าน LINE Messaging API
    const lineResponse = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lineAccessToken}`
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [
          {
            type: "text",
            text: messageText
          }
        ]
      })
    })

    if (!lineResponse.ok) {
      const errorData = await lineResponse.text();
      throw new Error(`LINE API error: ${errorData}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: "LINE Daily Digest Sent Successfully", taskCount: tasks.length }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200 
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400 
      }
    )
  }
})
