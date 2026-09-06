type Role = "chief" | "research" | "builder";

// Keep older demos compatible while new surfaces can choose an explicit role.
const ROLE_BY_COLOR: Record<string, Role> = {
  "#3ec5a8": "chief",
  "#6a6bf5": "research",
  "#9b5cf6": "research",
  "#3b82f6": "research",
  "#f5a03c": "builder",
  "#f2622a": "builder",
};
const CHARACTER: Record<Role, string> = {
  chief: "/characters/pip.svg",
  research: "/characters/scout.svg",
  builder: "/characters/kit.svg",
};

export function LandingBotAvatar({
  color,
  role,
  size = 38,
  className,
}: {
  color?: string;
  role?: Role;
  size?: number;
  className?: string;
}) {
  const identity = role ?? ROLE_BY_COLOR[color?.toLowerCase() ?? ""] ?? "chief";

  return (
    <img
      aria-hidden="true"
      alt=""
      draggable={false}
      className={className}
      src={CHARACTER[identity]}
      height={size}
      style={{ display: "block", width: size, height: size, flex: "none" }}
      width={size}
    />
  );
}
