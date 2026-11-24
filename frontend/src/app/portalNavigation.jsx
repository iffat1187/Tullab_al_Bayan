import React, { useEffect } from 'react'
import {
  BookOpenCheck, CalendarDays, CalendarRange, CreditCard, FileText,
  LayoutDashboard, ListChecks, Receipt, Tags, Users, Wifi,
} from 'lucide-react'
import StaffDashboard from '../features/dashboard/StaffDashboard.jsx'
import StaffAttendance from '../features/attendance/StaffAttendance.jsx'
import StudentManagement from '../features/admin/StudentManagement.jsx'
import AdminTuition from '../features/tuition/AdminTuition.jsx'
import StudentTuition from '../features/tuition/StudentTuition.jsx'
import AcademicCalendar from '../features/academics/AcademicCalendar.jsx'
import CurriculumDetails from '../features/academics/CurriculumDetails.jsx'
import CurriculumAnalysis from '../features/academics/CurriculumAnalysis.jsx'
import { WifiInstructions } from '../features/academics/AcademicPages.jsx'
import { HomeworkManagement, StudentHomework } from '../features/homework/HomeworkPages.jsx'
import { StudentAttendance, StudentOverview } from './StudentPages.jsx'

export const roleLabels = { admin: 'Admin', teacher: 'Teacher', student: 'Student' }

function EmptyPage({ message }) {
  return <p className="mt-5 max-w-2xl rounded-2xl border border-surface-border bg-surface p-5 text-slate-600">{message}</p>
}

const academics = { title: 'Academics', pages: [
  { path: 'curriculum-details', title: 'Curriculum Details', icon: FileText, page: <CurriculumDetails /> },
  { path: 'curriculum-analysis', title: 'Curriculum Analysis', icon: ListChecks, page: <CurriculumAnalysis /> },
  { path: 'academic-calendar', title: 'Academic Calendar', icon: CalendarRange, page: <AcademicCalendar /> },
] }

const institute = { title: 'Institute', pages: [
  { path: 'bayan-wifi', title: 'Bayan Wi-Fi', icon: Wifi, page: <WifiInstructions /> },
] }

const studentAccounts = { title: 'Accounts', pages: [
  { path: 'student-ledger', title: 'Student Ledger', icon: Receipt, page: <StudentTuition title="Student Ledger" /> },
  { path: 'online-payment', title: 'Online Payment', icon: CreditCard, empty: 'Online payment is currently unavailable.' },
  { path: 'tuition-fee-waiver', hiddenFromSidebar: true, title: 'Tuition Fee Waiver', icon: Tags, page: <StudentTuition title="Tuition Fee Waiver" waiverOnly /> },
] }

const adminAccounts = { title: 'Accounts', pages: [
  { path: 'student-ledgers', title: 'Student Ledgers', icon: Receipt, page: <AdminTuition title="Student Ledgers" mode="ledger" /> },
  { path: 'payment-records', title: 'Payment Records', icon: CreditCard, page: <AdminTuition title="Payment Records" mode="payment" /> },
  { path: 'scholarship-management', title: 'Scholarship Management', icon: Tags, page: <AdminTuition title="Scholarship Management" mode="scholarship" /> },
] }

export function navigationFor(role) {
  const main = [
    { path: '', title: 'Dashboard', icon: LayoutDashboard, page: role === 'student' ? <StudentOverview /> : <StaffDashboard /> },
    { path: 'attendance', title: 'Attendance', icon: CalendarDays, page: role === 'student' ? <StudentAttendance /> :
      <StaffAttendance workspaceLabel={role === 'teacher' ? 'Teacher workspace' : 'Admin dashboard'} /> },
    { path: 'homework', title: role === 'student' ? 'Homework' : 'Homework Management', icon: BookOpenCheck,
      page: role === 'student' ? <StudentHomework /> : <HomeworkManagement role={role} /> },
  ]

  if (role === 'student') {
    main.push({ path: 'tuition', title: 'Tuition', icon: CreditCard, page: <StudentTuition title="Tuition" /> })
  }
  if (role === 'admin') {
    main.push(
      { path: 'students', title: 'Student Management', icon: Users, page: <StudentManagement /> },
      { path: 'tuition', title: 'Tuition Management', icon: CreditCard, page: <AdminTuition /> },
    )
  }

  const groups = [{ title: 'Main', pages: main }, academics]
  if (role === 'student') groups.push(studentAccounts)
  if (role === 'admin') groups.push(adminAccounts)
  return [...groups, institute]
}

export function WorkspacePage({ section }) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = section.title + ' | Ṭullāb al-Bayān'
    return () => { document.title = previousTitle }
  }, [section.title])

  return section.page ?? <><h1>{section.title}</h1><EmptyPage message={section.empty} /></>
}
