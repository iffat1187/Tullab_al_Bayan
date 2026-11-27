// Shared tuition statuses. Kept free of Supabase imports so report builders can use them in isolation.
export const paymentStatuses = ['Paid', 'Unpaid']
export const coveredStatus = 'Covered by scholarship'
export const feeNotSetStatus = 'Fee not set'
export const noAmountDueStatus = 'No amount due'
// Client-only status for roster students with no monthly_tuition row for the selected month.
export const notGeneratedStatus = 'Not generated'
export const tuitionStatuses = [...paymentStatuses, coveredStatus, feeNotSetStatus, noAmountDueStatus]
