import { getDueReminders, updateReminder, insertMessage, getPendingTasks, getOverdueTasks, updateTask } from '@/lib/db/queries';

const MAX_REMINDERS_PER_TASK_PER_DAY = 2;

export async function processReminders(): Promise<number> {
  const dueReminders = await getDueReminders();
  let firedCount = 0;

  for (const reminder of dueReminders) {
    try {
      await insertMessage(reminder.user_id, 'assistant', reminder.message, {
        proactive: true,
        type: 'reminder',
        reminder_id: reminder.id,
      });

      await updateReminder(reminder.id, { status: 'fired' });

      if (reminder.recurrence === 'daily') {
        const nextFire = new Date(reminder.fire_at);
        nextFire.setDate(nextFire.getDate() + 1);
        await updateReminder(reminder.id, {
          status: 'scheduled',
          fire_at: nextFire.toISOString(),
        });
      } else if (reminder.recurrence === 'weekly') {
        const nextFire = new Date(reminder.fire_at);
        nextFire.setDate(nextFire.getDate() + 7);
        await updateReminder(reminder.id, {
          status: 'scheduled',
          fire_at: nextFire.toISOString(),
        });
      }

      firedCount++;
    } catch (err) {
      console.error(`Failed to process reminder ${reminder.id}:`, err);
    }
  }

  return firedCount;
}

export async function processTaskReminders(userId: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const tasks = await getPendingTasks(userId);
  const overdue = await getOverdueTasks(userId);
  let sentCount = 0;

  for (const task of overdue) {
    if (task.reminded_count >= MAX_REMINDERS_PER_TASK_PER_DAY) continue;

    await insertMessage(userId, 'assistant',
      `Hey — "${task.title}" was due ${task.due_date}. Still on your plate?`,
      { proactive: true, type: 'task_reminder', task_id: task.id }
    );

    await updateTask(task.id, {
      reminded_count: task.reminded_count + 1,
      status: 'overdue',
    });
    sentCount++;
  }

  const dueTodayOrTomorrow = tasks.filter(t => {
    if (!t.due_date) return false;
    const diff = (new Date(t.due_date).getTime() - new Date(today).getTime()) / 86400000;
    return diff >= 0 && diff <= 1;
  });

  for (const task of dueTodayOrTomorrow) {
    if (task.reminded_count >= MAX_REMINDERS_PER_TASK_PER_DAY) continue;

    const isToday = task.due_date === today;
    const msg = isToday
      ? `Heads up — "${task.title}" is due today.`
      : `"${task.title}" is due tomorrow. Just checking in.`;

    await insertMessage(userId, 'assistant', msg, {
      proactive: true, type: 'task_reminder', task_id: task.id,
    });

    await updateTask(task.id, { reminded_count: task.reminded_count + 1 });
    sentCount++;
  }

  return sentCount;
}
