import { useState } from "react";

function current(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(current);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("fxv-theme", next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      className="btn !px-2 !py-1"
      onClick={toggle}
      title="Theme wechseln"
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
