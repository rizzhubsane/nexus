import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase';
import { runAllMonitors } from '@/lib/brain/monitors';
import { attentionFilter } from '@/lib/brain/attention';
import { generateProactiveMessage } from '@/lib/brain/conscious';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = createServerSupabase();
    const { data: users, error } = await db
      .from('users')
      .select('id, timezone');

    if (error) throw error;

    if (!users || users.length === 0) {
      return NextResponse.json({ message: 'No users', results: [] });
    }

    const results: Array<Record<string, unknown>> = [];

    for (const user of users) {
      try {
        // LAYER 1: Run all monitors (pure SQL, no LLM)
        const triggers = await runAllMonitors(
          user.id,
          (user.timezone as string) || 'Asia/Kolkata'
        );

        if (triggers.length === 0) {
          results.push({ userId: user.id, action: 'silent', reason: 'No triggers' });
          continue;
        }

        // Process triggers in priority order (already sorted by urgency)
        for (const trigger of triggers) {
          // LAYER 2: Attention filter (pure code, no LLM)
          const decision = await attentionFilter(trigger);

          if (!decision.shouldSpeak) {
            results.push({
              userId: user.id,
              trigger: trigger.type,
              action: 'filtered',
              reason: decision.reason,
            });
            continue;
          }

          // LAYER 3: Generate message (LLM call — minimal context)
          const message = await generateProactiveMessage(trigger);

          const itemId =
            (trigger.data?.event as Record<string, unknown>)?.id ||
            (trigger.data?.task as Record<string, unknown>)?.id ||
            (trigger.data?.goal as Record<string, unknown>)?.id ||
            (trigger.data?.reminder as Record<string, unknown>)?.id ||
            'general';

          const triggerFingerprint = `${trigger.type}:${JSON.stringify(itemId)}`;

          await db.from('messages').insert({
            user_id: user.id,
            role: 'assistant',
            content: message,
            metadata: {
              proactive: true,
              trigger: trigger.type,
              urgency: trigger.urgency,
              triggerFingerprint,
            },
          });

          // Increment reminded_count for overdue tasks
          if (trigger.type === 'task_overdue') {
            const task = trigger.data.task as Record<string, unknown>;
            if (task?.id) {
              await db
                .from('tasks')
                .update({ reminded_count: ((task.reminded_count as number) || 0) + 1 })
                .eq('id', task.id as string);
            }
          }

          results.push({
            userId: user.id,
            trigger: trigger.type,
            action: 'sent',
            urgency: trigger.urgency,
          });

          // Only send one proactive message per user per heartbeat cycle
          break;
        }
      } catch (err) {
        console.error(`Heartbeat error for user ${user.id}:`, err);
        results.push({ userId: user.id, action: 'error', error: String(err) });
      }
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (err) {
    console.error('Heartbeat cron error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
