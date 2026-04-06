import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase';
import { processGoalCheckins } from '@/lib/cron/goals';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = createServerSupabase();
    const { data: users, error } = await db.from('users').select('id');
    if (error) throw error;

    let checkins = 0;
    for (const user of users || []) {
      try {
        checkins += await processGoalCheckins(user.id);
      } catch (err) {
        console.error(`Goal check-in failed for user ${user.id}:`, err);
      }
    }

    return NextResponse.json({ checkins, total: users?.length || 0 });
  } catch (err) {
    console.error('Goals cron error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
