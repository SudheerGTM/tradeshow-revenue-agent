export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A]">{title}</h1>
        {description && <p className="text-sm text-[#475569] mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
