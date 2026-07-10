import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import ActivationPage from './pages/general/ActivationPage'
import OnboardingWizard from './pages/general/OnboardingWizard'
import RestorePage from './pages/general/RestorePage'
import CreateAdminPage from './pages/general/CreateAdminPage'
import LoginPage from './pages/general/LoginPage'
import Layout from './components/Layout'
import DashboardPage from './pages/dashboard/DashboardPage'
import StudentsPage from './pages/students/StudentsPage'
import StudentDetailPage from './pages/students/StudentDetailPage'
import TeachersPage from './pages/teachers/TeachersPage'
import TeacherDetailPage from './pages/teachers/TeacherDetailPage'
import ClassroomsPage from './pages/classrooms/ClassroomsPage'
import ClassroomDetailPage from './pages/classrooms/ClassroomDetailPage'
import GradesPage from './pages/grades/GradesPage'
import GradesComputePage from './pages/grades/GradesComputePage'
import TimetablePage from './pages/timetable/TimetablePage'
import ReportCardsPage from './pages/reports/ReportCardsPage'
import ReportCardViewPage from './pages/reports/ReportCardViewPage'
import ReportCardBatchPage from './pages/reports/ReportCardBatchPage'
import FinanceDashboardPage from './pages/finance/FinanceDashboardPage'
import TuitionPage from './pages/finance/TuitionPage'
import StudentReceiptPage from './pages/finance/StudentReceiptPage'
import SalariesPage from './pages/finance/SalariesPage'
import TeacherSalaryPage from './pages/finance/TeacherSalaryPage'
import ExpensesPage from './pages/finance/ExpensesPage'
import FinanceReportPage from './pages/finance/FinanceReportPage'
import FinanceSettingsPage from './pages/finance/FinanceSettingsPage'
import SubscriptionPage from './pages/finance/SubscriptionPage'
import AttendancePage from './pages/finance/AttendancePage'
import SettingsLayout from './pages/settings/SettingsLayout'
import SchoolSettingsPage from './pages/settings/SchoolSettingsPage'
import BulletinSettingsPage from './pages/settings/BulletinSettingsPage'
import StructureSettingsPage from './pages/settings/StructureSettingsPage'
import AssignmentsSettingsPage from './pages/settings/AssignmentsSettingsPage'
import SyncPage from './pages/settings/SyncPage'
import UsersPage from './pages/settings/UsersPage'
import api from './utils/api'
import './App.css'

function ExpiredScreen({ schoolName, expiry }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-steel-900">
      <div className="w-full max-w-sm p-8 text-center">
        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-medium text-steel-200 mb-2">Licence expirée</h1>
        <p className="text-sm text-steel-400 mb-4">{schoolName || 'ScolaDesk'}</p>
        <p className="text-sm text-steel-500">Votre licence a expiré le {expiry ? new Date(expiry).toLocaleDateString('fr-FR') : '—'}. Contactez ScolaDesk pour renouveler.</p>
      </div>
    </div>
  )
}

function SuspendedScreen({ schoolName }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-steel-900">
      <div className="w-full max-w-sm p-8 text-center">
        <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h1 className="text-xl font-medium text-steel-200 mb-2">Licence suspendue</h1>
        <p className="text-sm text-steel-500">{schoolName || 'ScolaDesk'} — Contactez ScolaDesk.</p>
      </div>
    </div>
  )
}

function TamperedScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-steel-900">
      <div className="w-full max-w-sm p-8 text-center">
        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="text-xl font-medium text-steel-200 mb-2">Erreur système</h1>
        <p className="text-sm text-steel-500">Une anomalie a été détectée. Contactez ScolaDesk.</p>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-steel-900">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 bg-steel-900 border-2 border-steel-700 rounded-2xl flex items-center justify-center">
          <span className="text-brand text-2xl font-semibold">S</span>
        </div>
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  )
}

function ProtectedApp({ schoolInfo }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!isAuthenticated) return <LoginPage onLogin={() => {}} />

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout schoolInfo={schoolInfo} />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/students/:id" element={<StudentDetailPage />} />
          <Route path="/teachers" element={<TeachersPage />} />
          <Route path="/teachers/:id" element={<TeacherDetailPage />} />
          <Route path="/classrooms" element={<ClassroomsPage />} />
          <Route path="/classrooms/:id" element={<ClassroomDetailPage />} />
          <Route path="/grades" element={<GradesPage />} />
          <Route path="/grades/compute" element={<GradesComputePage />} />
          <Route path="/timetable" element={<TimetablePage />} />
          <Route path="/report-cards" element={<ReportCardsPage />} />
          <Route path="/report-cards/batch" element={<ReportCardBatchPage />} />
          <Route path="/report-cards/:id" element={<ReportCardViewPage />} />
          <Route path="/finance" element={<FinanceDashboardPage />} />
          <Route path="/finance/tuition" element={<TuitionPage />} />
          <Route path="/finance/tuition/:studentId" element={<StudentReceiptPage />} />
          <Route path="/finance/salaries" element={<SalariesPage />} />
          <Route path="/finance/salaries/:teacherId" element={<TeacherSalaryPage />} />
<Route path="/finance/expenses" element={<ExpensesPage />} />
          <Route path="/finance/report" element={<FinanceReportPage />} />
          <Route path="/finance/settings" element={<FinanceSettingsPage />} />
          <Route path="/finance/subscription" element={<SubscriptionPage />} />
          <Route path="/finance/attendance" element={<AttendancePage />} />
          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<SchoolSettingsPage />} />
            <Route path="bulletins" element={<BulletinSettingsPage />} />
            <Route path="structure" element={<StructureSettingsPage />} />
            <Route path="affectations" element={<AssignmentsSettingsPage />} />
          </Route>
          <Route path="/sync" element={<SyncPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

function AppContent() {
  const [appState, setAppState] = useState('loading')
  const [schoolInfo, setSchoolInfo] = useState(null)
  const [restoreInfo, setRestoreInfo] = useState(null)

  async function checkStatus() {
    try {
      const res = await api.get('/api/activation/status')
      const { activated, configured, license_status, has_users } = res.data
      setSchoolInfo(res.data)

      if (!activated) { setAppState('activation'); return }
      if (license_status === 'tampered') { setAppState('tampered'); return }
      if (license_status === 'expired') { setAppState('expired'); return }
      if (license_status === 'suspended') { setAppState('suspended'); return }

      // Post-restore state: data is back but users are never synced
      if (configured && !has_users) { setAppState('create-admin'); return }

      if (!configured) {
        // New/wiped PC — offer the cloud backup if CAP has one.
        // Offline or no backup → normal onboarding.
        try {
          const rc = await api.get('/api/restore/check')
          if (rc.data.available) {
            setRestoreInfo(rc.data)
            setAppState('restore')
            return
          }
        } catch { /* offline — restore impossible anyway */ }
        setAppState('onboarding')
        return
      }

      setAppState('app')
    } catch { setTimeout(checkStatus, 1000) }
  }

  useEffect(() => { checkStatus() }, [])

  if (appState === 'loading') return <LoadingScreen />
  if (appState === 'activation') return <ActivationPage onActivated={() => { setAppState('loading'); checkStatus() }} />
  if (appState === 'tampered') return <TamperedScreen />
  if (appState === 'expired') return <ExpiredScreen schoolName={schoolInfo?.school_name} expiry={schoolInfo?.expiry} />
  if (appState === 'suspended') return <SuspendedScreen schoolName={schoolInfo?.school_name} />
  if (appState === 'restore') return (
    <RestorePage info={restoreInfo}
      onDone={() => { setAppState('loading'); checkStatus() }}
      onSkip={() => setAppState('onboarding')} />
  )
  if (appState === 'create-admin') return <CreateAdminPage onDone={() => { setAppState('loading'); checkStatus() }} />
  if (appState === 'onboarding') return <OnboardingWizard onComplete={() => setAppState('app')} />

  return <ProtectedApp schoolInfo={schoolInfo} />
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
