import {
  insertSchedule, insertEvent, insertTask, insertReminder,
} from './timeline';
import { upsertCourse, getCourseByName, upsertPerson } from './world';
import { upsertGoal } from './goals';
import { updateIdentity } from './identity';
import { updateCurrentState } from './dynamics';
import { insertMark } from '@/lib/db/queries';
import type { Extraction, ContextUpdate } from '@/lib/db/types';

const DAY_MAP: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

export async function processExtractions(
  userId: string,
  extractions: Extraction[],
  updates: ContextUpdate[]
): Promise<void> {
  const validExtractions = extractions.filter(e => e.confidence > 0.7);

  for (const extraction of validExtractions) {
    try {
      await processExtraction(userId, extraction);
    } catch (err) {
      console.error(`Failed to process extraction of type ${extraction.type}:`, err);
    }
  }

  for (const update of updates) {
    try {
      await processUpdate(userId, update);
    } catch (err) {
      console.error(`Failed to process update for ${update.layer}.${update.field}:`, err);
    }
  }
}

async function processExtraction(userId: string, extraction: Extraction): Promise<void> {
  const { type, data } = extraction;

  switch (type) {
    case 'schedule': {
      const days = (data.days as string[]) || [];
      const title = data.title as string;
      const time = data.time as string;
      const scheduleType = (data.type as string) || 'class';

      let courseId: string | undefined;
      if (title) {
        const course = await getCourseByName(userId, title);
        if (course) courseId = course.id;
      }

      for (const day of days) {
        const dayNum = DAY_MAP[day.toLowerCase()];
        if (dayNum !== undefined) {
          await insertSchedule(userId, {
            title,
            day_of_week: dayNum,
            start_time: time,
            type: scheduleType,
            course_id: courseId,
          });
        }
      }
      break;
    }

    case 'event': {
      let courseId: string | undefined;
      const courseName = data.course_name as string || data.course as string;
      if (courseName) {
        const course = await getCourseByName(userId, courseName);
        if (course) courseId = course.id;
      }

      await insertEvent(userId, {
        title: data.title as string,
        date: data.date as string,
        time: data.time as string || undefined,
        type: (data.type as string) || 'event',
        course_id: courseId,
        priority: (data.priority as 'high' | 'medium' | 'low') || 'medium',
        notes: data.notes as string || undefined,
      });
      break;
    }

    case 'task': {
      await insertTask(userId, {
        title: data.title as string,
        due_date: data.due_date as string || undefined,
        status: 'pending',
        priority: (data.priority as 'high' | 'medium' | 'low') || 'medium',
        source_message: data.source_message as string || undefined,
      });
      break;
    }

    case 'reminder': {
      await insertReminder(userId, {
        message: data.message as string,
        fire_at: data.fire_at as string,
        status: 'scheduled',
        recurrence: data.recurrence as string || undefined,
      });
      break;
    }

    case 'mark': {
      const courseName = data.course_name as string || data.course as string;
      let courseId: string | undefined;

      if (courseName) {
        let course = await getCourseByName(userId, courseName);
        if (!course) {
          course = await upsertCourse(userId, { name: courseName });
        }
        courseId = course.id;
      }

      if (courseId) {
        await insertMark(userId, {
          course_id: courseId,
          component: data.component as string,
          score: data.score as number,
          max_score: data.max_score as number,
          date: data.date as string || undefined,
        });
      }
      break;
    }

    case 'person': {
      await upsertPerson(userId, {
        name: data.name as string,
        relationship: data.relationship as string || undefined,
        context: data.context as string || undefined,
        sentiment: data.sentiment as string || undefined,
      });
      break;
    }

    case 'belief': {
      const category = (data.category as 'personality' | 'cognitive_style' | 'communication' | 'values' | 'basics') || 'personality';
      const trait = data.trait as string || data.belief as string || JSON.stringify(data);
      await updateIdentity(userId, trait, category);
      break;
    }

    case 'goal': {
      await upsertGoal(userId, {
        goal: data.goal as string,
        timeframe: (data.timeframe as 'short_term' | 'medium_term' | 'long_term') || 'medium_term',
        target_value: data.target_value as string || undefined,
        current_value: data.current_value as string || undefined,
        strategy: data.strategy as string || undefined,
        blockers: data.blockers as string[] || undefined,
      });
      break;
    }

    case 'course_policy': {
      const name = data.course_name as string || data.course as string;
      if (name) {
        let course = await getCourseByName(userId, name);
        if (!course) {
          course = await upsertCourse(userId, { name });
        }
        const policy = { ...data };
        delete policy.course_name;
        delete policy.course;
        await upsertCourse(userId, {
          id: course.id,
          grading_policy: policy as Record<string, number>,
        });
      }
      break;
    }
  }
}

async function processUpdate(userId: string, update: ContextUpdate): Promise<void> {
  switch (update.layer) {
    case 'identity':
      await updateIdentity(userId, update.new_value, 'personality');
      break;
    case 'dynamics':
      if (update.field.includes('mood') || update.field.includes('energy') || update.field.includes('state')) {
        await updateCurrentState(userId, { [update.field]: update.new_value });
      }
      break;
  }
}
