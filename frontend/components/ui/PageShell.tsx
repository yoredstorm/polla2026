import { Footer } from "@/components/ui/Footer";
import { Navbar } from "@/components/ui/Navbar";
import { cn } from "@/lib/utils";

type MaxWidth = "sm" | "md" | "lg" | "xl" | "full";

const maxWidthClasses: Record<MaxWidth, string> = {
  sm: "max-w-lg",
  md: "max-w-3xl",
  lg: "max-w-5xl",
  xl: "max-w-7xl",
  full: "max-w-full",
};

interface PageShellProps {
  children: React.ReactNode;
  maxWidth?: MaxWidth;
  className?: string;
  mainClassName?: string;
  withMobileNav?: boolean;
  withNavbar?: boolean;
  withFooter?: boolean;
  ambient?: boolean;
}

export function PageShell({
  children,
  maxWidth = "xl",
  className,
  mainClassName,
  withMobileNav = true,
  withNavbar = true,
  withFooter = true,
  ambient = true,
}: PageShellProps) {
  return (
    <div
      className={cn(
        "min-h-screen relative flex flex-col",
        withMobileNav && "page-with-mobile-nav",
        ambient && "bg-ambient-mesh",
        className,
      )}
    >
      {withNavbar && <Navbar />}
      <main
        className={cn(
          "flex-1 mx-auto px-4 py-8 relative z-[1] w-full",
          maxWidthClasses[maxWidth],
          mainClassName,
        )}
      >
        {children}
      </main>
      {withFooter && <Footer />}
    </div>
  );
}

