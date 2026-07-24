export default function AgentLoading() {
  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Agent header skeleton */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-foreground/10 animate-pulse" />
            <div>
              <div className="h-5 w-32 rounded bg-foreground/10 animate-pulse mb-1" />
              <div className="h-3 w-20 rounded bg-foreground/5 animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-24 rounded-lg bg-foreground/5 animate-pulse" />
            <div className="h-9 w-9 rounded-lg bg-foreground/5 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Agent content skeleton */}
      <div className="flex-1 flex">
        {/* Chat/log area */}
        <div className="flex-1 flex flex-col p-6">
          <div className="flex-1 space-y-4 max-w-3xl mx-auto w-full">
            {/* Progress messages */}
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3" style={{ animationDelay: `${i * 150}ms` }}>
                <div className="w-8 h-8 rounded-full bg-foreground/10 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 rounded bg-foreground/10 animate-pulse" style={{ width: `${70 - i * 10}%` }} />
                  <div className="h-3 rounded bg-foreground/5 animate-pulse" style={{ width: `${50 - i * 5}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Screenshot panel skeleton */}
        <div className="hidden lg:block w-80 border-l border-border p-4">
          <div className="h-4 w-24 rounded bg-foreground/10 animate-pulse mb-4" />
          <div className="aspect-video rounded-xl bg-foreground/5 animate-pulse" />
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full rounded bg-foreground/5 animate-pulse" />
            <div className="h-3 w-3/4 rounded bg-foreground/5 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}
