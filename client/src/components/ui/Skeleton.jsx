export function Skeleton({ className = '', width, height }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width: width || '100%',
        height: height || '16px',
        minHeight: height || '16px',
      }}
    />
  );
}

export function TableSkeleton({ rows = 5, cols = 6 }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton
              key={j}
              height="14px"
              width={j === 0 ? '120px' : j === cols - 1 ? '80px' : `${60 + Math.random() * 80}px`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
          <Skeleton height="12px" width="60px" className="mb-2" />
          <Skeleton height="28px" width="80px" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton height="28px" width="200px" className="mb-2" />
          <Skeleton height="14px" width="300px" />
        </div>
        <Skeleton height="36px" width="120px" className="rounded-lg" />
      </div>
      <CardSkeleton />
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <Skeleton height="36px" width="100%" className="rounded-lg" />
        </div>
        <TableSkeleton />
      </div>
    </div>
  );
}
