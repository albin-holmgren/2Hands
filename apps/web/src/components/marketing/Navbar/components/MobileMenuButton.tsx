type MobileMenuButtonProps = {
  isOpen: boolean;
  onToggle: () => void;
};

export const MobileMenuButton = ({ isOpen, onToggle }: MobileMenuButtonProps) => {
  return (
    <button
      aria-label={isOpen ? "Close Menu" : "Open Menu"}
      type="button"
      onClick={onToggle}
      className="relative flex items-center justify-center w-9 h-9 text-zinc-700 dark:text-zinc-300 hover:text-zinc-500 dark:hover:text-zinc-100 transition-colors duration-150"
    >
      <div className="relative w-5 h-5 flex items-center justify-center">
        {/* Burger lines */}
        <div
          className="absolute inset-0 flex flex-col justify-center items-start gap-[5px] transition-all duration-200"
          style={{ opacity: isOpen ? 0 : 1, transform: isOpen ? "scale(0.7) rotate(-45deg)" : "scale(1) rotate(0deg)" }}
        >
          <span className="block h-px w-5 bg-current rounded-full" />
          <span className="block h-px w-5 bg-current rounded-full" />
          <span className="block h-px w-3 bg-current rounded-full" />
        </div>
        {/* X icon */}
        <div
          className="absolute inset-0 flex items-center justify-center transition-all duration-200"
          style={{ opacity: isOpen ? 1 : 0, transform: isOpen ? "scale(1) rotate(0deg)" : "scale(0.7) rotate(45deg)" }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </button>
  );
};
