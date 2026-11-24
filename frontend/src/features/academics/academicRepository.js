import { scheduledClasses, shiftMonth } from './studentSchedule.js'

export function classDate() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Dhaka', dateStyle: 'short' }).format(new Date())
}

// Upcoming in-person classes for the next 14 days across the given batches (from listBatches()).
export function academicCalendar(batches) {
  const today = classDate()
  const month = today.slice(0, 7)
  const end = new Date(today + 'T00:00:00Z')
  end.setUTCDate(end.getUTCDate() + 14)
  const until = end.toISOString().slice(0, 10)
  return [month, shiftMonth(month, 1)].flatMap(period =>
    batches.flatMap(batch => scheduledClasses(batch, period)
      .filter(item => item.date >= today && item.date < until)
      .map(item => ({ ...item, batch: batch.name, type: 'In-person class' }))))
    .sort((first, second) => first.date.localeCompare(second.date))
}

export function instituteWifi() {
  return null
}
