import { ItemGroup } from "@/desktop/components/settings/ItemGroup"
import { SettingsContent } from "@/desktop/components/settings/SettingsContent/SettingsContent"
import { SettingsItem } from "@/desktop/components/settings/SettingsItem"
import { SettingsSection } from "@/desktop/components/settings/SettingsSection"
import { useConfig } from "@/ui/hooks/useConfig"
import { localize } from "@/nls"
import {
  aiApiTokenConfigKey,
  aiApiUrlConfigKey,
  aiModelNameConfigKey,
  hideAIEntryConfigKey,
} from "@/services/config/config"
import React from "react"

export const AISettings: React.FC = () => {
  const { value: apiUrl, setValue: setApiUrl } = useConfig(aiApiUrlConfigKey())
  const { value: apiToken, setValue: setApiToken } = useConfig(aiApiTokenConfigKey())
  const { value: modelName, setValue: setModelName } = useConfig(aiModelNameConfigKey())
  const { value: hideAIEntry, setValue: setHideAIEntry } = useConfig(hideAIEntryConfigKey())

  return (
    <SettingsContent title={localize("settings.ai", "AI Assistant")}>
      <SettingsSection title={localize("settings.ai.display", "Display")}>
        <ItemGroup>
          <SettingsItem
            title={localize("settings.ai.show_entry", "Show AI Chat in Sidebar")}
            description={localize(
              "settings.ai.show_entry.description",
              "Control whether the AI Chat entry is shown in the sidebar.",
            )}
            action={{
              type: "switch",
              currentValue: !hideAIEntry,
              onChange: (showAIEntry) => setHideAIEntry(!showAIEntry),
            }}
          />
        </ItemGroup>
      </SettingsSection>
      <SettingsSection title={localize("settings.ai.api", "API")}>
        <ItemGroup>
          <SettingsItem
            title={localize("settings.ai.api_url", "API URL")}
            description={localize("settings.ai.api_url.description", "OpenAI compatible API endpoint URL")}
            action={{
              type: "input",
              inputType: "url",
              placeholder: "https://api.deepseek.com",
              currentValue: apiUrl,
              onChange: setApiUrl,
            }}
          />
          <SettingsItem
            title={localize("settings.ai.api_token", "API Token")}
            description={localize("settings.ai.api_token.description", "Your API authentication token")}
            action={{
              type: "input",
              inputType: "password",
              revealable: true,
              placeholder: localize("settings.ai.api_token.placeholder", "Enter your API token"),
              currentValue: apiToken,
              onChange: setApiToken,
            }}
          />
          <SettingsItem
            title={localize("settings.ai.model_name", "Model Name")}
            description={localize(
              "settings.ai.model_name.description",
              "The AI model to use (e.g., deepseek-v4-pro, gpt-4, gpt-4o)",
            )}
            action={{
              type: "input",
              inputType: "text",
              placeholder: "deepseek-v4-pro",
              currentValue: modelName,
              onChange: setModelName,
            }}
          />
        </ItemGroup>
      </SettingsSection>
    </SettingsContent>
  )
}
