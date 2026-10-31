export default function PageMessage({ title, description, action }) {
  return (
    <div className="rounded-[36px] bg-white px-6 py-16 text-center shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <h1 className="text-2xl font-black text-slate-900">{title}</h1>
      {description ? <p className="mx-auto mt-3 max-w-xl text-slate-500">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}
