export type PlatformAdminTab = {
  href: string;
  label: string;
  badgeKey?: "password-resets";
};

export const platformTabs: PlatformAdminTab[] = [
  { href: "/admin/competitions", label: "Competencias" },
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/password-resets", label: "Recuperar clave", badgeKey: "password-resets" },
];
