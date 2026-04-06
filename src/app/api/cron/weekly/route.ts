import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase';
import { generateWeeklyReview } from '@/lib/cron/weekly';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = createServerSupabase();
    const { data: users, error } = await db.from('users').select('id');
    if (error) throw error;

    let processed = 0;
    for (const user of users || []) {
      try {
        await generateWeeklyReview(user.id);
        processed++;
      } catch (err) {
        console.error(`Weekly review failed for user ${user.id}:`, err);
      }
    }

    return NextResponse.json({ processed, total: users?.length || 0 });
  } catch (err) {
    console.error('Weekly cron error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
