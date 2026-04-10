"use client"

import {
  HiOutlineCheckCircle,
  HiOutlineInformationCircle,
  HiOutlineExclamationTriangle,
  HiOutlineXCircle,
} from "react-icons/hi2"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useTheme } from "@/components/theme-provider"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <HiOutlineCheckCircle className="size-4" />,
        info: <HiOutlineInformationCircle className="size-4" />,
        warning: <HiOutlineExclamationTriangle className="size-4" />,
        error: <HiOutlineXCircle className="size-4" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
