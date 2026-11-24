// Batches come from public.batches: { name, dayOfWeek (0 = Sunday), classTime, venue }.

const toDate = value => new Date(value + 'T00:00:00Z')
const toIso = date => date.toISOString().slice(0, 10)

export function shiftMonth(month, offset) {
  const date = toDate(month + '-01')
  date.setUTCMonth(date.getUTCMonth() + offset)
  return toIso(date).slice(0, 7)
}

export function monthDays(month) {
  const first = toDate(month + '-01')
  const end = toDate(shiftMonth(month, 1) + '-01')
  const days = []
  for (const date = new Date(first); date < end; date.setUTCDate(date.getUTCDate() + 1)) {
    days.push({ date: toIso(date), day: date.getUTCDate(), weekday: date.getUTCDay() })
  }
  return days
}

function formatClassTime(value) {
  if (!value) return null
  const [hours, minutes] = value.split(':').map(Number)
  const date = new Date(Date.UTC(1970, 0, 1, hours, minutes))
  return new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(date)
}

export function scheduledClasses(batch, month) {
  if (!batch || !Number.isInteger(batch.dayOfWeek)) return []
  const details = { time: formatClassTime(batch.classTime), venue: batch.venue ?? null }
  return monthDays(month).filter(day => day.weekday === batch.dayOfWeek)
    .map(day => ({ ...day, ...details }))
}

export function nextClassDate(batch, today) {
  if (!batch || !Number.isInteger(batch.dayOfWeek)) return null
  const date = toDate(today)
  date.setUTCDate(date.getUTCDate() + (batch.dayOfWeek - date.getUTCDay() + 7) % 7)
  return toIso(date)
}
