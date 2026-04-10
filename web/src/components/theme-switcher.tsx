import { HiOutlineSun, HiOutlineMoon, HiOutlineComputerDesktop } from "react-icons/hi2";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9">
          <HiOutlineSun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <HiOutlineMoon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Design wechseln</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className={theme === "light" ? "font-semibold" : ""}
        >
          <HiOutlineSun className="mr-2 size-4" />
          Hell
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className={theme === "dark" ? "font-semibold" : ""}
        >
          <HiOutlineMoon className="mr-2 size-4" />
          Dunkel
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className={theme === "system" ? "font-semibold" : ""}
        >
          <HiOutlineComputerDesktop className="mr-2 size-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
