import SwiftUI
import WidgetKit

struct UnthinkWidgetEntry: TimelineEntry {
    let date: Date
}

struct UnthinkWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> UnthinkWidgetEntry { .init(date: .now) }
    func getSnapshot(in context: Context, completion: @escaping (UnthinkWidgetEntry) -> Void) {
        completion(.init(date: .now))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<UnthinkWidgetEntry>) -> Void) {
        completion(Timeline(entries: [.init(date: .now)], policy: .after(.now.addingTimeInterval(900))))
    }
}

struct UnthinkWidgetView: View {
    var entry: UnthinkWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Unthink").font(.headline)
            Link(destination: UnthinkDestination.today.url) { Label("Today", systemImage: "sun.max") }
            Link(destination: UnthinkDestination.inbox.url) { Label("Inbox", systemImage: "tray") }
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

@main
struct UnthinkWidget: Widget {
    let kind = "UnthinkWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: UnthinkWidgetProvider()) { entry in
            UnthinkWidgetView(entry: entry)
        }
        .configurationDisplayName("Unthink")
        .description("Jump to Today or Inbox.")
        .supportedFamilies([.systemSmall])
    }
}
