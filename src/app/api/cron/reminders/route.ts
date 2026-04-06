import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase';
import { processReminders, processTaskReminders } from '@/lib/cron/reminders';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const remindersFired = await processReminders();

    const db = createServerSupabase();
    const { data: users, error } = await db.from('users').select('id');
    if (error) throw error;

    let taskReminders = 0;
    for (const user of users || []) {
      try {
        taskReminders += await processTaskReminders(user.id);
      } catch (err) {
        console.error(`Task reminders failed for user ${user.id}:`, err);
      }
    }

    return NextResponse.json({ remindersFired, taskReminders });
  } catch (err) {
    console.error('Reminders cron error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
