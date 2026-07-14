import AppIntents
import Foundation

enum UnthinkDestination: String, AppEnum, CaseIterable {
    case today
    case inbox

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Unthink List")
    static let caseDisplayRepresentations: [Self: DisplayRepresentation] = [
        .today: "Today",
        .inbox: "Inbox",
    ]

    var url: URL {
        URL(string: "unthink://navigate/\(rawValue)")!
    }
}
