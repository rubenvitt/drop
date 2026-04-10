import { HiOutlineArrowRightOnRectangle } from "react-icons/hi2";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/theme-switcher";

interface SessionUser {
  name: string;
  email: string;
}

interface HeaderProps {
  user?: SessionUser | null;
  showAdminLink?: boolean;
  showUploadLink?: boolean;
  onLogout?: () => void;
}

export function Header({
  user,
  showAdminLink,
  showUploadLink,
  onLogout,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            FüKw Dropzone
          </Link>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            Sicherer Dateieingang
          </span>
        </div>

        <div className="flex items-center gap-2">
          {user && (
            <>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {user.name || user.email}
              </span>
              {showAdminLink && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/admin">Freigaben</Link>
                </Button>
              )}
              {showUploadLink && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/app">Upload</Link>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                onClick={onLogout}
                title="Abmelden"
              >
                <HiOutlineArrowRightOnRectangle className="size-4" />
                <span className="sr-only">Abmelden</span>
              </Button>
            </>
          )}
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}
