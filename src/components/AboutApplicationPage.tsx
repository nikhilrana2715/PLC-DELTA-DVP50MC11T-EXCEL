import { ChevronLeft, Factory, FileSpreadsheet, Info, Network, ShieldCheck, Sparkles } from 'lucide-react'

function InfoBlock({
  title,
  children,
  icon,
}: {
  title: string
  children: React.ReactNode
  icon: React.ReactNode
}) {
  return (
    <section className="bento overflow-hidden">
      <div className="flex items-center gap-3 px-4 md:px-5 pt-4 pb-3 border-b border-[var(--hairline)]">
        <div className="w-10 h-10 rounded-2xl grid place-items-center grad-violet text-white shrink-0">
          {icon}
        </div>
        <div className="font-bold text-slate-800">{title}</div>
      </div>
      <div className="p-4 md:p-5 text-sm leading-7 text-slate-600">{children}</div>
    </section>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return <li className="text-sm leading-7 text-slate-600">{children}</li>
}

export function AboutApplicationPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="max-w-4xl flex flex-col gap-4 md:gap-5">
      <div className="bento overflow-hidden">
        <div className="p-5 md:p-7 bg-[linear-gradient(135deg,rgba(124,108,240,0.12),rgba(42,120,214,0.08))]">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl bg-white border border-[var(--hairline)] text-slate-700 text-sm font-semibold px-3.5 py-2 hover:bg-slate-50 transition"
          >
            <ChevronLeft size={16} /> Back to Settings
          </button>

          <div className="mt-5 flex flex-col gap-4">
            <div className="w-14 h-14 rounded-2xl grid place-items-center grad-violet text-white shadow-sm">
              <Factory size={28} />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">About Application</div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-2">Morning Meeting Dashboard</h1>
              <p className="text-sm md:text-base text-slate-600 mt-3 max-w-3xl leading-7">
                This application gives the production team a single dashboard for the daily morning meeting, where
                machine performance, downtime, backlog, Cp-Cpk, notes and to-do actions from the uploaded Excel report
                are shown clearly.
              </p>
            </div>
          </div>
        </div>
      </div>

      <InfoBlock title="Application Overview" icon={<Info size={20} />}>
        <p>
          The Morning Meeting Dashboard is designed to make the factory reporting process simple and fast. A user
          uploads an Excel file, the system converts that data into a dashboard, and the entire team can then view the
          same information in one clean view.
        </p>
        <p className="mt-3">
          Its main goal is to reduce manual discussion during the meeting and to help the team quickly identify
          important issues such as low efficiency, repeated downtime, pending backlog and quality problems.
        </p>
      </InfoBlock>

      <InfoBlock title="Main Features" icon={<Sparkles size={20} />}>
        <ul className="list-disc pl-5 space-y-1">
          <Bullet>Upload a daily Excel file and convert it into a live dashboard.</Bullet>
          <Bullet>Highlight priority machines, especially low-efficiency cases.</Bullet>
          <Bullet>View machine-wise plan, achievement, backlog and remarks.</Bullet>
          <Bullet>Review downtime categories and remarks with visual charts.</Bullet>
          <Bullet>Maintain Cp-Cpk, cumulative records, notes and to-do task tracking.</Bullet>
          <Bullet>Improve team coordination through notifications and multi-device access.</Bullet>
        </ul>
      </InfoBlock>

      <InfoBlock title="How It Helps Users" icon={<FileSpreadsheet size={20} />}>
        <ul className="list-disc pl-5 space-y-1">
          <Bullet>Supervisors and the production team get updated information in one place.</Bullet>
          <Bullet>Meeting preparation is faster because the data is already in a structured format.</Bullet>
          <Bullet>Critical machines and urgent actions can be prioritized quickly.</Bullet>
          <Bullet>History and saved data remain useful for future review and follow-up.</Bullet>
        </ul>
      </InfoBlock>

      <InfoBlock title="Security And Access" icon={<ShieldCheck size={20} />}>
        <p>
          The application supports user-account-based access. Admin users get extra controls, such as user history and
          management-related actions, while normal users can focus on the dashboard data and operational flow.
        </p>
      </InfoBlock>

      <InfoBlock title="Connectivity And Usage" icon={<Network size={20} />}>
        <p>
          This app is suitable for working in a shared environment, where the same imported data can be accessed on
          different devices. This keeps information in sync across the office floor, production area and review points.
        </p>
        <p className="mt-3">
          Version: <span className="font-semibold text-slate-800">v1.0</span>
        </p>
      </InfoBlock>
    </div>
  )
}
