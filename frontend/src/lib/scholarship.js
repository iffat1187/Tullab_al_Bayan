/** Scholarship percentages: any value from 0 to 100 with up to two decimal places. */

export const scholarshipHint = '0–100, up to two decimals (for example 43.3).'

/** Parses admin input. Blank means no scholarship. Returns `{ value }` or `{ error }`. */
export function parseScholarship(input) {
  const trimmed = String(input ?? '').trim().replace(/%$/, '').trim()
  if (trimmed === '') return { value: 0 }
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed) || Number(trimmed) > 100) {
    return { error: 'Enter a scholarship from 0 to 100% with up to two decimal places.' }
  }
  return { value: Number(trimmed) }
}

/** Database numeric -> number (PostgREST may send numerics as strings). */
export function toScholarship(value) {
  return value == null ? 0 : Number(value)
}

/** 43.3 -> "43.3%", 0 -> "None" (or the given fallback). */
export function formatScholarship(value, none = 'None') {
  const number = toScholarship(value)
  return number ? `${number.toLocaleString('en-US', { maximumFractionDigits: 2 })}%` : none
}
