import type { ReactNode } from "react";

interface HeaderProps {
  title: string;
  children?: ReactNode;
}

export function Header({ title, children }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 bg-stone-100/95 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 backdrop-blur">
      <h1 className="text-3xl font-bold tracking-tight text-stone-900">{title}</h1>
      {children}
    </header>
  );
}
