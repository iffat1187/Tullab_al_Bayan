const bdt = new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const month = new Intl.DateTimeFormat('en-BD', { month: 'long', year: 'numeric', timeZone: 'Asia/Dhaka' })

export function formatTuitionAmount(amount) {
  return bdt.format(Number(amount))
}

export function formatBillingMonth(value) {
  if (!value) return ''
  const normalized = value.length === 7 ? `${value}-01` : value
  return month.format(new Date(`${normalized}T00:00:00+06:00`))
}
