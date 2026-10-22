import {
  BookOpen,
  ListTodo,
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Aparece direto na barra inferior do celular (os demais ficam em "Mais"). */
  mobilePrimary?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Painel", icon: LayoutDashboard, mobilePrimary: true },
  { href: "/calendario", label: "Calendário", icon: CalendarDays, mobilePrimary: true },
  { href: "/tarefas", label: "Tarefas", icon: ListTodo, mobilePrimary: true },
  { href: "/estudos", label: "Estudos", icon: GraduationCap, mobilePrimary: true },
  { href: "/financas", label: "Finanças", icon: Wallet },
  { href: "/habitos", label: "Hábitos", icon: Target },
  { href: "/leituras", label: "Leituras e Filmes", icon: BookOpen },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
