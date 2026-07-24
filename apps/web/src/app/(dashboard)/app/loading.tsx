export default function AppLoading() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Chat area skeleton */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
        <div className="w-full max-w-[850px] mx-auto px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 space-y-8 pb-32">
          {/* AI Message skeleton */}
          <div className="flex flex-col w-full items-start">
            <div className="max-w-[85%] sm:max-w-[80%] px-0 py-1 space-y-2">
              <div className="h-4 bg-muted/50 rounded w-64 animate-pulse" />
              <div className="h-4 bg-muted/50 rounded w-48 animate-pulse" />
            </div>
          </div>
          
          {/* User Message skeleton */}
          <div className="flex flex-col w-full items-end">
            <div className="max-w-[85%] sm:max-w-[80%] px-4 py-2 bg-secondary border border-border rounded-2xl">
              <div className="h-4 bg-muted rounded w-32 animate-pulse" />
            </div>
          </div>
          
          {/* AI Message skeleton 2 */}
          <div className="flex flex-col w-full items-start">
            <div className="max-w-[85%] sm:max-w-[80%] px-0 py-1 space-y-2">
              <div className="h-4 bg-muted/50 rounded w-72 animate-pulse" />
              <div className="h-4 bg-muted/50 rounded w-56 animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Input skeleton - pill shape */}
      <div className="shrink-0 px-4 pb-4 pt-2">
        <div className="w-full max-w-[850px] mx-auto" style={{ maxWidth: '850px' }}>
          <div className="flex items-center gap-3 rounded-full bg-secondary border border-border py-3 px-4">
            <div className="w-5 h-5 rounded-full bg-muted animate-pulse flex-shrink-0" />
            <div className="flex-1">
              <div className="h-5 bg-muted rounded w-48 animate-pulse" />
            </div>
            <div className="w-10 h-10 rounded-full bg-muted animate-pulse flex-shrink-0" />
          </div>
        </div>
      </div>
    </div>
  )
}
