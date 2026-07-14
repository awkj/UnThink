import AppIntents
import AppKit
import CoreSpotlight
import UniformTypeIdentifiers

struct OpenUnthinkIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Unthink List"
    static let description = IntentDescription("Open Today or Inbox in Unthink.")

    @Parameter(title: "List") var destination: UnthinkDestination

    init() {}
    init(destination: UnthinkDestination) { self.destination = destination }

    func perform() async throws -> some IntentResult {
        await MainActor.run { NSWorkspace.shared.open(destination.url) }
        return .result()
    }
}

struct UnthinkShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenUnthinkIntent(destination: .today),
            phrases: ["Open Today in \(.applicationName)"],
            shortTitle: "Open Today",
            systemImageName: "sun.max"
        )
        AppShortcut(
            intent: OpenUnthinkIntent(destination: .inbox),
            phrases: ["Open Inbox in \(.applicationName)"],
            shortTitle: "Open Inbox",
            systemImageName: "tray"
        )
    }
}

enum UnthinkSpotlightIndexer {
    static func indexNavigationItems() async throws {
        let items = UnthinkDestination.allCases.map { destination in
            let attributes = CSSearchableItemAttributeSet(contentType: .content)
            attributes.title = destination == .today ? "Today" : "Inbox"
            attributes.contentDescription = "Open \(attributes.title ?? "") in Unthink"
            attributes.contentURL = destination.url
            return CSSearchableItem(
                uniqueIdentifier: "unthink.navigation.\(destination.rawValue)",
                domainIdentifier: "unthink.navigation",
                attributeSet: attributes
            )
        }
        try await CSSearchableIndex.default().indexSearchableItems(items)
    }
}

@main
struct UnthinkIntentsExtension: AppIntentsExtension {}
