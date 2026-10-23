export function TaskProgress({ checked, total }: { checked: number; total: number }) {
  const ratio = total ? checked / total : 0;
  return (
    <div className="task-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={checked}>
      <span style={{ transform: `scaleX(${ratio})` }} />
    </div>
  );
}
