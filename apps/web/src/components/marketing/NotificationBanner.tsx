export const NotificationBanner = () => {
  return (
    <div className="bg-[var(--primary)] text-white text-center py-2 text-sm">
      <span className="opacity-90">New: AI Agents now available for Teams. </span>
      <a href="/teams" className="underline font-medium hover:no-underline">Learn more</a>
    </div>
  );
};
