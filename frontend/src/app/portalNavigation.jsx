import React, { useEffect } from 'react'
import {
  BookOpenCheck, CalendarDays, CalendarRange, CreditCard, Download, FileText,
  LayoutDashboard, ListChecks, Receipt, Tags, UserPlus, Users, UserRoundCheck, Wifi,
} from 'lucide-react'
import StaffDashboard from '../features/dashboard/StaffDashboard.jsx'
import AdminExport from '../features/admin/AdminExport.jsx'
import StaffAttendance from '../features/attendance/StaffAttendance.jsx'
import AccessRequests from '../features/admin/AccessRequests.jsx'
import StudentManagement from '../features/admin/StudentManagement.jsx'
import TeacherManagement from '../features/admin/TeacherManagement.jsx'
import AdminTuition from '../features/tuition/AdminTuition.jsx'
import StudentTuition from '../features/tuition/StudentTuition.jsx'
import OnlinePayment from '../features/tuition/OnlinePayment.jsx'
import AcademicCalendar from '../features/academics/AcademicCalendar.jsx'
import CurriculumDetails from '../features/academics/CurriculumDetails.jsx'
import CurriculumAnalysis from '../features/academics/CurriculumAnalysis.jsx'
import { WifiInstructions } from '../features/academics/AcademicPages.jsx'
import { HomeworkManagement, StudentHomework } from '../features/homework/HomeworkPages.jsx'
import { EmptyState, PageHeader } from '../components/ui.jsx'
import { StudentAttendance, StudentOverview } from './StudentPages.jsx'

export const roleLabels = { admin: 'Admin', teacher: 'Teacher', student: 'Student' }

const academics = { title: 'Course', pages: [
  { path: 'academic-calendar', title: 'Class calendar', icon: CalendarRange, page: <AcademicCalendar /> },
  { path: 'curriculum-details', title: 'Course books', icon: FileText, page: <CurriculumDetails /> },
  { path: 'curriculum-analysis', title: 'Skills we teach', icon: ListChecks, page: <CurriculumAnalysis /> },
] }

const institute = { title: 'Institute', pages: [
  { path: 'bayan-wifi', title: 'Wi-Fi', icon: Wifi, page: <WifiInstructions /> },
] }

const onlinePaymentPage = { path: 'online-payment', title: 'Online Payment', icon: CreditCard, page: <OnlinePayment /> }

// Older links stay reachable, but duplicate or unavailable pages are kept out of the sidebar.
const studentAccounts = { title: 'Fees', pages: [
  { path: 'student-ledger', hiddenFromSidebar: true, title: 'Tuition history', icon: Receipt, page: <StudentTuition title="Tuition history" /> },
  onlinePaymentPage,
  { path: 'tuition-fee-waiver', hiddenFromSidebar: true, title: 'Scholarship', icon: Tags, page: <StudentTuition title="Scholarship" waiverOnly /> },
] }

const adminAccounts = { title: 'Fees', pages: [
  onlinePaymentPage,
  { path: 'tuition', title: 'Monthly tuition', icon: CreditCard, page: <AdminTuition /> },
  { path: 'payment-records', title: 'Payments', icon: Receipt, page: <AdminTuition title="Payments" mode="payment" /> },
  { path: 'scholarship-management', title: 'Scholarships', icon: Tags, page: <AdminTuition title="Scholarships" mode="scholarship" /> },
  { path: 'student-ledgers', title: 'Student ledgers', icon: FileText, page: <AdminTuition title="Student ledgers" mode="ledger" /> },
  { path: 'export', title: 'Export Data', icon: Download, page: <AdminExport /> },
] }

export function navigationFor(role) {
  const main = [
    { path: '', title: 'Dashboard', icon: LayoutDashboard, page: role === 'student' ? <StudentOverview /> : <StaffDashboard /> },
    { path: 'attendance', title: 'Attendance', icon: CalendarDays, page: role === 'student' ? <StudentAttendance /> : <StaffAttendance /> },
    { path: 'homework', title: 'Homework', icon: BookOpenCheck,
      page: role === 'student' ? <StudentHomework /> : <HomeworkManagement role={role} /> },
  ]

  if (role === 'student') {
    main.push({ path: 'tuition', title: 'Tuition', icon: CreditCard, page: <StudentTuition title="Tuition" /> })
  }
  if (role === 'admin') {
    main.push({ path: 'access-requests', title: 'Access requests', icon: UserPlus, page: <AccessRequests /> })
    main.push({ path: 'students', title: 'Students', icon: Users, page: <StudentManagement /> })
    main.push({ path: 'teachers', title: 'Teacher Management', icon: UserRoundCheck, page: <TeacherManagement /> })
  }

  const groups = [{ title: 'Classroom', pages: main }]
  if (role === 'admin') groups.push(adminAccounts)
  groups.push(academics)
  if (role === 'student') groups.push(studentAccounts)
  if (role === 'teacher') groups.push({ title: 'Fees', pages: [onlinePaymentPage] })
  return [...groups, institute]
}

export function WorkspacePage({ section }) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = section.title + ' | Ṭullāb al-Bayān'
    return () => { document.title = previousTitle }
  }, [section.title])

  return section.page ?? <><PageHeader title={section.title} /><div className="panel"><EmptyState>{section.empty}</EmptyState></div></>
}
