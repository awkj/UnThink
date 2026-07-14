import { EyeIcon, EyeOffIcon } from "@/ui/components/icons"
import { localize } from "@/nls"
import React, { useState } from "react"
import { desktopStyles } from "@/desktop/theme/main"

interface InputFieldProps {
  type?: "text" | "password" | "url" | undefined
  placeholder?: string | undefined
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  className?: string
  revealable?: boolean | undefined
}

export const InputField: React.FC<InputFieldProps> = ({
  type = "text",
  placeholder,
  value,
  onChange,
  className,
  revealable = false,
}) => {
  const [isRevealed, setIsRevealed] = useState(false)
  const baseClassName = desktopStyles.DefaultInputField
  const canReveal = revealable && type === "password"
  const inputType = canReveal && isRevealed ? "text" : type
  const input = (
    <input
      type={inputType}
      className={`${className || baseClassName} ${canReveal ? desktopStyles.InputFieldRevealPadding : ""}`}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
    />
  )

  if (!canReveal) return input

  const toggleLabel = isRevealed
    ? localize("input.password.hide", "Hide password")
    : localize("input.password.show", "Show password")
  const VisibilityIcon = isRevealed ? EyeOffIcon : EyeIcon

  return (
    <div className={desktopStyles.InputFieldRevealContainer}>
      {input}
      <button
        type="button"
        className={desktopStyles.InputFieldRevealButton}
        onClick={() => setIsRevealed((revealed) => !revealed)}
        aria-label={toggleLabel}
        title={toggleLabel}
      >
        <VisibilityIcon className={desktopStyles.InputFieldRevealIcon} strokeWidth={1.5} />
      </button>
    </div>
  )
}
